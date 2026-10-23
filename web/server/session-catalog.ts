import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SessionSummary } from "../shared/types";
import { SessionSummaryAccumulator } from "./session-summary";
import { decodeResourceId, WorkspaceError } from "../shared/workspace-contract";

export type SessionCollection = "active" | "archived" | "trash";

export class SessionCatalog {
  private readonly sessionRoot: string;
  private readonly archiveRoot: string;
  private readonly trashRoot: string;

  constructor(repoRoot: string) {
    this.sessionRoot = resolve(realpathSync(repoRoot), ".kiva", "sessions");
    this.archiveRoot = join(this.sessionRoot, ".archive");
    this.trashRoot = join(this.sessionRoot, ".trash");
  }

  list(collection: SessionCollection): SessionSummary[] {
    const root = this.collectionRoot(collection);
    if (!existsSync(root)) return [];
    assertNoSymlinkAncestor(root);
    return listSessionFiles(root, collection === "active")
      .map((path) => readSession(path, root))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  all() { return (["active", "archived", "trash"] as const).flatMap((collection) => this.list(collection).map((session) => ({ ...session, collection, absolutePath: this.absolutePath(session.path, collection) }))); }

  find(id: string) {
    decodeResourceId(id);
    const matches = this.all().filter((entry) => entry.id === id);
    if (matches.length > 1) throw new WorkspaceError("ambiguous_session", "More than one transcript has this ID; repair the duplicate before opening it.");
    return matches[0];
  }

  archive(sessionPath: string) {
    return this.move(sessionPath, this.sessionRoot, this.archiveRoot);
  }

  restore(sessionPath: string) {
    return this.move(sessionPath, this.archiveRoot, this.sessionRoot);
  }

  restoreDeleted(sessionPath: string) {
    const [collection, ...parts] = sessionPath.split(/[\\/]/);
    if ((collection !== "active" && collection !== "archived") || parts.length === 0) {
      throw new Error("Invalid trashed session path");
    }
    const targetRoot = collection === "active" ? this.sessionRoot : this.archiveRoot;
    return this.move(sessionPath, this.trashRoot, targetRoot, parts.join("/"));
  }

  trash(sessionPath: string, collection: SessionCollection) {
    const sourceRoot = collection === "active" ? this.sessionRoot : this.archiveRoot;
    const source = managedPath(sourceRoot, sessionPath);
    const destination = uniquePath(managedPath(join(this.trashRoot, collection), sessionPath));
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(source, destination);
    return destination;
  }

  absolutePath(sessionPath: string, collection: SessionCollection = "active") {
    return managedPath(this.collectionRoot(collection), sessionPath);
  }

  relativePath(sessionPath: string) {
    const absolute = resolve(sessionPath);
    const path = relative(this.sessionRoot, absolute);
    managedPath(this.sessionRoot, path);
    return path;
  }

  private move(sessionPath: string, sourceRoot: string, destinationRoot: string, destinationPath = sessionPath) {
    const source = managedPath(sourceRoot, sessionPath);
    const destination = managedPath(destinationRoot, destinationPath);
    if (existsSync(destination)) throw new Error("Session destination already exists");
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(source, destination);
    return destination;
  }

  private collectionRoot(collection: SessionCollection) {
    if (collection === "active") return this.sessionRoot;
    if (collection === "archived") return this.archiveRoot;
    return this.trashRoot;
  }
}

function listSessionFiles(root: string, skipHidden: boolean): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (skipHidden && entry.name.startsWith(".")) return [];
    if (entry.isSymbolicLink()) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? listSessionFiles(path, false) : entry.name.endsWith(".jsonl") ? [path] : [];
  });
}

function readSession(path: string, root: string): SessionSummary {
  const summary = new SessionSummaryAccumulator(path, root);
  for (const line of readFileSync(path, "utf8").split("\n")) summary.consume(line);
  return summary.finish(statSync(path).mtime.toISOString());
}

function managedPath(root: string, sessionPath: string) {
  const normalizedRoot = resolve(root);
  const path = resolve(normalizedRoot, sessionPath);
  if (!sessionPath || isAbsolute(sessionPath) || sessionPath.includes("\0") || sessionPath.includes("\\") || !path.startsWith(`${normalizedRoot}${sep}`) || !path.endsWith(".jsonl")) {
    throw new Error("Invalid session path");
  }
  assertNoSymlinkAncestor(path);
  return path;
}

function assertNoSymlinkAncestor(path: string) {
  let ancestor = path;
  while (!existsSync(ancestor)) {
    // existsSync follows dangling symlinks; lstat must reject those too.
    try { if (lstatSync(ancestor).isSymbolicLink()) throw new Error("Invalid session path: symlink"); } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (realpathSync(ancestor) !== ancestor) throw new Error("Invalid session path: symlink");
}

function uniquePath(path: string) {
  if (!existsSync(path)) return path;
  const extension = extname(path);
  return join(dirname(path), `${basename(path, extension)}-${Date.now()}${extension}`);
}
