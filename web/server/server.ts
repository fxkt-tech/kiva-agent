import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { createPiAdapter } from "./pi-adapter";
import { RuntimeHub } from "./runtime-hub";
import type { RuntimeCommand } from "../shared/runtime-types";
import type { SessionAction } from "../shared/types";
import { SessionCatalog, type SessionCollection } from "./session-catalog";
import { RuntimeEventStream } from "./event-stream";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(process.env.KIVA_REPO_ROOT ?? resolve(webRoot, ".."));
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 30141);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, dir: webRoot, hostname: host, port });
const handle = app.getRequestHandler();
const runtime = new RuntimeHub(() => createPiAdapter(repoRoot));
const sessions = new SessionCatalog(repoRoot);
const eventStream = new RuntimeEventStream();
const unsubscribeRuntime = runtime.subscribe((event) => eventStream.publish(event));
const sockets = new WebSocketServer({ noServer: true });

await app.prepare();
const handleUpgrade = app.getUpgradeHandler();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    if (url.pathname === "/api/runtime/state" && request.method === "GET") {
      return sendJson(response, 200, await runtime.snapshot());
    }
    if (url.pathname === "/api/sessions" && request.method === "GET") {
      return sendJson(response, 200, sessionCollections());
    }
    if (url.pathname === "/api/runtime/command" && request.method === "POST") {
      if (!isAllowedOrigin(request)) return sendJson(response, 403, { error: "Origin is not allowed" });
      const command = normalizeCommand(await readCommand(request));
      return sendJson(response, 202, await runtime.execute(command));
    }
    if (url.pathname === "/api/sessions/action" && request.method === "POST") {
      if (!isAllowedOrigin(request)) return sendJson(response, 403, { error: "Origin is not allowed" });
      await executeSessionAction(await readSessionAction(request));
      return sendJson(response, 200, sessionCollections());
    }
    await handle(request, response);
  } catch (error) {
    sendJson(response, 400, { error: errorMessage(error) });
  }
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  if (url.pathname !== "/api/runtime/events") {
    void handleUpgrade(request, socket, head);
    return;
  }
  if (!isAllowedOrigin(request)) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (webSocket) => sockets.emit("connection", webSocket, request));
});

sockets.on("connection", async (socket, request) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  const since = Number(url.searchParams.get("since"));
  const cursor = { streamId: url.searchParams.get("stream") ?? undefined, since: Number.isSafeInteger(since) ? since : undefined };
  const needsResync = eventStream.needsResync(cursor);
  if (needsResync) sendSocket(socket, eventStream.resyncEvent());
  const unsubscribe = eventStream.subscribe(
    (event) => sendSocket(socket, event),
    needsResync ? {} : cursor,
  );
  socket.once("close", unsubscribe);
  try {
    eventStream.publish({ type: "snapshot", snapshot: await runtime.snapshot() });
  } catch (error) {
    eventStream.publish({ type: "error", message: errorMessage(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Kiva Web listening on http://${host}:${port}`);
});

async function shutdown() {
  sockets.clients.forEach((socket) => socket.close(1001, "Server shutting down"));
  unsubscribeRuntime();
  await runtime.stop();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

async function readCommand(request: IncomingMessage): Promise<RuntimeCommand> {
  const value = await readJson(request);
  if (!isRuntimeCommand(value)) throw new Error("Invalid runtime command");
  return value;
}

async function readSessionAction(request: IncomingMessage): Promise<SessionAction> {
  const value = await readJson(request);
  if (!isSessionAction(value)) throw new Error("Invalid session action");
  return value;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 30_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isRuntimeCommand(value: unknown): value is RuntimeCommand {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (value.type === "abort") return true;
  if (value.type === "new_session") return true;
  if (value.type === "compact" || value.type === "clear_queue") return true;
  if (value.type === "rename_session") return "name" in value && typeof value.name === "string";
  if (value.type === "set_model") return "provider" in value && typeof value.provider === "string" && "modelId" in value && typeof value.modelId === "string";
  if (value.type === "set_thinking") return "level" in value && typeof value.level === "string";
  if (value.type === "extension_ui_response") return isUIResponse(value);
  if (value.type === "steer" || value.type === "follow_up") return "message" in value && typeof value.message === "string" && validImages(value);
  if (value.type === "switch_session") return "sessionPath" in value && typeof value.sessionPath === "string";
  return value.type === "prompt" && "message" in value && typeof value.message === "string" && validImages(value);
}

function validImages(value: Record<string, unknown>) {
  if (!("images" in value) || value.images === undefined) return true;
  return Array.isArray(value.images) && value.images.length <= 5 && value.images.every((image) => {
    if (typeof image !== "object" || image === null) return false;
    return "data" in image && typeof image.data === "string" && image.data.length <= 14_000_000
      && "mimeType" in image && typeof image.mimeType === "string" && image.mimeType.startsWith("image/");
  });
}

function isUIResponse(value: Record<string, unknown>) {
  if (!("id" in value) || typeof value.id !== "string") return false;
  return ("value" in value && typeof value.value === "string")
    || ("confirmed" in value && typeof value.confirmed === "boolean")
    || value.cancelled === true;
}

function normalizeCommand(command: RuntimeCommand): RuntimeCommand {
  if (command.type !== "switch_session") return command;
  return { ...command, sessionPath: sessions.absolutePath(command.sessionPath) };
}

function isSessionAction(value: unknown): value is SessionAction {
  if (typeof value !== "object" || value === null || !("type" in value) || !("sessionPath" in value) || typeof value.sessionPath !== "string") return false;
  if (value.type === "archive" || value.type === "restore" || value.type === "restore_deleted") return true;
  return value.type === "delete" && "collection" in value && (value.collection === "active" || value.collection === "archived");
}

async function executeSessionAction(action: SessionAction) {
  if (action.type === "restore") {
    sessions.restore(action.sessionPath);
    return;
  }
  if (action.type === "restore_deleted") {
    sessions.restoreDeleted(action.sessionPath);
    return;
  }
  const collection: SessionCollection = action.type === "archive" ? "active" : action.collection;
  const targetPath = sessions.absolutePath(action.sessionPath, collection);
  if (collection === "active") {
    const snapshot = await runtime.snapshot();
    if (snapshot.session.path && resolve(snapshot.session.path) === targetPath) {
      await runtime.execute({ type: "new_session" });
    }
  }
  if (action.type === "archive") sessions.archive(action.sessionPath);
  else sessions.trash(action.sessionPath, action.collection);
}

function sessionCollections() {
  return { active: sessions.list("active"), archived: sessions.list("archived"), trash: sessions.list("trash") };
}

function isAllowedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  if (!origin) return true;
  return origin === `http://${host}:${port}` || origin === `http://localhost:${port}`;
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function sendSocket(socket: WebSocket, value: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
