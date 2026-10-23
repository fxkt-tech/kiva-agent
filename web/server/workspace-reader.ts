import { execFile } from "node:child_process";
import { readdir, realpath, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { WorkspaceChangesData, WorkspaceData } from "../shared/types";
import { WorkspaceError, type GitCapability } from "../shared/workspace-contract";

interface GitReadOptions { timeoutMs: number; maxBuffer: number }
export type WorkspaceGitRunner = (root: string, args: string[], options: GitReadOptions) => Promise<string>;
interface WorkspaceReaderOptions extends Partial<GitReadOptions> { runGit?: WorkspaceGitRunner }
type WorkspaceProjection = { view: "files"; data: WorkspaceData } | { view: "changes"; data: WorkspaceChangesData };

/** Argument arrays and NUL output preserve literal filenames. No optional index refresh writes. */
export const runWorkspaceGit: WorkspaceGitRunner = (root, args, options) => new Promise((resolve, reject) => {
  execFile("git", args, { cwd: root, encoding: "utf8", timeout: options.timeoutMs, maxBuffer: options.maxBuffer, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stderr, stdout }));
    else resolve(stdout);
  });
});

function field(error: unknown, key: string): unknown {
  return typeof error === "object" && error !== null && key in error ? Reflect.get(error, key) : undefined;
}

function readError(error: unknown): WorkspaceError {
  if (error instanceof WorkspaceError) return error;
  if (field(error, "code") === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return new WorkspaceError("workspace_read_too_large", "Workspace listing exceeds the supported output size.", 413);
  if (field(error, "killed") === true) return new WorkspaceError("workspace_read_timeout", "Workspace inspection timed out; retry after checking repository health.", 503);
  return new WorkspaceError("workspace_read_failed", "Unable to inspect this workspace; check its permissions and Git state, then retry.");
}

/** Only in-flight enumeration is shared. Callers must resolve project/session ownership first. */
export class WorkspaceReader {
  private readonly pending = new Map<string, Promise<WorkspaceProjection>>();
  private readonly runGit: WorkspaceGitRunner;
  private readonly options: GitReadOptions;

  constructor(options: WorkspaceReaderOptions = {}) {
    this.runGit = options.runGit ?? runWorkspaceGit;
    this.options = { timeoutMs: options.timeoutMs ?? 15_000, maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024 };
  }

  async read(root: string, capability?: GitCapability): Promise<WorkspaceData> {
    const result = await this.readProjection(root, capability, "files");
    if (result.view !== "files") throw new Error("Unexpected workspace projection");
    return result.data;
  }

  async readChanges(root: string, capability?: GitCapability): Promise<WorkspaceChangesData> {
    const result = await this.readProjection(root, capability, "changes");
    return result.data;
  }

  private async readProjection(root: string, capability: GitCapability | undefined, view: "files" | "changes"): Promise<WorkspaceProjection> {
    try {
      if (capability?.state === "unavailable") throw new WorkspaceError("project_unavailable", "Registered project directory is unavailable or has moved", 404);
      const canonical = await realpath(root);
      const identity = await stat(canonical);
      if (!identity.isDirectory()) throw new WorkspaceError("workspace_unavailable", "Workspace directory is unavailable", 404);
      const mode = capability?.state === "non-git" || capability?.state === "missing-git" ? "filesystem" : capability ? "git" : "probe";
      const key = JSON.stringify([canonical, identity.dev, identity.ino, mode, view]);
      const existing = this.pending.get(key);
      if (existing) return await existing;
      const operation = this.load(canonical, mode, view).then(async (data) => {
        const current = await stat(canonical);
        if (await realpath(root) !== canonical || current.dev !== identity.dev || current.ino !== identity.ino) throw new WorkspaceError("workspace_replaced", "Workspace directory changed during inspection; reload before retrying.");
        return data;
      }).catch((error: unknown) => { throw readError(error); });
      this.pending.set(key, operation);
      try { return await operation; }
      finally { if (this.pending.get(key) === operation) this.pending.delete(key); }
    } catch (error) { throw readError(error); }
  }

  private async load(root: string, mode: "filesystem" | "git" | "probe", view: "files" | "changes"): Promise<WorkspaceProjection> {
    if (mode === "probe") {
      try { await this.runGit(root, ["rev-parse", "--is-inside-work-tree"], this.options); }
      catch (error) {
        const stderr = field(error, "stderr");
        if (field(error, "code") === "ENOENT" || field(error, "code") === 128 && typeof stderr === "string" && stderr.startsWith("fatal: not a git repository")) mode = "filesystem";
        else throw error;
      }
    }
    if (mode === "filesystem") return view === "files"
      ? { view, data: this.data(root, "detached", await this.listFiles(root), []) }
      : { view, data: this.changesData(root, "detached", []) };
    const results = await Promise.allSettled([
      this.runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."], this.options),
      this.runGit(root, ["rev-parse", "--show-prefix"], this.options),
      this.runGit(root, ["branch", "--show-current"], this.options),
      ...(view === "files" ? [this.runGit(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], this.options)] : []),
    ]);
    const values: string[] = [];
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      values.push(result.value);
    }
    const [status, rawPrefix, rawBranch, listing] = values;
    const prefix = rawPrefix.replace(/\r?\n$/, "");
    const changes: WorkspaceData["project"]["changes"] = [];
    const records = status.split("\0");
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (record.length < 4) continue;
      const state = record.slice(0, 2), destination = record.slice(3);
      // Porcelain -z emits destination followed by a separate source for renames/copies.
      const source = /[RC]/.test(state) ? records[++index] : undefined;
      if (destination.startsWith(prefix)) changes.push({ status: state.trim() || "M", path: destination.slice(prefix.length) });
      else if (source?.startsWith(prefix) && state.includes("R")) changes.push({ status: "D", path: source.slice(prefix.length) });
    }
    const branch = rawBranch.trim() || "detached";
    return view === "files"
      ? { view, data: this.data(root, branch, [...new Set(listing.split("\0").filter(Boolean))], changes) }
      : { view, data: this.changesData(root, branch, changes) };
  }

  private changesData(root: string, branch: string, changes: WorkspaceData["project"]["changes"]): WorkspaceChangesData {
    return { renderedAt: new Date().toISOString(), project: { name: basename(root), path: root, branch, dirtyFiles: changes.length, changes } };
  }

  private data(root: string, branch: string, files: string[], changes: WorkspaceData["project"]["changes"]): WorkspaceData {
    return { renderedAt: new Date().toISOString(), project: { name: basename(root), path: root, branch, dirtyFiles: changes.length, files, changes } };
  }

  private async listFiles(root: string): Promise<string[]> {
    const ignored = new Set([".git", ".kiva", ".next", "node_modules"]);
    const files: string[] = [];
    const deadline = Date.now() + this.options.timeoutMs;
    let bytes = 0;
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (Date.now() > deadline) throw new WorkspaceError("workspace_read_timeout", "Workspace inspection timed out; retry after checking directory health.", 503);
        if (ignored.has(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile()) {
          const name = relative(root, path);
          bytes += Buffer.byteLength(name) + 1;
          if (bytes > this.options.maxBuffer) throw new WorkspaceError("workspace_read_too_large", "Workspace listing exceeds the supported output size.", 413);
          files.push(name);
        }
      }
    };
    await visit(root);
    return files;
  }
}
