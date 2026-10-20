import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { createPiAdapter } from "./pi-adapter";
import { RuntimeHub } from "./runtime-hub";
import type { RuntimeCommand } from "../shared/runtime-types";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(process.env.KIVA_REPO_ROOT ?? resolve(webRoot, ".."));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 30141);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, dir: webRoot, hostname: host, port });
const handle = app.getRequestHandler();
const runtime = new RuntimeHub(() => createPiAdapter(repoRoot));
const sockets = new WebSocketServer({ noServer: true });

await app.prepare();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    if (url.pathname === "/api/runtime/state" && request.method === "GET") {
      return sendJson(response, 200, await runtime.snapshot());
    }
    if (url.pathname === "/api/runtime/command" && request.method === "POST") {
      const command = await readCommand(request);
      return sendJson(response, 202, await runtime.execute(command));
    }
    await handle(request, response);
  } catch (error) {
    sendJson(response, 400, { error: errorMessage(error) });
  }
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  if (url.pathname !== "/api/runtime/events") return;
  sockets.handleUpgrade(request, socket, head, (webSocket) => sockets.emit("connection", webSocket, request));
});

sockets.on("connection", async (socket) => {
  const unsubscribe = runtime.subscribe((event) => sendSocket(socket, event));
  socket.once("close", unsubscribe);
  try {
    sendSocket(socket, { type: "snapshot", snapshot: await runtime.snapshot() });
  } catch (error) {
    sendSocket(socket, { type: "error", message: errorMessage(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Kiva Web listening on http://${host}:${port}`);
});

async function shutdown() {
  sockets.clients.forEach((socket) => socket.close(1001, "Server shutting down"));
  await runtime.stop();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

async function readCommand(request: IncomingMessage): Promise<RuntimeCommand> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!isRuntimeCommand(value)) throw new Error("Invalid runtime command");
  return value;
}

function isRuntimeCommand(value: unknown): value is RuntimeCommand {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (value.type === "abort") return true;
  return value.type === "prompt" && "message" in value && typeof value.message === "string";
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
