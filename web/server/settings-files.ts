import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { WorkspaceError } from "../shared/workspace-contract";

export const settingsError = (code = "configuration_unavailable", message = "无法安全读取配置，请检查配置文件后重新加载。", status = 409) => new WorkspaceError(code, message, status);
export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const ownValue = (record: Record<string, unknown>, key: string) => Object.hasOwn(record, key) ? record[key] : undefined;
/** Reject duplicate JSON keys instead of silently choosing an identity/value. */
export function parseSettingsJson(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw.replace(/^\uFEFF/, ""));
  if (!isRecord(value)) throw settingsError();
  const frames: { object: boolean; keys: Set<string>; key: boolean }[] = [];
  for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)) {
    const token = match[0], frame = frames.at(-1);
    if (token === "{" || token === "[") frames.push({ object: token === "{", keys: new Set(), key: true });
    else if (token === "}" || token === "]") frames.pop();
    else if (token === ":" && frame) frame.key = false;
    else if (token === "," && frame?.object) frame.key = true;
    else if (token.startsWith('"') && frame?.object && frame.key) { const key = JSON.parse(token) as string; if (frame.keys.has(key)) throw settingsError("duplicate_configuration", "配置包含重复字段，请修复后重新加载。"); frame.keys.add(key); }
  }
  return value;
}
export interface FileSnapshot { value: Record<string, unknown>; fingerprint: string; exists: boolean }
export async function agentDirectory(root: string, create = false) {
  const canonical = await realpath(root);
  let path = canonical;
  for (const name of [".kiva", "agent"]) {
    path = join(path, name);
    try { const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw settingsError("unsafe_configuration"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (create) { try { await mkdir(path, { mode: 0o700 }); } catch (failure) { if ((failure as NodeJS.ErrnoException).code !== "EEXIST") throw failure; } const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw settingsError("unsafe_configuration"); }
    }
  }
  return path;
}

/** No-follow, bounded snapshots. The fingerprint is server-only, including inode substitution. */
export async function readSettingsFile(root: string, name: "models.json" | "auth.json" | "settings.json"): Promise<FileSnapshot> {
  const directory = await agentDirectory(root), path = join(directory, name);
  let file;
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 2_000_000 || before.nlink !== 1) throw settingsError("unsafe_configuration");
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > 2_000_000 || stat.nlink !== 1) throw settingsError("unsafe_configuration");
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(await file.readFile());
    const after = await file.stat(), current = await lstat(path);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || current.ino !== stat.ino || current.dev !== stat.dev) throw settingsError("configuration_conflict", "配置已变化，请重新加载后再试。");
    const value = parseSettingsJson(raw);
    return { value, exists: true, fingerprint: createHash("sha256").update(`${stat.dev}:${stat.ino}:`).update(raw).digest("hex") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { value: {}, exists: false, fingerprint: "missing" };
    if (error instanceof WorkspaceError) throw error;
    throw settingsError();
  } finally { await file?.close(); }
}

/** Opaque, bounded server-side revisions, never hashes of credential material on the wire. */
export class EditRevisions {
  private values = new Map<string, { fingerprint: string; token: string }>();
  issue(key: string, fingerprint: string) {
    let entry = this.values.get(key);
    if (!entry || entry.fingerprint !== fingerprint) { entry = { fingerprint, token: randomBytes(24).toString("base64url") }; this.values.set(key, entry); }
    return entry.token;
  }
  require(key: string, fingerprint: string, token: string) {
    const current = this.issue(key, fingerprint);
    if (current !== token) throw settingsError("configuration_conflict", "配置已变化，请重新加载后再试。");
  }
}
