import { open, lstat, realpath, stat } from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import { isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { WorkspaceError } from "../shared/workspace-contract";
import { runWorkspaceGit, type WorkspaceGitRunner } from "./workspace-reader";

const MAX_FILE_BYTES = 2_000_000;
interface ProjectPath { originalRoot: string; root: string; path: string; identity: Stats }
interface DiffDocument { path: string; content: string }
interface DiffReaderOptions { runGit?: WorkspaceGitRunner; timeoutMs?: number; maxBuffer?: number }

export async function readProjectFile(projectRoot: string, relativePath: string) {
  const target = await projectPath(projectRoot, relativePath);
  const file = await readText(target, Number.POSITIVE_INFINITY, MAX_FILE_BYTES);
  await validateTarget(target, relativePath);
  return { path: relativePath, ...file };
}

/** Transport-owned sharing of validated reads only; completed patches are never cached. */
export class ProjectDiffReader {
  private readonly pending = new Map<string, Promise<DiffDocument>>();
  private readonly runGit: WorkspaceGitRunner;
  private readonly timeoutMs: number;
  private readonly maxBuffer: number;

  constructor(options: DiffReaderOptions = {}) {
    this.runGit = options.runGit ?? runWorkspaceGit;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxBuffer = options.maxBuffer ?? MAX_FILE_BYTES;
  }

  async read(projectRoot: string, relativePath: string): Promise<DiffDocument> {
    const deadline = Date.now() + this.timeoutMs;
    const target = await projectPath(projectRoot, relativePath);
    checkDeadline(deadline);
    const key = JSON.stringify([target.root, target.identity.dev, target.identity.ino, relativePath]);
    const existing = this.pending.get(key);
    if (existing) {
      const result = await existing;
      await validateTarget(target, relativePath);
      checkDeadline(deadline);
      return result;
    }
    const operation = this.load(target, relativePath, deadline).then(async (result) => {
      await validateTarget(target, relativePath);
      checkDeadline(deadline);
      return result;
    }).catch((error: unknown) => { throw diffError(error); });
    this.pending.set(key, operation);
    try { return await operation; }
    finally { if (this.pending.get(key) === operation) this.pending.delete(key); }
  }

  private async git(target: ProjectPath, args: string[], deadline: number): Promise<string> {
    checkDeadline(deadline);
    let output: string;
    try { output = await this.runGit(target.root, ["--literal-pathspecs", ...args], { timeoutMs: Math.max(1, deadline - Date.now()), maxBuffer: this.maxBuffer }); }
    catch (error) {
      if (field(error, "code") === "ENOENT") throw new WorkspaceError("diff_requires_git", "Git changes require a readable Git repository. Prepare Git before browsing changes.");
      throw error;
    }
    checkDeadline(deadline);
    if (Buffer.byteLength(output) > this.maxBuffer) throw new WorkspaceError("diff_too_large", "Diff is larger than 2 MB", 413);
    return output;
  }

  private async load(target: ProjectPath, relativePath: string, deadline: number): Promise<DiffDocument> {
    let content: string | undefined, missingHead = false;
    try { content = await this.git(target, ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--", relativePath], deadline); }
    catch (error) {
      if (typeof field(error, "code") !== "number" || field(error, "stdout")) throw error;
      // Only a proven absent HEAD permits the pre-existing untracked/no-HEAD compatibility path.
      try { await this.git(target, ["rev-parse", "--verify", "--quiet", "HEAD"], deadline); }
      catch (headError) {
        if (field(headError, "code") === 1) missingHead = true;
        else if (headError instanceof WorkspaceError || field(headError, "killed") || field(headError, "code") === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw headError;
        else throw new WorkspaceError("diff_requires_git", "Git changes require a readable Git repository. Prepare Git before browsing changes.");
      }
      if (!missingHead) throw error;
    }
    if (content) return { path: relativePath, content };
    const status = await this.git(target, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", relativePath], deadline);
    if (status.startsWith("?? ")) {
      const file = await readText(target, deadline, Math.min(MAX_FILE_BYTES, this.maxBuffer));
      checkDeadline(deadline);
      const header = `diff --git a/${relativePath} b/${relativePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${relativePath}\n`;
      let addedBytes = 1;
      for (const character of file.content) if (character === "\n") addedBytes++;
      if (Buffer.byteLength(header) + Buffer.byteLength(file.content) + addedBytes > this.maxBuffer) throw new WorkspaceError("diff_too_large", "Diff is larger than 2 MB", 413);
      return { path: relativePath, content: header + "+" + file.content.replace(/\n/g, "\n+") };
    }
    if (missingHead) throw new WorkspaceError("diff_requires_head", "Create the first Git commit before browsing tracked changes.");
    return { path: relativePath, content: "该文件没有可显示的文本差异。" };
  }
}

/** Standalone compatibility helper; production composition owns its reader explicitly. */
export function readProjectDiff(projectRoot: string, relativePath: string) {
  return new ProjectDiffReader().read(projectRoot, relativePath);
}

function field(error: unknown, key: string): unknown {
  return typeof error === "object" && error !== null && key in error ? Reflect.get(error, key) : undefined;
}
function diffError(error: unknown): Error {
  if (error instanceof WorkspaceError) return error;
  if (field(error, "code") === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return new WorkspaceError("diff_too_large", "Diff is larger than 2 MB", 413);
  if (field(error, "killed") === true) return new WorkspaceError("diff_timeout", "Diff inspection timed out; retry after checking repository health.", 503);
  return new WorkspaceError("diff_read_failed", "Unable to read Git diff; check repository state and permissions, then retry.");
}
function checkDeadline(deadline: number) {
  if (Date.now() >= deadline) throw new WorkspaceError("diff_timeout", "Diff inspection timed out; retry after checking repository health.", 503);
}

async function readText(target: ProjectPath, deadline: number, maxBytes: number) {
  checkDeadline(deadline);
  const current = await stat(target.path);
  if (!current.isFile()) throw new WorkspaceError("file_not_regular", "Project path is not a file");
  // Nonblocking open also prevents a replacement FIFO from hanging between stat and open.
  const handle = await open(target.path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const identity = await handle.stat();
    if (!identity.isFile()) throw new WorkspaceError("file_not_regular", "Project path is not a file");
    if (identity.size > maxBytes) throw new WorkspaceError("file_too_large", "File is larger than 2 MB", 413);
    const chunks: Buffer[] = [];
    let bytes = 0;
    while (bytes <= maxBytes) {
      checkDeadline(deadline);
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - bytes));
      const read = await handle.read(buffer, 0, buffer.length, bytes);
      checkDeadline(deadline);
      if (!read.bytesRead) break;
      chunks.push(buffer.subarray(0, read.bytesRead));
      bytes += read.bytesRead;
    }
    if (bytes > maxBytes) throw new WorkspaceError("file_too_large", "File is larger than 2 MB", 413);
    const content = Buffer.concat(chunks, bytes);
    if (content.includes(0)) throw new WorkspaceError("file_binary", "Binary files cannot be previewed as text");
    // The opened file must still be the path we validated, even after async IO.
    const current = await stat(target.path);
    if (current.dev !== identity.dev || current.ino !== identity.ino) throw new WorkspaceError("workspace_replaced", "Project file changed during inspection; retry.");
    return { content: content.toString("utf8"), size: bytes };
  } finally { await handle.close(); }
}

async function projectPath(projectRoot: string, relativePath: string): Promise<ProjectPath> {
  validateRelativePath(relativePath);
  const root = await realpath(projectRoot), identity = await stat(root);
  if (!identity.isDirectory()) throw new Error("Project root is not a directory");
  const candidate = resolve(root, relativePath);
  assertContained(root, candidate);
  // Deleted diff targets may be absent; all existing ancestors must remain inside root.
  let ancestor = root;
  for (const part of relative(root, candidate).split(sep)) {
    ancestor = join(ancestor, part);
    try { await lstat(ancestor); }
    catch (error) { if (field(error, "code") === "ENOENT") break; throw error; }
    assertContained(root, await realpath(ancestor));
  }
  return { originalRoot: projectRoot, root, path: candidate, identity };
}

async function validateTarget(target: ProjectPath, relativePath: string) {
  const current = await projectPath(target.originalRoot, relativePath);
  if (current.root !== target.root || current.identity.dev !== target.identity.dev || current.identity.ino !== target.identity.ino) throw new WorkspaceError("workspace_replaced", "Workspace directory changed during inspection; reload before retrying.");
}

function assertContained(root: string, path: string) {
  const within = relative(root, path);
  if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new Error("Project path escapes the active project");
}

function validateRelativePath(path: string) {
  let decoded = path;
  // Query decoding belongs to transport; reject nested encodings with traversal meaning.
  for (let depth = 0; depth < 5; depth++) {
    if (!decoded || decoded.includes("\0") || decoded.includes("\\") || isAbsolute(decoded) || win32.isAbsolute(decoded)
      || decoded.split("/").some((part) => part === ".." || part === ".")) throw new Error("Project path escapes the active project or is invalid");
    if (!/%[0-9a-f]{2}/i.test(decoded)) return;
    let next: string;
    try { next = decodeURIComponent(decoded); } catch { throw new Error("Invalid project path encoding"); }
    if (next === decoded) return;
    decoded = next;
  }
  throw new Error("Invalid nested project path encoding");
}
