import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, normalize } from "node:path";
import { WorkspaceError } from "../shared/workspace-contract";

/** A server-established exact file, not a filesystem root or a client-supplied read capability. */
export interface ArtifactFileLocator {
  path: string;
  canonicalPath: string;
  dev: number;
  ino: number;
}
export interface ArtifactFileInspection { locator: ArtifactFileLocator; size: number; version: string }

export async function inspectArtifactFile(path: string): Promise<ArtifactFileInspection> {
  if (!isAbsolute(path) || path.includes("\0") || path.includes("\\")) throw new WorkspaceError("invalid_artifact_path", "会话文件路径无效。", 400);
  const logicalPath = normalize(path), canonicalPath = await realpath(logicalPath);
  if (protectedArtifactFile(logicalPath) || protectedArtifactFile(canonicalPath)) throw new WorkspaceError("artifact_file_protected", "此文件包含应用配置或凭据，不能在页面预览中读取。", 403);
  const identity = await lstat(canonicalPath);
  if (!identity.isFile() || identity.isSymbolicLink()) throw new WorkspaceError("artifact_not_regular", "会话引用的路径不是普通文件。", 409);
  const locator = { path: logicalPath, canonicalPath, dev: identity.dev, ino: identity.ino };
  await validateArtifactFile(locator);
  return { locator, size: identity.size, version: `${identity.dev}:${identity.ino}:${identity.size}:${identity.mtimeMs}` };
}
export function protectedArtifactFile(path: string) {
  const name = basename(path);
  return name === ".env" || name.startsWith(".env.") || /^(?:credentials?|auth|secrets?)(?:\.(?:json|ya?ml|toml|txt|key|pem))?$/i.test(name)
    || /(?:^|\/)\.kiva\/agent\/(?:auth|models|settings)\.json$/i.test(path);
}

export async function validateArtifactFile(locator: ArtifactFileLocator) {
  if (await realpath(locator.path) !== locator.canonicalPath || await realpath(locator.canonicalPath) !== locator.canonicalPath) throw changed();
  const current = await lstat(locator.canonicalPath);
  if (!current.isFile() || current.isSymbolicLink() || current.dev !== locator.dev || current.ino !== locator.ino) throw changed();
}

/** Follow a legitimate alias once, then pin and verify that exact target around every bounded read. */
export async function readArtifactFile(locator: ArtifactFileLocator, maxBytes: number) {
  await validateArtifactFile(locator);
  const handle = await open(locator.canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== locator.dev || opened.ino !== locator.ino) throw changed();
    if (opened.size > maxBytes) throw oversized(maxBytes);
    const chunks: Buffer[] = [];
    let length = 0;
    const deadline = Date.now() + 10_000;
    while (length <= maxBytes) {
      if (Date.now() > deadline) throw new WorkspaceError("artifact_read_timeout", "读取会话文件超时，请重试。", 503);
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - length));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, length);
      if (!bytesRead) break;
      chunks.push(chunk.subarray(0, bytesRead)); length += bytesRead;
    }
    if (length > maxBytes) throw oversized(maxBytes);
    const after = await handle.stat();
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw changed();
    await validateArtifactFile(locator);
    return { content: Buffer.concat(chunks, length), size: length };
  } finally { await handle.close(); }
}
function changed() { return new WorkspaceError("artifact_file_changed", "会话文件或其链接目标已变化，请重新打开预览。", 409); }
function oversized(limit: number) { return new WorkspaceError("file_too_large", `文件超过 ${limit.toLocaleString("en-US")} 字节，无法预览。`, 413); }
