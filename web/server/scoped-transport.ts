import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebSocket } from "ws";
import { isRuntimeCommand, type RuntimeScope } from "../shared/runtime-types";
import { decodeResourceId, isSessionWorkspaceMode, WorkspaceError, type CreateSessionInput } from "../shared/workspace-contract";
import type { WorkspaceRegistry } from "./workspace-registry";
import type { SessionRepository } from "./session-repository";
import type { RuntimeManager } from "./runtime-manager";
import { WorkspaceReader } from "./workspace-reader";
import { readProjectDiff, readProjectFile } from "./workspace-files";
import { listWorkspaceDirectories } from "./workspace-directories";
import { readModelDefaults } from "./model-catalog";
import { isModelConfiguration } from "../shared/model-configuration";
import { isProviderId, isSaveCredentialInput, isSaveDefaultsInput, isSaveProviderInput } from "../shared/installation-settings";
import { InstallationSettingsService } from "./installation-settings";
import type { AuthorizationOptions } from "./provider-authorization";
import { isAuthorizationId, isAuthorizationInput, isAuthorizationRevisionInput, isBeginAuthorizationInput } from "../shared/provider-authorization";
import { parseSettingsJson } from "./settings-files";

export interface ScopedTransportOptions {
  registry: WorkspaceRegistry;
  repository: SessionRepository;
  manager: RuntimeManager;
  allowedOrigins: string[];
  authorization?: AuthorizationOptions;
}

/** Importable composition seam used by the production server and isolated browser fixtures. */
export function createScopedTransport({ registry, repository, manager, allowedOrigins, authorization }: ScopedTransportOptions) {
  const allowed = (request: IncomingMessage) => !request.headers.origin || allowedOrigins.includes(request.headers.origin);
  const parse = (request: IncomingMessage) => new URL(request.url ?? "/", "http://kiva.local");
  const settings = new InstallationSettingsService(registry.installationRoot, manager, authorization);
  const workspace = new WorkspaceReader();

  return {
    close: () => settings.close(),
    allowed,
    isEventPath(request: IncomingMessage) { return /^\/api\/projects\/[^/]+\/sessions\/[^/]+\/events$/.test(parse(request).pathname); },
    async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
      const url = parse(request);
      if (!url.pathname.startsWith("/api/")) return false;
      try {
        if (request.method !== "GET" && !allowed(request)) throw new WorkspaceError("forbidden_origin", "Origin is not allowed", 403);
        for (const name of ["path", "collection", "projectId", "sessionId"]) if (url.searchParams.getAll(name).length > 1) throw new WorkspaceError("duplicate_parameter", `Duplicate ${name} parameter`, 400);
        if (url.searchParams.has("projectId") || url.searchParams.has("sessionId")) throw new WorkspaceError("invalid_identity", "Resource identity belongs in the route", 400);
        if (url.pathname === "/api/settings" || url.pathname.startsWith("/api/settings/")) {
          if (url.searchParams.size) throw new WorkspaceError("invalid_parameter", "安装设置不接受查询参数。", 400);
          const path = url.pathname;
          const oauthBase = "/api/settings/providers/openai/oauth";
          if (path === oauthBase || path.startsWith(`${oauthBase}/`)) {
            if (!allowed(request)) throw new WorkspaceError("forbidden_origin", "Origin is not allowed", 403);
            if (path === oauthBase && request.method === "POST") {
              const body = await readSettingsObject(request);
              if (!isBeginAuthorizationInput(body)) throw new WorkspaceError("invalid_authorization", "请重新加载授权状态后重试。", 400);
              sendJson(response, 202, await settings.authorization.begin(body));
            } else if (path === `${oauthBase}/logout` && request.method === "POST") {
              const body = await readSettingsObject(request);
              if (!isAuthorizationRevisionInput(body)) throw new WorkspaceError("invalid_authorization", "请重新加载授权状态后重试。", 400);
              sendJson(response, 200, await settings.logoutOpenAI(body.revision));
            } else {
              const route = /^\/api\/settings\/providers\/openai\/oauth\/([^/]+)(?:\/(input|cancel))?$/.exec(path);
              if (!route || !isAuthorizationId(route[1])) throw new WorkspaceError("invalid_authorization", "授权记录无效。", 400);
              const [, id, action] = route;
              if (!action && request.method === "GET") sendJson(response, 200, settings.authorization.read(id));
              else if (action === "input" && request.method === "POST") {
                const body = await readSettingsObject(request);
                if (!isAuthorizationInput(body)) throw new WorkspaceError("invalid_authorization_input", "请粘贴完整的授权回调地址。", 400);
                sendJson(response, 200, settings.authorization.submit(id, body));
              } else if (action === "cancel" && request.method === "POST") {
                const body = await readSettingsObject(request);
                if (Object.keys(body).length) throw new WorkspaceError("invalid_authorization", "取消授权请求无效。", 400);
                sendJson(response, 200, await settings.authorization.cancel(id));
              } else methodNotAllowed();
            }
            return true;
          }
          if (path === "/api/settings" && request.method === "GET") sendJson(response, 200, await settings.read());
          else if (path === "/api/settings/models" && request.method === "GET") sendJson(response, 200, await settings.catalog());
          else if (path === "/api/settings/defaults" && request.method === "POST") {
            const body = await readSettingsObject(request);
            if (!isSaveDefaultsInput(body)) throw new WorkspaceError("invalid_configuration", "请同时选择模型和思考强度，并重新加载设置后重试。", 400);
            sendJson(response, 200, await settings.saveDefaults({ provider: body.provider, modelId: body.modelId, thinkingLevel: body.thinkingLevel }, body.revision));
          } else if (path === "/api/settings/providers" && request.method === "POST") {
            const body = await readSettingsObject(request);
            if (!isSaveProviderInput(body)) throw new WorkspaceError("invalid_provider", "提供方配置无效，请检查接口、地址和模型字段。", 400);
            sendJson(response, 200, await settings.saveProvider(body.definition, body.revision));
          } else {
            const credential = /^\/api\/settings\/providers\/([^/]+)\/credential$/.exec(path);
            if (credential && request.method === "POST") {
              const id = decodeURIComponent(credential[1]), body = await readSettingsObject(request);
              if (!isProviderId(id) || !isSaveCredentialInput(body)) throw new WorkspaceError("invalid_credential", "API Key 格式无效；不支持命令、变量或多行内容。", 400);
              sendJson(response, 200, await settings.saveCredential(id, body.apiKey, body.revision));
            } else if (["/api/settings", "/api/settings/models", "/api/settings/defaults", "/api/settings/providers"].includes(path) || credential) methodNotAllowed();
            else throw new WorkspaceError("endpoint_not_found", "设置接口不存在。", 404);
          }
          return true;
        }
        if (url.pathname === "/api/project/directories" && request.method === "GET") {
          sendJson(response, 200, listWorkspaceDirectories(url.searchParams.get("path") ?? registry.installationRoot)); return true;
        }
        if (url.pathname === "/api/projects") {
          if (request.method === "GET") sendJson(response, 200, { projects: registry.list() });
          else if (request.method === "POST") {
            const body = await readObject(request);
            if (typeof body.path !== "string") throw new WorkspaceError("invalid_path", "Project path is required", 400);
            sendJson(response, 201, { project: registry.register(body.path) });
          } else methodNotAllowed();
          return true;
        }
        const parts = url.pathname.split("/").slice(1).map((part) => decodeURIComponent(part));
        if (parts[0] !== "api" || parts[1] !== "projects" || !parts[2]) {
          if (/^\/api\/(runtime|sessions|project)(\/|$)/.test(url.pathname)) throw new WorkspaceError("refresh_required", "This tab uses retired unscoped endpoints; refresh KivA", 409);
          throw new WorkspaceError("endpoint_not_found", "API endpoint not found", 404);
        }
        const projectId = decodeResourceId(parts[2]);
        const project = registry.resolve(projectId);
        if (parts.length === 4 && parts[3] === "actions") {
          if (request.method !== "POST") methodNotAllowed();
          const body = await readObject(request);
          if (body.type !== "remove") throw new WorkspaceError("invalid_action", "Invalid project action", 400, { projectId });
          sendJson(response, 200, { projectId, projects: registry.remove(projectId) });
          return true;
        }
        if (parts.length === 4 && parts[3] === "models") {
          if (request.method === "GET") sendJson(response, 200, await settings.catalog());
          else if (request.method === "POST") {
            const body = await readObject(request);
            if (!isModelConfiguration(body) || (body.sessionId !== undefined && typeof body.sessionId !== "string")) throw new WorkspaceError("invalid_configuration", "请同时选择模型和思考强度。", 400, { projectId });
            const selection = { provider: body.provider, modelId: body.modelId, thinkingLevel: body.thinkingLevel };
            const scope = body.sessionId === undefined ? undefined : { projectId, sessionId: decodeResourceId(body.sessionId) };
            // Serialize complete pair saves across projects/tabs sharing this installation.
            sendJson(response, 200, await settings.saveDefaults(selection, undefined, scope ? async () => { await manager.command(scope, { type: "set_configuration", ...selection }); } : undefined));
          } else methodNotAllowed();
          return true;
        }
        if (parts.length === 3 && request.method === "GET") { sendJson(response, 200, { project }); return true; }
        if (["workspace", "files", "changes"].includes(parts[3]) && parts.length === 4 && request.method === "GET") {
          if (project.capability.state === "unavailable") throw new WorkspaceError("project_unavailable", "Registered project directory is unavailable or has moved", 404, { projectId });
          sendJson(response, 200, parts[3] === "workspace" ? await workspace.read(project.path, project.capability) : parts[3] === "files" ? readProjectFile(project.path, url.searchParams.get("path") ?? "") : readProjectDiff(project.path, url.searchParams.get("path") ?? "")); return true;
        }
        if (parts[3] !== "sessions") throw new WorkspaceError("endpoint_not_found", "API endpoint not found", 404);
        if (parts.length === 4) {
          if (request.method === "GET") {
            const collection = url.searchParams.get("collection");
            if (collection !== null && !["active", "archived", "trash"].includes(collection)) throw new WorkspaceError("invalid_collection", "Unknown session collection", 400);
            sendJson(response, 200, { active: await repository.list(projectId, "active"), archived: await repository.list(projectId, "archived"), trash: await repository.list(projectId, "trash") });
          } else if (request.method === "POST") {
            const input = creationInput(await readObject(request));
            const defaults = readModelDefaults(registry.installationRoot);
            const session = await repository.create(projectId, input, defaults ? { model: { provider: defaults.provider, id: defaults.modelId }, thinkingLevel: defaults.thinkingLevel } : undefined);
            sendJson(response, 201, { projectId, sessionId: session.id, session });
          } else methodNotAllowed();
          return true;
        }
        const scope: RuntimeScope = { projectId, sessionId: decodeResourceId(parts[4]) };
        if (parts.length === 5 && request.method === "GET") { sendJson(response, 200, await manager.read(scope)); return true; }
        if (parts.length !== 6) throw new WorkspaceError("endpoint_not_found", "API endpoint not found", 404, scope);
        const endpoint = parts[5];
        if (endpoint === "jsonl") {
          if (request.method !== "GET") methodNotAllowed();
          if (url.searchParams.size) throw new WorkspaceError("invalid_parameter", "JSONL resources do not accept file paths or query parameters", 400, scope);
          sendJson(response, 200, repository.readJsonl(projectId, scope.sessionId));
          return true;
        }
        if (["workspace", "files", "changes"].includes(endpoint) && request.method === "GET") {
          const root = await repository.resolveWorkspace(projectId, scope.sessionId);
          sendJson(response, 200, endpoint === "workspace" ? await workspace.read(root, root === project.path ? project.capability : undefined) : endpoint === "files" ? readProjectFile(root, url.searchParams.get("path") ?? "") : readProjectDiff(root, url.searchParams.get("path") ?? "")); return true;
        }
        if (request.method !== "POST") methodNotAllowed();
        const body = await readObject(request);
        switch (endpoint) {
          case "continue": {
            const input = creationInput(body);
            const session = await manager.withIdle(scope, () => repository.continue(projectId, scope.sessionId, input));
            sendJson(response, 201, { projectId, sessionId: session.id, session }); break;
          }
          case "commands": {
            if (!isRuntimeCommand(body)) throw new WorkspaceError("invalid_command", "Invalid or unsupported scoped runtime command", 400, scope);
            sendJson(response, 202, await manager.command(scope, body)); break;
          }
          case "deletion-preview": sendJson(response, 200, await manager.preview(scope, (revision) => repository.deletionPreview(projectId, scope.sessionId, revision))); break;
          case "actions": {
            if (body.type === "rename" && typeof body.name === "string") {
              await manager.command(scope, { type: "rename_session", name: body.name });
              sendJson(response, 200, await manager.read(scope));
            } else if (body.type === "delete" && typeof body.confirmation === "string" && typeof body.removeWorktree === "boolean") {
              sendJson(response, 200, await manager.withIdle(scope, (lifecycleRevision) => repository.delete(projectId, scope.sessionId, { confirmation: body.confirmation as string, removeWorktree: body.removeWorktree as boolean, lifecycleRevision })));
            } else if (body.type === "archive" || body.type === "restore" || body.type === "restore_deleted") {
              const type = body.type;
              await manager.withIdle(scope, () => repository.action(projectId, scope.sessionId, { type }));
              sendJson(response, 200, await manager.read(scope));
            } else throw new WorkspaceError("invalid_action", "Invalid session action", 400, scope);
            break;
          }
          default: throw new WorkspaceError("endpoint_not_found", "API endpoint not found", 404, scope);
        }
        return true;
      } catch (error) { sendError(response, error); return true; }
    },
    async connect(socket: WebSocket, request: IncomingMessage) {
      let unsubscribe: (() => void) | undefined;
      let closed = false;
      socket.once("close", () => { closed = true; unsubscribe?.(); });
      try {
        if (!allowed(request)) throw new WorkspaceError("forbidden_origin", "Origin is not allowed", 403);
        const url = parse(request), parts = url.pathname.split("/");
        const scope = { projectId: decodeResourceId(decodeURIComponent(parts[3])), sessionId: decodeResourceId(decodeURIComponent(parts[5])) };
        for (const name of ["stream", "since"]) if (url.searchParams.getAll(name).length > 1) throw new WorkspaceError("duplicate_parameter", `Duplicate ${name} parameter`, 400, scope);
        const rawSince = url.searchParams.get("since");
        const since = rawSince === null ? undefined : Number(rawSince);
        if (rawSince !== null && (!/^\d+$/.test(rawSince) || !Number.isSafeInteger(since))) throw new WorkspaceError("invalid_cursor", "Invalid event cursor", 400, scope);
        unsubscribe = await manager.subscribe(scope, (event) => { if (!closed && socket.readyState === 1) socket.send(JSON.stringify(event)); }, { streamId: url.searchParams.get("stream") ?? undefined, since });
        if (closed) unsubscribe();
      } catch (error) {
        if (socket.readyState === 1) { socket.send(JSON.stringify(errorResult(error))); socket.close(1008, "Resource subscription rejected"); }
      }
    },
  };
}

function creationInput(body: Record<string, unknown>): CreateSessionInput {
  const { operationId, name, workspaceMode } = body;
  if ((operationId !== undefined && typeof operationId !== "string") || (name !== undefined && typeof name !== "string")
    || (workspaceMode !== undefined && !isSessionWorkspaceMode(workspaceMode))) throw new WorkspaceError("invalid_creation", "Invalid session creation input", 400);
  return { operationId, name, workspaceMode };
}
function methodNotAllowed(): never { throw new WorkspaceError("method_not_allowed", "Method is not allowed", 405); }
async function readSettingsObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) throw new WorkspaceError("invalid_content_type", "设置保存需要 JSON 请求。", 415);
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 256_000) throw new WorkspaceError("body_too_large", "设置请求过大。", 413); chunks.push(buffer); }
  try { return parseSettingsJson(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new WorkspaceError("invalid_json", "设置请求格式无效或包含重复字段。", 400); }
}
async function readObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 30_000_000) throw new WorkspaceError("body_too_large", "Request body is too large", 413); chunks.push(buffer); }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw new WorkspaceError("invalid_json", "Invalid JSON request", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceError("invalid_body", "Expected an object request", 400);
  return value as Record<string, unknown>;
}
export function sendJson(response: ServerResponse, status: number, value: unknown) {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0" });
  response.end(JSON.stringify(value));
}
function errorResult(error: unknown) {
  if (error instanceof WorkspaceError) return { error: error.message, code: error.code, target: error.target, details: error.details };
  if (error instanceof URIError) return { error: "Malformed URL encoding", code: "invalid_path" };
  return { error: error instanceof Error ? error.message : String(error), code: "request_failed" };
}
export function sendError(response: ServerResponse, error: unknown) { sendJson(response, error instanceof WorkspaceError ? error.status : 400, errorResult(error)); }
