import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { RuntimeManager } from "../runtime-manager";
import { SessionRepository } from "../session-repository";
import { WorkspaceRegistry } from "../workspace-registry";
import { createScopedTransport, sendError } from "../scoped-transport";
import { WorkspaceError } from "../../shared/workspace-contract";
import { createDeterministicAdapter } from "./deterministic-adapter";

/** Isolated browser composition. Auth, model requests and user configuration are never contacted. */
const root = mkdtempSync(join(tmpdir(), "kiva-openai-browser-"));
const agent = join(root, ".kiva", "agent"); mkdirSync(agent, { recursive: true });
writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { fixture: { api: "openai-completions", baseUrl: "https://fixture.invalid/v1", apiKey: "offline-fixture", models: [{ id: "controlled", name: "Controlled fixture", contextWindow: 100_000, maxTokens: 2048, reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "fixture", defaultModel: "controlled", defaultThinkingLevel: "medium" }));
const registry = new WorkspaceRegistry(root); registry.initialize();
const repository = new SessionRepository(registry);
const manager = new RuntimeManager(repository, (descriptor) => createDeterministicAdapter(descriptor).adapter);
const host = "127.0.0.1", port = Number(process.env.PORT ?? 9497);
const transport = createScopedTransport({ registry, repository, manager, allowedOrigins: [`http://${host}:${port}`, `http://localhost:${port}`], authorization: {
  driver: async (interaction) => {
    interaction.notify({ type: "auth_url", url: "https://auth.openai.com/api/accounts/authorize?state=fixture" });
    const input = await interaction.prompt({ type: "manual_code", message: "Fixture callback", signal: interaction.signal });
    const code = new URL(input).searchParams.get("code");
    if (code === "fixture-fail") throw new Error("Fixture private provider failure: PRIVATE_SENTINEL");
    if (code === "fixture-port-busy") throw new Error("Port 1455 is in use, fixture private details");
    if (code === "fixture-expire") throw new WorkspaceError("authorization_expired", "Private provider expiry", 409);
    return { type: "oauth", access: "PRIVATE_FIXTURE_ACCESS_TOKEN", refresh: "PRIVATE_FIXTURE_REFRESH_TOKEN", expires: Date.now() + 86_400_000, clientId: "private_fixture_client" };
  },
} });
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = next({ dev: false, dir: webRoot, hostname: host, port }); await app.prepare();
const handle = app.getRequestHandler(); const sockets = new WebSocketServer({ noServer: true });
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/__fixture" && request.method === "GET") {
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ root, origin: `http://${host}:${port}`, callbacks: ["fixture-success", "fixture-fail", "fixture-expire", "fixture-port-busy"].map((code) => `http://127.0.0.1:1455/auth/callback?code=${code}&state=fixture`) }));
    } else if (!await transport.handle(request, response)) await handle(request, response);
  } catch (error) { sendError(response, error); }
});
server.on("upgrade", (request, socket, head) => {
  if (!transport.isEventPath(request) || !transport.allowed(request)) { socket.destroy(); return; }
  sockets.handleUpgrade(request, socket, head, (client) => { void transport.connect(client, request); });
});
server.listen(port, host, () => console.log(JSON.stringify({ origin: `http://${host}:${port}`, root })));
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  sockets.clients.forEach((socket) => socket.terminate()); server.close(); server.closeAllConnections();
  await transport.close(); await manager.stop(); await app.close();
}
process.once("SIGINT", () => { void stop(); }); process.once("SIGTERM", () => { void stop(); });
