import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync } from "node:fs";
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
const root = mkdtempSync(join(tmpdir(), "kiva-artifacts-browser-"));
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
// Seed only isolated files and native-format session entries; never use user histories.
const fixtureSession = await repository.create(project.id, { operationId: "artifacts-browser-primary", name: "Artifact browser fixture", workspaceMode: "current-branch" });
const otherSession = await repository.create(project.id, { operationId: "artifacts-browser-other", name: "Other artifact session", workspaceMode: "current-branch" });
const artifactsDir = join(installation, "artifacts");
mkdirSync(artifactsDir, { recursive: true });
mkdirSync(join(artifactsDir, "scripts"), { recursive: true });
writeFileSync(join(artifactsDir, "demo.html"), `<!doctype html><html><head><title>Artifact demo</title><link rel="stylesheet" href="theme.css"></head><body>
<h1>Interactive artifact</h1><button id="counter">Count: 0</button><output id="local">waiting</output><output id="remote">waiting</output>
<script>let n=0;document.querySelector('#counter').onclick=()=>document.querySelector('#counter').textContent='Count: '+(++n);try{parent.document.body;document.body.dataset.parentAccess='allowed'}catch{document.body.dataset.parentAccess='blocked'}try{localStorage.setItem('artifact-probe','bad');document.body.dataset.storage='allowed'}catch{document.body.dataset.storage='blocked'}fetch('https://api.artifacts.example.invalid/data').then(r=>r.json()).then(d=>document.querySelector('#remote').textContent=d.result).catch(()=>document.querySelector('#remote').textContent='blocked');</script>
<script src="https://cdn.artifacts.example.invalid/library.js"></script><script type="module" src="scripts/main.js"></script></body></html>`);
writeFileSync(join(artifactsDir, "theme.css"), "h1 { color: rgb(21, 99, 181); } body { font-family: sans-serif; padding: 16px; }\n");
writeFileSync(join(artifactsDir, "scripts", "main.js"), "import {label} from './helper.js'; fetch('./data.json').then(r=>r.json()).then(d=>document.querySelector('#local').textContent=label+d.value);\n");
writeFileSync(join(artifactsDir, "scripts", "helper.js"), "export const label = 'Local module: ';\n");
writeFileSync(join(artifactsDir, "data.json"), JSON.stringify({ value: "ready" }));
writeFileSync(join(artifactsDir, "chart.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="160"><rect width="300" height="160" fill="#eaf1ff"/><circle cx="90" cy="80" r="45" fill="#2667d9"/><text x="160" y="90" font-size="20">Fixture</text></svg>');
writeFileSync(join(artifactsDir, "unrelated.html"), "<p>Never referenced by either fixture session</p>");
mkdirSync(join(installation, ".kiva", "sessions"), { recursive: true });
const writeHistory = (sessionId: string, text: string) => {
  const entries = [
    { type: "session", version: 3, id: sessionId, cwd: installation, timestamp: "2026-10-24T00:00:00.000Z" },
    { type: "message", id: "artifact-user", parentId: null, timestamp: "2026-10-24T00:00:00.000Z", message: { role: "user", content: "Please show the generated files", timestamp: Date.now() } },
    { type: "message", id: "artifact-output", parentId: "artifact-user", timestamp: "2026-10-24T00:01:00.000Z", message: { role: "assistant", content: [{type: "text", text}], timestamp: Date.now() } },
  ];
  writeFileSync(join(installation, ".kiva", "sessions", sessionId + ".jsonl"), entries.map(e => JSON.stringify(e)).join("\n") + "\n");
};
writeHistory(fixtureSession.id, "[Interactive page](artifacts/demo.html)\n![Chart](artifacts/chart.svg)");
writeHistory(otherSession.id, "Other conversation, no file links.");
const externalSession = await repository.create(project.id, { operationId: "artifacts-browser-external", name: "External artifact fixture", workspaceMode: "current-branch" });
const externalRoot = join(root, "external");
const externalShared = join(root, "external-shared");
cpSync(artifactsDir, externalRoot, { recursive: true });
mkdirSync(externalShared, { recursive: true });
writeFileSync(join(externalShared, "data.json"), JSON.stringify({ value: "ready" }));
writeFileSync(join(externalShared, "common.css"), "body { background-color: rgb(234, 241, 255); }\n");
cpSync(join(artifactsDir, "chart.svg"), join(externalShared, "logo.svg"));
writeFileSync(join(externalRoot, "theme.css"), '@import "../external-shared/common.css"; h1 { color: rgb(21, 99, 181); } body { font-family: sans-serif; padding: 16px; }\n');
writeFileSync(join(externalRoot, "demo.html"), readFileSync(join(externalRoot, "demo.html"), "utf8").replace('href="theme.css"', `href="${externalRoot}/theme.css"`).replace('<h1>', `<img id="absolute-image" width="40" src="${externalRoot}/chart.svg"><h1>`));
writeFileSync(join(externalRoot, "scripts", "main.js"), `import {label} from '${externalRoot}/scripts/helper.js'; fetch('../external-shared/data.json').then(r=>r.json()).then(d=>document.querySelector('#local').textContent=label+d.value); const logo = new Image(); logo.id='file-url-image';logo.src=new URL('file://${externalShared}/logo.svg',import.meta.url).href;document.body.append(logo);\n`);
writeHistory(externalSession.id, `[External interactive page](${externalRoot}/demo.html)\n![External chart](${externalRoot}/chart.svg)\nAlso referenced by relative path: \`../external/chart.svg\``);
const nativeImageSession = await repository.create(project.id, { operationId: "artifacts-browser-native-image", name: "Native image fixture", workspaceMode: "current-branch" });
writeFileSync(join(artifactsDir, "pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"));
writeHistory(nativeImageSession.id, "![Pixel](artifacts/pixel.png)");
// The fixture adapter never calls Pi or any model service.
const manager = new RuntimeManager(repository, (descriptor) => createDeterministicAdapter(descriptor).adapter);
const host = "127.0.0.1", port = Number(process.env.PORT ?? 9498);
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
      response.end(JSON.stringify({ root, sessionId: fixtureSession.id, otherSessionId: otherSession.id, externalSessionId: externalSession.id, nativeImageSessionId: nativeImageSession.id, externalRoot, project: registry.resolve(project.id), worktrees: git("worktree", "list", "--porcelain") }));
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
  await transport.close();
  await manager.stop();
  await app.close();
}
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
