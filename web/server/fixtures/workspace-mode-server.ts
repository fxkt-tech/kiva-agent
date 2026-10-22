import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocketServer } from "ws";
import { RuntimeManager } from "../runtime-manager";
import { createScopedTransport, sendError } from "../scoped-transport";
import { SessionRepository } from "../session-repository";
import { WorkspaceRegistry } from "../workspace-registry";
import { createDeterministicAdapter } from "./deterministic-adapter";

/** Browser-only composition: every API and Git mutation stays in a fresh temp repo. */
const root = mkdtempSync(join(tmpdir(), "kiva-workspace-mode-browser-"));
const installation = join(root, "project");
mkdirSync(installation);
writeFileSync(join(installation, "tracked.txt"), "Committed fixture contents\n");
writeFileSync(join(installation, ".gitignore"), ".kiva\n");
const git = (...args: string[]) => execFileSync("git", ["-C", installation, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
git("init", "-b", "fixture-main");
git("add", ".");
git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "browser fixture");
writeFileSync(join(installation, "tracked.txt"), "Local uncommitted fixture contents\n");
writeFileSync(join(installation, "untracked.txt"), "Untracked fixture contents\n");
const agent = join(installation, ".kiva", "agent");
mkdirSync(agent, { recursive: true });
writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { fixture: {
  api: "openai-completions", baseUrl: "https://fixture.invalid/v1", apiKey: "offline-browser-fixture",
  models: [{ id: "controlled", name: "Controlled fixture", contextWindow: 100_000, maxTokens: 2048, reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
} } }));
writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "fixture", defaultModel: "controlled", defaultThinkingLevel: "medium" }));
const registry = new WorkspaceRegistry(installation);
registry.initialize();
const project = registry.list()[0];
const repository = new SessionRepository(registry, { worktreeRoot: join(root, "worktrees") });
// The fixture adapter never calls Pi or any model service.
const manager = new RuntimeManager(repository, (descriptor) => createDeterministicAdapter(descriptor).adapter);
const host = "127.0.0.1", port = Number(process.env.PORT ?? 9496);
const allowedOrigins = [`http://${host}:${port}`, `http://localhost:${port}`];
const transport = createScopedTransport({ registry, repository, manager, allowedOrigins });
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = next({ dev: false, dir: webRoot, hostname: host, port });
await app.prepare();
const handle = app.getRequestHandler();
const sockets = new WebSocketServer({ noServer: true });
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/__fixture" && request.method === "GET") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ root, project: registry.resolve(project.id), worktrees: git("worktree", "list", "--porcelain") }));
    } else if (!await transport.handle(request, response)) await handle(request, response);
  } catch (error) { sendError(response, error); }
});
server.on("upgrade", (request, socket, head) => {
  if (!transport.isEventPath(request) || !transport.allowed(request)) { socket.destroy(); return; }
  sockets.handleUpgrade(request, socket, head, (client) => { void transport.connect(client, request); });
});
server.listen(port, host, () => console.log(JSON.stringify({ origin: `http://${host}:${port}`, root, projectId: project.id })));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  sockets.clients.forEach((socket) => socket.terminate());
  server.close();
  server.closeAllConnections();
  await manager.stop();
  await app.close();
}
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
