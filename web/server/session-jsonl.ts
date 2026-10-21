import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readdirSync, readSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { SessionJsonlDocument } from "../shared/session-jsonl";
import { WorkspaceError, type ResourceTarget } from "../shared/workspace-contract";
import type { SessionCatalog, SessionCollection } from "./session-catalog";

export const SESSION_JSONL_MAX_BYTES = 8 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;

/** Same identity rule as SessionCatalog, without reading/projecting whole histories into memory. */
export function readSessionJsonl(catalog: SessionCatalog, target: Required<ResourceTarget>): SessionJsonlDocument | undefined {
  let found: SessionJsonlDocument | undefined;
  try {
    for (const collection of ["active", "archived", "trash"] as const) {
      // The catalog, not a client path, owns each collection's path boundary.
      const root = dirname(catalog.absolutePath("__jsonl_boundary__.jsonl", collection));
      if (!existsSync(root)) continue;
      for (const path of files(root, collection === "active", target)) {
        const ownedPath = catalog.absolutePath(relative(root, path), collection);
        const candidate = inspect(ownedPath, catalog, collection, relative(root, path), target);
        if (!candidate) continue;
        if (found) throw new WorkspaceError("ambiguous_session", "Multiple transcripts have the same ID; repair the duplicate before opening it.", 409, target);
        found = candidate;
      }
    }
    return found;
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError("session_jsonl_unavailable", "Cannot safely read this session's history. Check its file ownership and availability, then retry.", 409, target);
  }
}

function* files(root: string, skipHidden: boolean, target: ResourceTarget): Generator<string> {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (skipHidden && entry.name.startsWith(".")) continue;
    if (entry.isSymbolicLink()) throw new WorkspaceError("session_jsonl_ownership", "Session history must not contain symlinks. Repair its ownership before previewing it.", 409, target);
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* files(path, false, target);
    else if (entry.name.endsWith(".jsonl")) {
      if (!entry.isFile()) throw new WorkspaceError("session_jsonl_ownership", "Session history must be a regular file. Repair its ownership before previewing it.", 409, target);
      yield path;
    }
  }
}

function inspect(path: string, catalog: SessionCatalog, collection: SessionCollection, catalogPath: string, target: Required<ResourceTarget>): SessionJsonlDocument | undefined {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new WorkspaceError("session_jsonl_ownership", "Session history must be an owned regular file.", 409, target);
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const snapshot = fstatSync(descriptor);
    // Revalidate after open so an ancestor/target substitution cannot redirect the read.
    const ownedPath = catalog.absolutePath(catalogPath, collection);
    const after = lstatSync(ownedPath);
    if (!snapshot.isFile() || realpathSync(ownedPath) !== ownedPath || snapshot.dev !== before.dev || snapshot.ino !== before.ino || snapshot.dev !== after.dev || snapshot.ino !== after.ino) {
      throw new WorkspaceError("session_jsonl_ownership", "Session history ownership changed. Check the file and retry.", 409, target);
    }
    const prefix = Buffer.allocUnsafe(Math.min(snapshot.size, SESSION_JSONL_MAX_BYTES));
    const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let position = 0;
    let id = basename(path, ".jsonl");
    let fragments: Buffer[] = [];
    let lineBytes = 0;
    const consume = (part: Buffer, complete: boolean) => {
      lineBytes += part.length;
      if (lineBytes > SESSION_JSONL_MAX_BYTES) throw new WorkspaceError("jsonl_line_too_large", "A history line exceeds the 8 MiB preview identity-check limit. Split or repair the oversized record before previewing this history.", 409, target);
      if (part.length) fragments.push(Buffer.from(part));
      if (!complete) return;
      if (lineBytes) {
        try {
          const entry: unknown = JSON.parse(Buffer.concat(fragments, lineBytes).toString("utf8"));
          if (entry && typeof entry === "object" && "type" in entry && entry.type === "session" && "id" in entry && typeof entry.id === "string") id = entry.id;
        } catch {
          // Malformed/partially-written records remain unchanged in the raw preview.
        }
      }
      fragments = []; lineBytes = 0;
    };
    while (position < snapshot.size) {
      // Explicit offsets and the initial size cap also bound reads during concurrent appends.
      const count = readSync(descriptor, chunk, 0, Math.min(chunk.length, snapshot.size - position), position);
      if (!count) throw new WorkspaceError("session_jsonl_changed", "Session history changed while being read. Retry the preview.", 409, target);
      if (position < prefix.length) chunk.copy(prefix, position, 0, Math.min(count, prefix.length - position));
      let start = 0;
      for (let index = 0; index < count; index++) {
        if (chunk[index] !== 10) continue;
        consume(chunk.subarray(start, index), true);
        start = index + 1;
      }
      consume(chunk.subarray(start, count), false);
      position += count;
    }
    consume(Buffer.alloc(0), true);
    if (id !== target.sessionId) return undefined;
    const truncated = snapshot.size > prefix.length;
    // Prefer complete records on a truncated preview. Preserve all raw bytes otherwise.
    const newline = truncated ? prefix.lastIndexOf(10) : -1;
    const bytes = newline >= 0 ? prefix.subarray(0, newline + 1) : prefix;
    let content: string;
    try {
      // Keep a BOM if present; never silently replace invalid bytes with different raw text.
      const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
      content = decoder.decode(bytes, { stream: truncated });
    } catch {
      throw new WorkspaceError("session_jsonl_encoding", "Session history is not valid UTF-8. Check its encoding or retry after the current write completes.", 409, target);
    }
    return { ...target, fileName: basename(path), content, bytes: Buffer.byteLength(content, "utf8"), totalBytes: snapshot.size, truncated };
  } finally { closeSync(descriptor); }
}
