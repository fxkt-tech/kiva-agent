import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import type { SessionSummary } from "../shared/types";

export type SessionCollection = "active" | "archived";

export class SessionCatalog {
  private readonly sessionRoot: string;
  private readonly archiveRoot: string;
  private readonly trashRoot: string;

  constructor(repoRoot: string) {
    this.sessionRoot = resolve(repoRoot, ".kiva", "sessions");
    this.archiveRoot = join(this.sessionRoot, ".archive");
    this.trashRoot = join(this.sessionRoot, ".trash");
  }

  list(collection: SessionCollection): SessionSummary[] {
    const root = collection === "active" ? this.sessionRoot : this.archiveRoot;
    if (!existsSync(root)) return [];
    return listSessionFiles(root, collection === "active")
      .map((path) => readSession(path, root))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 100);
  }

  archive(sessionPath: string) {
    return this.move(sessionPath, this.sessionRoot, this.archiveRoot);
  }

  restore(sessionPath: string) {
    return this.move(sessionPath, this.archiveRoot, this.sessionRoot);
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
    return managedPath(collection === "active" ? this.sessionRoot : this.archiveRoot, sessionPath);
  }

  private move(sessionPath: string, sourceRoot: string, destinationRoot: string) {
    const source = managedPath(sourceRoot, sessionPath);
    const destination = uniquePath(managedPath(destinationRoot, sessionPath));
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(source, destination);
    return destination;
  }
}

function listSessionFiles(root: string, skipHidden: boolean): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (skipHidden && entry.name.startsWith(".")) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? listSessionFiles(path, false) : entry.name.endsWith(".jsonl") ? [path] : [];
  });
}

function readSession(path: string, root: string): SessionSummary {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  let name = "未命名会话";
  let preview = "尚无消息预览";
  let id = basename(path, ".jsonl");
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.type === "session" && typeof entry.id === "string") id = entry.id;
      if (entry.type === "session_info" && typeof entry.name === "string") name = entry.name;
      const message = entry.message as { role?: string; content?: unknown } | undefined;
      if (message?.role === "user") {
        const text = messageText(message.content);
        if (text) {
          preview = text.replace(/\s+/g, " ").slice(0, 90);
          if (name === "未命名会话") name = preview.slice(0, 28);
        }
      }
    } catch {
      // Ignore a partially-written trailing line while Pi is persisting a session.
    }
  }
  return { id, path: relative(root, path), name, preview, updatedAt: statSync(path).mtime.toISOString() };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((item) => typeof item === "object" && item !== null && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string" ? [item.text] : []).join("");
}

function managedPath(root: string, sessionPath: string) {
  const normalizedRoot = resolve(root);
  const path = resolve(normalizedRoot, sessionPath);
  if (!sessionPath || !path.startsWith(`${normalizedRoot}${sep}`) || !path.endsWith(".jsonl")) {
    throw new Error("Invalid session path");
  }
  return path;
}

function uniquePath(path: string) {
  if (!existsSync(path)) return path;
  const extension = extname(path);
  return join(dirname(path), `${basename(path, extension)}-${Date.now()}${extension}`);
}
