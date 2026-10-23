import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { createPiAdapter } from "./pi-adapter";
import { RuntimeManager } from "./runtime-manager";
import { SessionRepository } from "./session-repository";
import { createScopedTransport, sendError } from "./scoped-transport";
import { workspaceRegistry } from "./workspace-registry";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 9495);
const dev = process.env.NODE_ENV !== "production";
// Only explicit server startup performs controlled migration. Next rendering
// imports passive storage, never this execution composition root.
workspaceRegistry.initialize();
const repository = new SessionRepository(workspaceRegistry, { worktreeRoot: process.env.KIVA_WEB_WORKTREE_ROOT });
const manager = new RuntimeManager(repository, createPiAdapter, Number(process.env.KIVA_WEB_RUNTIME_CAPACITY ?? 4));
const transport = createScopedTransport({ registry: workspaceRegistry, repository, manager, allowedOrigins: [`http://${host}:${port}`, `http://localhost:${port}`] });
const app = next({ dev, dir: webRoot, hostname: host, port });
await app.prepare();
const handle = app.getRequestHandler(), handleUpgrade = app.getUpgradeHandler();
const sockets = new WebSocketServer({ noServer: true });
const server = createServer(async (request, response) => {
  try { if (!await transport.handle(request, response)) await handle(request, response); }
  catch (error) { sendError(response, error); }
});
server.on("upgrade", (request, socket, head) => {
  if (transport.isEventPath(request)) {
    if (!transport.allowed(request)) { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, (webSocket) => sockets.emit("connection", webSocket, request));
  } else if (request.url?.startsWith("/api/") || request.url?.startsWith("/ws")) {
    socket.write("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\nRefresh required: unscoped runtime subscriptions are retired"); socket.destroy();
  } else void handleUpgrade(request, socket, head);
});
sockets.on("connection", (socket, request) => { void transport.connect(socket, request); });
server.listen(port, host, () => console.log(`Kiva Web listening on http://${host}:${port}`));

async function shutdown() {
  sockets.clients.forEach((socket) => socket.close(1001, "Server shutting down"));
  server.close(); server.closeAllConnections();
  await transport.close();
  await manager.stop();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
