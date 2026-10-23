import { constants, type Stats } from "node:fs";
import { lstat, open, readdir, realpath, stat, type FileHandle } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { setImmediate as yieldToIO } from "node:timers/promises";
import { decodeResourceId, WorkspaceError, type ProjectResource, type SessionCollection, type SessionListItem } from "../shared/workspace-contract";
import type { SessionSummary } from "../shared/types";
import { SessionSummaryAccumulator } from "./session-summary";
import { parseSessionRecord, type SessionRecord } from "./session-record";

export type SessionListChunkReader = (handle: FileHandle, buffer: Buffer, length: number, position: number) => Promise<number>;
interface ReaderOptions { readChunk?: SessionListChunkReader }
interface Transcript extends SessionSummary { collection: SessionCollection }
interface Inventory { path: string; root: string; collection: SessionCollection }
const collections = ["active", "archived", "trash"] as const;
const changed = () => new WorkspaceError("session_list_changed", "Session history changed during inspection. Refresh and retry.");
const ownership = () => new WorkspaceError("session_list_ownership", "Session history or metadata ownership is unsafe. Check its paths and retry.");

/** Exact project snapshots, shared only while pending; no persistent or completed-result cache. */
export class SessionListReader {
  private readonly pending = new Map<string, Promise<SessionListItem[]>>();
  private readonly epochs = new Map<string, number>();
  private readonly readChunk: SessionListChunkReader;
  constructor(options: ReaderOptions = {}) {
    this.readChunk = options.readChunk ?? (async (handle, buffer, length, position) => (await handle.read(buffer, 0, length, position)).bytesRead);
  }
  invalidate(projectId: string) { this.epochs.set(projectId, (this.epochs.get(projectId) ?? 0) + 1); }

  async read(project: ProjectResource): Promise<SessionListItem[]> {
    if (project.capability.state === "unavailable") throw new WorkspaceError("project_unavailable", "Registered project directory is unavailable or has moved.", 404, { projectId: project.id });
    try {
      if (await realpath(project.path) !== project.path) throw ownership();
      const identity = await stat(project.path);
      if (!identity.isDirectory()) throw ownership();
      const key = JSON.stringify([project.id, project.path, identity.dev, identity.ino, this.epochs.get(project.id) ?? 0]);
      const existing = this.pending.get(key);
      if (existing) return await existing;
      const operation = this.scan(project, identity);
      this.pending.set(key, operation);
      try { return await operation; }
      finally { if (this.pending.get(key) === operation) this.pending.delete(key); }
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError("session_list_unavailable", "Cannot read this project's session list. Check history and metadata availability, then retry.", 409, { projectId: project.id });
    }
  }

  private async scan(project: ProjectResource, identity: Stats): Promise<SessionListItem[]> {
    const directories = new Map<string, Stats>([[project.path, identity]]);
    const inventory: Inventory[] = [];
    const sessionRoot = join(project.path, ".kiva", "sessions");
    const visit = async (directory: string, root: string, collection: SessionCollection, skipHidden: boolean): Promise<void> => {
      const before = await ownedPath(project.path, directory, true);
      if (!before) return;
      if (!before.isDirectory()) throw ownership();
      directories.set(directory, before);
      const entries = await readdir(directory, { withFileTypes: true });
      for (let index = 0; index < entries.length; index++) {
        if (index % 128 === 127) await yieldToIO();
        const entry = entries[index];
        if (skipHidden && entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path, root, collection, false);
        else if (entry.name.endsWith(".jsonl")) {
          if (!entry.isFile()) throw ownership();
          inventory.push({ path, root, collection });
        }
      }
    };
    for (const collection of collections) {
      const root = collection === "active" ? sessionRoot : join(sessionRoot, collection === "archived" ? ".archive" : ".trash");
      await visit(root, root, collection, collection === "active");
    }
    const metadataRoot = join(project.path, ".kiva", "web", "sessions");
    const metadata: string[] = [];
    const metadataIdentity = await ownedPath(project.path, metadataRoot, true);
    if (metadataIdentity) {
      if (!metadataIdentity.isDirectory()) throw ownership();
      directories.set(metadataRoot, metadataIdentity);
      for (const entry of await readdir(metadataRoot, { withFileTypes: true })) {
        if (!entry.name.endsWith(".json")) continue;
        if (!entry.isFile() || entry.isSymbolicLink()) throw new WorkspaceError("metadata_ownership", "Session metadata must be an owned regular file.");
        metadata.push(join(metadataRoot, entry.name));
      }
    }
    const transcripts = await mapBounded(inventory, async (file) => {
      const accumulator = new SessionSummaryAccumulator(file.path, file.root);
      const captured = await this.consumeFile(project.path, file.path, (line) => accumulator.consume(line));
      return { ...accumulator.finish(captured.mtime.toISOString()), collection: file.collection };
    });
    const records = await mapBounded(metadata, async (path) => {
      const lines: string[] = [];
      await this.consumeFile(project.path, path, (line) => lines.push(line));
      return parseSessionRecord(lines.join("\n"), project.id, basename(path));
    });
    for (const [path, before] of directories) {
      const after = await ownedPath(project.path, path);
      if (!after || before.dev !== after.dev || before.ino !== after.ino) throw changed();
    }
    if (await realpath(project.path) !== project.path) throw ownership();
    // Match the legacy catalog's per-collection timestamp order before metadata
    // overrides are merged, including stable ordering when final times tie.
    transcripts.sort((left, right) => collections.indexOf(left.collection) - collections.indexOf(right.collection) || right.updatedAt.localeCompare(left.updatedAt));
    return merge(project, transcripts, records);
  }

  private async consumeFile(root: string, path: string, consume: (line: string) => void): Promise<Stats> {
    const before = await ownedPath(root, path);
    if (!before?.isFile()) throw ownership();
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const captured = await handle.stat(), opened = await ownedPath(root, path);
      if (!captured.isFile() || !opened || !sameFile(captured, before) || !sameFile(captured, opened)) throw ownership();
      const chunk = Buffer.allocUnsafe(64 * 1024);
      let position = 0, fragments: Buffer[] = [], fragmentBytes = 0;
      const part = (buffer: Buffer, complete: boolean) => {
        if (buffer.length) { fragments.push(Buffer.from(buffer)); fragmentBytes += buffer.length; }
        if (!complete) return;
        if (fragmentBytes) consume(Buffer.concat(fragments, fragmentBytes).toString("utf8"));
        fragments = []; fragmentBytes = 0;
      };
      while (position < captured.size) {
        const bytes = await this.readChunk(handle, chunk, Math.min(chunk.length, captured.size - position), position);
        if (!bytes) throw changed();
        let start = 0;
        for (let index = 0; index < bytes; index++) if (chunk[index] === 10) { part(chunk.subarray(start, index), true); start = index + 1; }
        part(chunk.subarray(start, bytes), false);
        position += bytes;
        await yieldToIO();
      }
      part(Buffer.alloc(0), true);
      const after = await handle.stat(), current = await ownedPath(root, path);
      if (!current || !sameFile(captured, current) || after.size < captured.size || after.size === captured.size && after.mtimeMs !== captured.mtimeMs) throw changed();
      return captured;
    } finally { await handle.close(); }
  }
}

function sameFile(left: Stats, right: Stats) { return left.dev === right.dev && left.ino === right.ino; }
async function ownedPath(root: string, path: string, allowMissing = false): Promise<Stats | undefined> {
  const within = relative(root, path);
  if (within === ".." || within.startsWith(`..${sep}`)) throw ownership();
  let current = root;
  let found = await lstat(root);
  if (found.isSymbolicLink() || await realpath(root) !== root) throw ownership();
  for (const part of within ? within.split(sep) : []) {
    current = join(current, part);
    try { found = await lstat(current); }
    catch (error) {
      if (allowMissing && error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
    if (found.isSymbolicLink()) throw ownership();
  }
  if (await realpath(path) !== path) throw ownership();
  return found;
}

async function mapBounded<T, R>(items: readonly T[], transform: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await transform(items[index]); }
  });
  // Keep failed snapshots pending until all descriptor-owning workers have closed.
  const settled = await Promise.allSettled(workers);
  for (const item of settled) if (item.status === "rejected") throw item.reason;
  return result;
}

function merge(project: ProjectResource, transcripts: Transcript[], records: SessionRecord[]): SessionListItem[] {
  const projectId = project.id;
  const histories = new Map<string, Transcript>();
  for (const transcript of transcripts) {
    decodeResourceId(transcript.id);
    if (histories.has(transcript.id)) throw new WorkspaceError("ambiguous_session", "Multiple transcripts have the same ID; repair the duplicate before opening it.", 409, { projectId, sessionId: transcript.id });
    histories.set(transcript.id, transcript);
  }
  const metadata = new Map(records.map((record) => [record.id, record]));
  const ids = new Set([...histories.keys(), ...metadata.keys()]);
  return [...ids].map((id): SessionListItem => {
    const transcript = histories.get(id), record = metadata.get(id);
    const collection = transcript?.collection ?? record!.collection;
    const workspace = record?.workspace;
    const capability = project.capability;
    const listWorkspace = workspace ? {
      mode: workspace.mode, state: workspace.state, executionRoot: workspace.executionRoot, treeRoot: workspace.treeRoot,
      branch: workspace.mode === "current-branch" && capability.state === "ready" && project.path === workspace.executionRoot
        && capability.repositoryRoot === workspace.repositoryRoot && capability.commonDirectory === workspace.commonDirectory ? capability.branch : workspace.branch,
    } : undefined;
    const deletion = record?.deletion ? { ...record.deletion } : undefined;
    if (deletion && collection === "trash") deletion.history = "trashed";
    return {
      id, projectId, path: transcript?.path ?? "", name: record?.nameOverride ?? transcript?.name ?? record!.name,
      preview: transcript?.preview ?? record!.preview,
      updatedAt: record && (!transcript || record.updatedAt > transcript.updatedAt) ? record.updatedAt : transcript!.updatedAt,
      createdAt: record?.createdAt ?? transcript!.updatedAt, persisted: !!transcript, collection, legacy: !workspace,
      sourceSessionId: record?.sourceSessionId, deletion,
      workspace: listWorkspace,
    };
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
