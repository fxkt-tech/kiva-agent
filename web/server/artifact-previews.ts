import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, normalize, resolve } from "node:path";
import type { ArtifactPreviewLease } from "../shared/session-artifacts";
import type { RuntimeScope } from "../shared/runtime-types";
import { WorkspaceError } from "../shared/workspace-contract";
import type { SessionRepository } from "./session-repository";
import { SessionArtifactReader } from "./session-artifacts";
import { fileURLToPath } from "node:url";
import { inspectArtifactFile, readArtifactFile, protectedArtifactFile, validateArtifactFile, type ArtifactFileLocator } from "./artifact-files";
import { artifactDependencies, rewriteArtifactResourceUrls } from "./artifact-dependencies";

const MAX_IMAGE = 10_000_000, MAX_DOCUMENT = 2_000_000, MAX_TOTAL = 32_000_000, MAX_FILES = 256;
const IDLE_MS = 15 * 60_000, LIFETIME_MS = 60 * 60_000, MAX_LEASES = 128;
const resourceMimeTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".ico": "image/x-icon",
};
interface Preview extends RuntimeScope {
  artifactId: string; token: string; projectRoot: string; projectDev: number; projectIno: number; known: boolean;
  files: Map<string, ArtifactFileLocator>; createdAt: number; lastRead: number; document: string; warnings: string[];
}
interface PreviewOptions { now?: () => number }

/** The token grants read-only access to one explicitly discovered resource closure, never a directory. */
export class ArtifactPreviewService {
  private readonly leases = new Map<string, Preview>();
  private readonly now: () => number;
  private readonly cleanup: ReturnType<typeof setInterval>;
  private pendingCreates = 0;
  private closed = false;
  constructor(private readonly reader: SessionArtifactReader, private readonly repository: Pick<SessionRepository, "artifactContext">, options: PreviewOptions = {}) {
    this.now = options.now ?? Date.now;
    this.cleanup = setInterval(() => this.expire(), 60_000); this.cleanup.unref();
  }
  close() { this.closed = true; clearInterval(this.cleanup); this.leases.clear(); }
  async create(scope: RuntimeScope, artifactId: string): Promise<ArtifactPreviewLease> {
    this.expire();
    if (this.closed) throw new WorkspaceError("preview_closed", "预览服务已关闭。", 503, scope);
    if (this.leases.size + this.pendingCreates >= MAX_LEASES || this.pendingCreates >= 4) throw new WorkspaceError("preview_capacity", "打开的文件预览较多，请稍后重试或关闭部分预览。", 503, scope);
    this.pendingCreates++;
    try { return await this.build(scope, artifactId); }
    finally { this.pendingCreates--; }
  }
  private async build(scope: RuntimeScope, artifactId: string): Promise<ArtifactPreviewLease> {
    const { context, artifact, locator } = await this.reader.artifact(scope, artifactId);
    const identity = await stat(context.projectRoot), files = new Map<string, ArtifactFileLocator>(), queue = [locator.path], warnings: string[] = [];
    const token = randomBytes(24).toString("hex");
    let bytes = 0;
    while (queue.length) {
      const path = queue.shift()!;
      if (files.has(virtualPath(path))) continue;
      if (files.size >= MAX_FILES) throw new WorkspaceError("preview_too_large", "HTML 本地依赖超过 256 个，无法完整预览。", 413, scope);
      const extension = extname(path).toLowerCase();
      if (!resourceMimeTypes[extension] || protectedArtifactFile(path)) throw new WorkspaceError("preview_dependency_type", "预览包含不支持或受保护的本地资源。", 409, scope);
      let content: Buffer, dependencyLocator: ArtifactFileLocator;
      try {
        dependencyLocator = path === locator.path ? locator : (await inspectArtifactFile(path)).locator;
        content = (await readArtifactFile(dependencyLocator, [".html", ".htm"].includes(extension) ? MAX_DOCUMENT : MAX_IMAGE)).content;
      }
      catch (error) {
        if (path === locator.path) throw error;
        warnings.push(`本地依赖不可用：${path}`); continue;
      }
      bytes += content.length;
      if (bytes > MAX_TOTAL) throw new WorkspaceError("preview_too_large", "本地预览资源总量超过 32 MB。", 413, scope);
      files.set(virtualPath(path), dependencyLocator);
      if (![".html", ".htm", ".js", ".mjs", ".css"].includes(extension)) continue;
      const dependencies = artifactDependencies(path, content.toString("utf8"));
      warnings.push(...dependencies.warnings);
      const references = dependencies.references.flatMap((reference) => {
        const documentRelative = dependencies.documentReferences?.includes(reference);
        const scriptRelative = dependencies.scriptReferences?.includes(reference);
        return documentRelative && scriptRelative && path !== locator.path ? [{ reference, parent: path }, { reference, parent: locator.path }]
          : [{ reference, parent: documentRelative && !scriptRelative ? locator.path : path }];
      });
      for (const { reference, parent } of references) {
        if (/^(?:https:|wss:|data:|blob:|#)/i.test(reference)) continue;
        if (/^(?:(?!file:)[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) { warnings.push(`不支持的资源协议：${reference.slice(0, 160)}`); continue; }
        const dependency = dependencyPath(parent, reference);
        if (!dependency || protectedArtifactFile(dependency) || !resourceMimeTypes[extname(dependency).toLowerCase()]) { warnings.push(`本地依赖未授权：${reference.slice(0, 160)}`); continue; }
        if (!files.has(virtualPath(dependency))) queue.push(dependency);
      }
    }
    // Session ownership and exact file identities replace the former directory capability.
    const current = this.repository.artifactContext(scope.projectId, scope.sessionId);
    const after = await stat(context.projectRoot);
    if (current.projectRoot !== context.projectRoot || after.dev !== identity.dev || after.ino !== identity.ino || context.known && !current.known) throw new WorkspaceError("workspace_replaced", "会话所属项目或历史已变化，请重新预览。", 409, scope);
    await validateArtifactFile(locator);
    const now = this.now();
    const preview: Preview = { ...scope, artifactId, token, projectRoot: context.projectRoot, projectDev: identity.dev, projectIno: identity.ino, known: context.known,
      files, createdAt: now, lastRead: now, document: locator.path, warnings: [...new Set(warnings)] };
    if (this.closed) throw new WorkspaceError("preview_closed", "预览服务已关闭。", 503, scope);
    this.leases.set(token, preview);
    return { ...scope, artifactId, leaseId: token, url: `/preview/${token}/${encodePath(virtualPath(locator.path))}`, expiresAt: new Date(now + IDLE_MS).toISOString(), warnings: preview.warnings };
  }
  revoke(scope: RuntimeScope, id: string) {
    const preview = this.leases.get(id);
    if (preview && (preview.projectId !== scope.projectId || preview.sessionId !== scope.sessionId)) throw new WorkspaceError("preview_not_found", "文件预览不存在。", 404, scope);
    this.leases.delete(id);
  }
  async content(scope: RuntimeScope, id: string) {
    const { artifact, locator } = await this.reader.artifact(scope, id);
    const file = await readArtifactFile(locator, artifact.kind === "html" ? MAX_DOCUMENT : MAX_IMAGE);
    return { ...file, mimeType: artifact.kind === "html" ? "text/plain; charset=utf-8" : artifact.mimeType };
  }
  async serve(request: IncomingMessage, response: ServerResponse, origin: string): Promise<boolean> {
    const url = new URL(request.url ?? "/", origin);
    if (!url.pathname.startsWith("/preview/")) return false;
    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") throw new WorkspaceError("method_not_allowed", "预览资源只支持读取。", 405);
    const parts = url.pathname.split("/");
    const token = parts[2];
    this.expire();
    const preview = this.leases.get(token);
    if (!preview) throw new WorkspaceError("preview_expired", "预览已关闭或过期，请重新打开文件。", 410);
    let path: string;
    try { path = parts.slice(3).map(decodeURIComponent).join("/"); }
    catch { throw new WorkspaceError("invalid_path", "文件路径编码无效。", 400); }
    if (!path || path.includes("\\") || path.split("/").some((part) => part === "." || part === "..") || !preview.files.has(path)) throw new WorkspaceError("preview_resource_denied", "此文件不在当前预览的资源清单中。", 404);
    const resource = await this.readResource(preview, path, origin);
    response.writeHead(request.method === "OPTIONS" ? 204 : 200, resource.headers);
    response.end(request.method === "HEAD" || request.method === "OPTIONS" ? undefined : resource.content);
    return true;
  }
  /** Explicit navigation returns the original file document, never an application wrapper. */
  async serveDocument(scope: RuntimeScope, artifactId: string, response: ServerResponse, origin: string) {
    const lease = await this.create(scope, artifactId);
    const preview = this.leases.get(lease.leaseId);
    if (!preview) throw new WorkspaceError("preview_expired", "预览服务已关闭，请重新打开文件。", 410, scope);
    try {
      const resource = await this.readResource(preview, virtualPath(preview.document), origin, false);
      response.writeHead(200, resource.headers);
      response.end(resource.content);
    } catch (error) {
      this.revoke(scope, lease.leaseId);
      throw error;
    }
  }
  private async readResource(preview: Preview, path: string, origin: string, anonymousCors = true) {
    const token = preview.token;
    const context = this.repository.artifactContext(preview.projectId, preview.sessionId);
    const identity = await stat(preview.projectRoot);
    if (context.projectRoot !== preview.projectRoot || context.known === false && preview.known || identity.dev !== preview.projectDev || identity.ino !== preview.projectIno) {
      this.leases.delete(token); throw new WorkspaceError("preview_session_unavailable", "会话所属项目或历史已不可用。", 409);
    }
    const locator = preview.files.get(path)!;
    const extension = extname(locator.path).toLowerCase();
    const file = await readArtifactFile(locator, [".html", ".htm"].includes(extension) ? MAX_DOCUMENT : MAX_IMAGE);
    let content = file.content;
    if ([".html", ".htm", ".css", ".js", ".mjs"].includes(extension)) {
      content = Buffer.from(rewriteArtifactResourceUrls(locator.path, content.toString("utf8"), (reference, base) => {
        if (/^(?:https:|wss:|data:|blob:|#|\/\/)/i.test(reference)) return reference;
        const target = dependencyPath(base === "document" ? preview.document : locator.path, reference);
        if (!target) return reference;
        // Missing/unsupported dependencies remain denied; rewriting never adds a file to the lease.
        const suffix = reference.match(/[?#][\s\S]*$/)?.[0] ?? "";
        return `/preview/${token}/${encodePath(virtualPath(target))}${suffix}`;
      }));
    }
    preview.lastRead = this.now();
    const prefix = `${origin}/preview/${token}/`;
    const headers: Record<string, string> = {
      "content-type": resourceMimeTypes[extension], "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    };
    if (extension === ".html" || extension === ".htm") headers["content-security-policy"] = htmlPreviewPolicy(prefix);
    else if (extension === ".svg" || !anonymousCors && resourceMimeTypes[extension].startsWith("image/")) headers["content-security-policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'";
    else headers["content-security-policy"] = "sandbox; default-src 'none'; frame-ancestors 'self'";
    if (!anonymousCors) {
      delete headers["access-control-allow-origin"];
      delete headers["access-control-allow-methods"];
    }
    return { content, headers };
  }
  private expire() {
    const now = this.now();
    for (const [id, preview] of this.leases) if (now - preview.lastRead >= IDLE_MS || now - preview.createdAt >= LIFETIME_MS) this.leases.delete(id);
  }
}
export function htmlPreviewPolicy(prefix: string) {
  return `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https: ${prefix}; style-src 'unsafe-inline' https: ${prefix}; img-src data: blob: https: ${prefix}; font-src data: https: ${prefix}; connect-src https: wss: ${prefix}; media-src blob: https: ${prefix}; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; frame-ancestors 'self'`;
}
function encodePath(path: string) { return path.split("/").map(encodeURIComponent).join("/"); }
function virtualPath(path: string) { return `fs/${normalize(path).replace(/^\//, "")}`; }
function dependencyPath(parent: string, value: string): string | undefined {
  if (!value || value.startsWith("#") || value.startsWith("//")) return;
  let path: string;
  try {
    if (/^file:/i.test(value)) path = fileURLToPath(new URL(value));
    else {
      if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return;
      path = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    }
  } catch { return; }
  if (!path || path.includes("\0") || path.includes("\\") || /%(?:2e|2f|5c|00)/i.test(path)) return;
  return isAbsolute(path) ? resolve(path) : resolve(dirname(parent), path);
}
