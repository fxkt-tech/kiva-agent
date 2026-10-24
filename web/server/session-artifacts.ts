import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { setImmediate as yieldToIO } from "node:timers/promises";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { ArtifactRelation, ArtifactSource, SessionArtifact, SessionArtifactList } from "../shared/session-artifacts";
import { WorkspaceError } from "../shared/workspace-contract";
import type { RuntimeScope } from "../shared/runtime-types";
import type { ArtifactContext, SessionRepository } from "./session-repository";
import { fileURLToPath } from "node:url";
import { inspectArtifactFile, type ArtifactFileLocator } from "./artifact-files";

const HISTORY_BYTES = 64 * 1024 * 1024, LINE_BYTES = 8 * 1024 * 1024, MAX_ARTIFACTS = 10_000;
export const artifactMimeTypes: Readonly<Record<string, string>> = {
  ".html": "text/html", ".htm": "text/html", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif", ".svg": "image/svg+xml",
};
export const artifactId = (scope: RuntimeScope, path: string) => createHash("sha256").update(JSON.stringify([scope.projectId, scope.sessionId, path])).digest("hex").slice(0, 32);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
interface History { records: Record<string, unknown>[]; revision: string; warnings: string[]; cwd?: string; timestamp?: string }
export interface ArtifactListing { list: SessionArtifactList; context: ArtifactContext; files: Map<string, ArtifactFileLocator> }

/** On-demand, read-only projection. Sharing ends with each pending request; refresh reads disk again. */
export class SessionArtifactReader {
  private readonly pending = new Map<string, Promise<ArtifactListing>>();
  constructor(private readonly repository: Pick<SessionRepository, "artifactContext">) {}
  async read(scope: RuntimeScope): Promise<ArtifactListing> {
    // Ownership precedes sharing, including after a removed worktree or directory substitution.
    const context = this.repository.artifactContext(scope.projectId, scope.sessionId);
    const projectIdentity = await stat(context.projectRoot);
    const key = JSON.stringify([scope, context, projectIdentity.dev, projectIdentity.ino]);
    const previous = this.pending.get(key);
    if (previous) return previous;
    const current = this.load(scope, context, projectIdentity);
    this.pending.set(key, current);
    try { return await current; } finally { if (this.pending.get(key) === current) this.pending.delete(key); }
  }
  async artifact(scope: RuntimeScope, id: string) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new WorkspaceError("invalid_artifact", "文件标识无效。", 400, scope);
    const result = await this.read(scope);
    const artifact = result.list.artifacts.find((item) => item.id === id);
    if (!artifact) throw new WorkspaceError("artifact_not_found", "该文件不属于此会话的产物列表。", 404, scope);
    const locator = result.files.get(id);
    if (!locator || artifact.availability !== "available") throw new WorkspaceError("artifact_unavailable", artifact.message ?? "文件已不存在或无法读取。", 409, scope);
    return { ...result, artifact, locator };
  }
  private async load(scope: RuntimeScope, context: ArtifactContext, projectIdentity: Stats): Promise<ArtifactListing> {
    const deadline = Date.now() + 10_000;
    const history = await findHistory(context.projectRoot, scope.sessionId, deadline);
    if (!history) {
      if (!context.known) throw new WorkspaceError("session_not_found", "会话不属于此项目。", 404, scope);
      if (context.persisted !== false) throw new WorkspaceError("session_history_missing", "会话历史不可用，无法读取产物。", 409, scope);
      await validateListingIdentity(context, projectIdentity);
      return { context, files: new Map(), list: { ...scope, artifacts: [], revision: "empty", complete: true, warnings: [] } };
    }
    const root = context.recordedRoot ?? history.cwd;
    const artifacts = new Map<string, SessionArtifact>();
    const targets = new Map<string, string>();
    const files = new Map<string, ArtifactFileLocator>();
    const warnings = [...history.warnings];
    const branch = branchRecords(history.records, warnings);
    const edits = new Map<string, Record<string, unknown>>();
    for (const entry of branch) if (entry.type === "context_edit" && typeof entry.targetId === "string") edits.set(entry.targetId, entry);
    const effectiveMessage = (entry: Record<string, unknown>) => {
      if (entry.type !== "message" || !object(entry.message)) return;
      const edit = edits.get(String(entry.id));
      if (edit?.replacement === null) return;
      const replacement = edit && object(edit.replacement) ? edit.replacement : undefined;
      return replacement ? { ...entry.message, content: replacement.content } : entry.message;
    };
    // Inspect the complete branch first: a later duplicate also invalidates an earlier pairing.
    const callCounts = new Map<string, number>();
    for (const entry of branch) {
      const message = effectiveMessage(entry);
      if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
      for (const block of message.content) if (object(block) && block.type === "toolCall" && typeof block.id === "string") {
        callCounts.set(block.id, (callCounts.get(block.id) ?? 0) + 1);
      }
    }
    if ([...callCounts.values()].some((count) => count > 1)) warnings.push("历史中存在重复工具调用标识，相关文件无法确认生成来源。");
    const calls = new Map<string, { name: string; path?: string; source: ArtifactSource; inherited: boolean }>();
    const add = (rawPath: string, relation: ArtifactRelation, source: ArtifactSource) => {
      const path = normalizeArtifactPath(rawPath, root);
      if (!path) return;
      if (isAbsolute(path)) targets.set(path, path);
      else if (root && isAbsolute(root)) targets.set(path, resolve(root, path));
      const mimeType = artifactMimeTypes[extname(path).toLowerCase()];
      if (!mimeType) return;
      if (!artifacts.has(path) && artifacts.size >= MAX_ARTIFACTS) throw new WorkspaceError("artifact_index_too_large", "会话文件引用超过 10,000 项，无法完整显示。", 413, scope);
      const item = artifacts.get(path) ?? { id: artifactId(scope, path), path, name: basename(path), kind: mimeType === "text/html" ? "html" : "image",
        mimeType, relations: [], sources: [], availability: "unavailable", currentVersion: true };
      if (!item.relations.includes(relation)) item.relations.push(relation);
      if (!item.sources.some((entry) => entry.entryId === source.entryId && entry.toolCallId === source.toolCallId)) item.sources.push(source);
      artifacts.delete(path); artifacts.set(path, item);
    };
    for (let index = 0; index < branch.length; index++) {
      checkDeadline(deadline);
      if (index % 64 === 0) await yieldToIO();
      const entry = branch[index];
      const message = effectiveMessage(entry);
      if (!message) continue;
      const source: ArtifactSource = { entryId: String(entry.id), ...(typeof entry.timestamp === "string" ? { timestamp: entry.timestamp } : {}) };
      const inherited = !!context.sourceSessionId && (!source.timestamp || source.timestamp < (history.timestamp ?? context.createdAt ?? ""));
      const relation = inherited ? "inherited" : "referenced";
      if (message.role === "toolResult" && typeof message.toolCallId === "string") {
        const call = calls.get(message.toolCallId);
        const compatibleName = !call || message.toolName === undefined || message.toolName === call.name;
        if (!compatibleName) warnings.push("工具执行结果名称与调用不匹配，相关文件无法确认生成来源。");
        if (message.isError !== true) {
          if (call?.path && callCounts.get(message.toolCallId) === 1 && compatibleName) add(call.path, call.inherited ? "inherited" : call.name === "read" ? "referenced" : "written", call.source);
          // Output is evidence of a reference only; never infer arbitrary shell side effects.
          for (const text of messageText(message.content)) for (const path of explicitPaths(text)) add(path, relation, { ...source, toolCallId: message.toolCallId });
        }
        continue;
      }
      if (message.role !== "user" && message.role !== "assistant") continue;
      for (const text of messageText(message.content)) for (const path of explicitPaths(text)) add(path, relation, source);
      if (message.role === "assistant" && Array.isArray(message.content)) for (const block of message.content) {
        if (!object(block) || block.type !== "toolCall" || typeof block.id !== "string" || typeof block.name !== "string") continue;
        const args = object(block.arguments) ? block.arguments : undefined;
        calls.set(block.id, { name: block.name, path: ["write", "edit", "read"].includes(block.name) && typeof args?.path === "string" ? args.path : undefined,
          source: { ...source, toolCallId: block.id }, inherited });
      }
    }
    const items = [...artifacts.values()].reverse();
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (cursor < items.length) {
        checkDeadline(deadline);
        const item = items[cursor++];
        const target = targets.get(item.path);
        if (!target) { item.message = "此相对文件引用没有可确认的会话执行目录。"; continue; }
        try {
          const file = await inspectArtifactFile(target);
          item.availability = "available"; item.version = file.version;
          files.set(item.id, file.locator);
        } catch (error) {
          item.availability = code(error) === "ENOENT" ? "missing" : "unavailable";
          item.message = item.availability === "missing" ? "文件已删除或改名。" : error instanceof WorkspaceError ? error.message : "会话引用的文件无法安全读取。";
        }
      }
    }));
    await validateListingIdentity(context, projectIdentity);
    // Canonical aliases identify one artifact, while the first/most recent visible source wins.
    const canonicalRoot = root ? await realpath(root).catch(() => undefined) : undefined;
    const deduplicated = new Map<string, SessionArtifact>(), canonicalFiles = new Map<string, ArtifactFileLocator>();
    for (const item of items) {
      const locator = files.get(item.id), key = locator?.canonicalPath ?? targets.get(item.path) ?? item.path;
      const existing = deduplicated.get(key);
      if (existing) {
        for (const relation of item.relations) if (!existing.relations.includes(relation)) existing.relations.push(relation);
        for (const source of item.sources) if (!existing.sources.some((other) => other.entryId === source.entryId && other.toolCallId === source.toolCallId)) existing.sources.push(source);
        continue;
      }
      if (locator) {
        const within = canonicalRoot ? relative(canonicalRoot, locator.canonicalPath) : undefined;
        item.path = within && !isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`) ? within : locator.canonicalPath;
        item.name = basename(item.path); item.id = artifactId(scope, item.path);
        canonicalFiles.set(item.id, locator);
      }
      deduplicated.set(key, item);
    }
    return { context, files: canonicalFiles, list: { ...scope, artifacts: [...deduplicated.values()], revision: history.revision, complete: warnings.length === 0, warnings } };
  }
}

async function validateListingIdentity(context: ArtifactContext, projectIdentity: Stats) {
  const currentProject = await stat(context.projectRoot);
  if (currentProject.dev !== projectIdentity.dev || currentProject.ino !== projectIdentity.ino) throw new WorkspaceError("workspace_replaced", "项目目录已变化，请刷新。", 409);

}

function messageText(content: unknown): string[] {
  if (typeof content === "string") return [content];
  return Array.isArray(content) ? content.flatMap((block) => object(block) && block.type === "text" && typeof block.text === "string" ? [block.text] : []) : [];
}

/** Parse Markdown instead of matching paths inside fenced source or uploaded-file bodies. */
export function explicitPaths(text: string): string[] {
  const withoutAttachments = text.replace(/<attached_file\b[^>]*>[\s\S]*?<\/attached_file>/gi, "");
  const tree = fromMarkdown(withoutAttachments), result: string[] = [];
  const visit = (node: typeof tree | typeof tree.children[number]) => {
    if (node.type === "code" || node.type === "html") return;
    // Link fragments/queries describe the view, not the disk filename. Decode only later,
    // so a literal percent-encoded '?' or '#' remains part of the actual filename.
    if ((node.type === "image" || node.type === "link" || node.type === "definition") && typeof node.url === "string") result.push(node.url.split(/[?#]/, 1)[0]);
    if (node.type === "inlineCode") {
      if (/\.(?:html?|png|jpe?g|webp|gif|avif|svg)(?::\d+(?::\d+)?)?$/i.test(node.value.trim())) result.push(node.value.trim());
    } else if (node.type === "text") {
      const pattern = /(?:^|[\s(<"'「：])((?:\.?\.?\/|\/)?[^\s<>"'`，。；：！？()[\]{}]+\.(?:html?|png|jpe?g|webp|gif|avif|svg)(?::\d+(?::\d+)?)?)(?=$|[\s)>"'，。；！？])/gi;
      for (const match of node.value.matchAll(pattern)) result.push(match[1]);
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return result;
}

export function normalizeArtifactPath(value: string, root?: string): string | undefined {
  let path = value.replace(/:\d+(?::\d+)?$/, "");
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("//")) return;
  try {
    if (/^file:/i.test(path)) path = fileURLToPath(new URL(path));
    else {
      if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return;
      path = decodeURIComponent(path);
    }
  } catch { return; }
  if (!path || path.includes("\0") || path.includes("\\") || /%(?:2e|2f|5c|00)/i.test(path)) return;
  const absolute = isAbsolute(path) ? resolve(path) : root && isAbsolute(root) ? resolve(root, path) : undefined;
  if (!absolute) return normalize(path).replace(/^\.\//, "");
  const within = root && isAbsolute(root) ? relative(root, absolute) : undefined;
  return within && !isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`) ? within : absolute;
}

function branchRecords(records: Record<string, unknown>[], warnings: string[]) {
  const entries = records.filter((entry) => entry.type !== "session");
  // Old flat histories have no source IDs. Stable content/position identities never write a migration.
  let previous: string | null = null;
  const normalized = entries.map((entry, index) => {
    const id = typeof entry.id === "string" ? entry.id : `legacy-${index}-${createHash("sha256").update(JSON.stringify(entry)).digest("hex").slice(0, 12)}`;
    const item = { ...entry, id, parentId: "parentId" in entry ? entry.parentId : previous };
    previous = id;
    return item;
  });
  const byId = new Map(normalized.map((entry) => [entry.id, entry]));
  if (byId.size !== normalized.length) warnings.push("历史包含重复记录标识，文件列表可能不完整。");
  const seen = new Set<string>(), path: Record<string, unknown>[] = [];
  let current = normalized.at(-1);
  while (current) {
    if (seen.has(current.id)) { warnings.push("会话分支包含循环，文件列表可能不完整。"); break; }
    seen.add(current.id); path.push(current);
    if (!current.parentId) break;
    const parent = typeof current.parentId === "string" ? byId.get(current.parentId) : undefined;
    if (!parent) { warnings.push("会话分支缺少父记录，文件列表可能不完整。"); break; }
    current = parent;
  }
  return path.reverse();
}

async function findHistory(projectRoot: string, sessionId: string, deadline: number): Promise<History | undefined> {
  const root = join(projectRoot, ".kiva", "sessions");
  let found: History | undefined;
  const visit = async (directory: string, skipHidden: boolean) => {
    checkDeadline(deadline);
    try { if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error("unsafe"); }
    catch (error) { if (code(error) === "ENOENT") return; throw new WorkspaceError("artifact_history_ownership", "会话历史目录无法安全读取。", 409); }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (skipHidden && entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(path, false);
      else if (entry.name.endsWith(".jsonl")) {
        const history = await readHistory(path, sessionId, deadline);
        if (history) {
          if (found) throw new WorkspaceError("ambiguous_session", "多个历史文件具有相同会话标识，请先修复。", 409);
          found = history;
        }
      }
    }
  };
  await visit(root, true); await visit(join(root, ".archive"), false); await visit(join(root, ".trash"), false);
  return found;
}

async function readHistory(path: string, wantedId: string, deadline: number): Promise<History | undefined> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || await realpath(path) !== path) throw new WorkspaceError("artifact_history_ownership", "历史文件不是受控普通文件。", 409);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const captured = await handle.stat();
    if (!sameFile(before, captured)) throw new WorkspaceError("artifact_history_changed", "历史文件已变化，请刷新。", 409);
    let id = basename(path, ".jsonl"), cwd: string | undefined, timestamp: string | undefined;
    // Identity follows the last valid header, so filenames/first headers alone are insufficient.
    // Inventory never retains unrelated transcript bodies or applies target total-size limits.
    await scanLines(handle, captured.size, HISTORY_BYTES, deadline, (record) => {
      if (record?.type === "session" && typeof record.id === "string") {
        id = record.id;
        cwd = typeof record.cwd === "string" ? record.cwd : cwd;
        timestamp = typeof record.timestamp === "string" ? record.timestamp : timestamp;
      }
    });
    await verifySnapshot(path, handle, captured);
    if (id !== wantedId) return undefined;
    if (captured.size > HISTORY_BYTES) throw new WorkspaceError("artifact_history_too_large", "会话历史超过 64 MiB，无法建立完整文件列表。", 413);
    const records: Record<string, unknown>[] = [], warnings: string[] = [];
    await scanLines(handle, captured.size, LINE_BYTES, deadline, (record) => {
      if (record) records.push(record);
      else warnings.push("历史中存在损坏或尚未写完的记录，文件列表可能不完整。");
    });
    await verifySnapshot(path, handle, captured);
    return { records, cwd, timestamp, warnings: [...new Set(warnings)], revision: `${captured.dev}:${captured.ino}:${captured.size}:${captured.mtimeMs}` };
  } finally { await handle.close(); }
}
async function verifySnapshot(path: string, handle: Awaited<ReturnType<typeof open>>, captured: Stats) {
  const after = await lstat(path), opened = await handle.stat();
  if (!sameFile(captured, after) || opened.size < captured.size || opened.size === captured.size && opened.mtimeMs !== captured.mtimeMs || await realpath(path) !== path) throw new WorkspaceError("artifact_history_changed", "会话历史读取期间变化，请刷新。", 409);
}
async function scanLines(handle: Awaited<ReturnType<typeof open>>, size: number, maxLineBytes: number, deadline: number, consume: (record?: Record<string, unknown>) => void) {
  let fragments: Buffer[] = [], length = 0, position = 0;
  const part = (bytes: Buffer, complete: boolean) => {
    if (bytes.length) { fragments.push(Buffer.from(bytes)); length += bytes.length; }
    if (length > maxLineBytes) throw new WorkspaceError("artifact_history_line_too_large", "单条历史记录超过安全读取上限，无法确认完整文件列表。", 413);
    if (!complete) return;
    if (length) {
      let record: Record<string, unknown> | undefined;
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(fragments, length));
        if (text.trim()) { const parsed: unknown = JSON.parse(text); if (object(parsed)) record = parsed; }
        else { fragments = []; length = 0; return; }
      } catch { /* Identity tolerates malformed rows; the target projection discloses them. */ }
      consume(record);
    }
    fragments = []; length = 0;
  };
  const chunk = Buffer.allocUnsafe(64 * 1024);
  while (position < size) {
    checkDeadline(deadline);
    const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, size - position), position);
    if (!bytesRead) throw new WorkspaceError("artifact_history_changed", "会话历史读取期间变化，请刷新。", 409);
    let start = 0;
    for (let i = 0; i < bytesRead; i++) if (chunk[i] === 10) { part(chunk.subarray(start, i), true); start = i + 1; }
    part(chunk.subarray(start, bytesRead), false);
    position += bytesRead; await yieldToIO();
  }
  part(Buffer.alloc(0), true);
}

function sameFile(left: Stats, right: Stats) { return left.dev === right.dev && left.ino === right.ino && right.isFile(); }
function code(error: unknown) { return object(error) ? error.code : undefined; }
function checkDeadline(deadline: number) { if (Date.now() >= deadline) throw new WorkspaceError("artifact_index_timeout", "读取会话文件列表超时，请重试。", 503); }
