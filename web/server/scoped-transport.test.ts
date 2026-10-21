import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, it } from "node:test";
import { WebSocket, WebSocketServer } from "ws";
import { WorkspaceRegistry } from "./workspace-registry";
import { SessionRepository } from "./session-repository";
import { RuntimeManager } from "./runtime-manager";
import { createScopedTransport } from "./scoped-transport";
import { createDeterministicAdapter } from "./fixtures/deterministic-adapter";
import type { SessionResource } from "../shared/workspace-contract";
import type { RuntimeWireEvent, SessionRuntimeRead } from "../shared/runtime-types";

async function fixture(capacity = 4) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-transport-"))), installation = join(root, "installation");
  mkdirSync(installation); writeFileSync(join(installation, "tracked.txt"), "committed fixture\n"); writeFileSync(join(installation, ".gitignore"), ".kiva\n");
  const git = (...args: string[]) => execFileSync("git", ["-C", installation, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  git("init"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const registry = new WorkspaceRegistry(installation); registry.initialize();
  const project = registry.list()[0], repository = new SessionRepository(registry, { worktreeRoot: join(root, "worktrees") });
  const adapters = new Map<string, ReturnType<typeof createDeterministicAdapter>>();
  const manager = new RuntimeManager(repository, (descriptor) => { const value = createDeterministicAdapter(descriptor); adapters.set(descriptor.sessionId, value); return value.adapter; }, capacity, 60_000);
  const allowedOrigins: string[] = [];
  const transport = createScopedTransport({ registry, repository, manager, allowedOrigins });
  const server = createServer(async (request, response) => { if (!await transport.handle(request, response)) { response.statusCode = 404; response.end(); } });
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    if (!transport.isEventPath(request) || !transport.allowed(request)) { socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, (client) => { void transport.connect(client, request); });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address() as { port: number }, origin = `http://127.0.0.1:${address.port}`;
  allowedOrigins.push(origin);
  const api = `/api/projects/${project.id}`;
  const request = async (path: string, body?: unknown, extraHeaders = {}) => {
    const response = await fetch(`${origin}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  const create = async (operationId: string) => (await request(`${api}/sessions`, { operationId })).body.session as SessionResource;
  const close = async () => { sockets.clients.forEach((socket) => socket.terminate()); sockets.close(); await manager.stop(); await new Promise<void>((resolve) => server.close(() => resolve())); };
  return { root, installation, registry, repository, project, manager, adapters, origin, api, request, create, close, git };
}

describe("scoped HTTP/WebSocket transport", () => {
  it("reads exact original JSONL passively, including empty metadata and malformed lines", async () => {
    const f = await fixture();
    try {
      const session = await f.create("jsonl-passive");
      const api = `${f.api}/sessions/${session.id}/jsonl`;
      const empty = await f.request(api);
      assert.equal(empty.status, 200);
      assert.equal(empty.body.content, ""); assert.equal(empty.body.bytes, 0);
      assert.equal(empty.body.fileName, undefined); assert.equal(empty.body.truncated, false);
      const metadata = join(f.installation, ".kiva", "web", "sessions", `${session.id}.json`);
      const before = readFileSync(metadata, "utf8");
      const history = join(f.installation, ".kiva", "sessions"); mkdirSync(history, { recursive: true });
      const content = `${JSON.stringify({ type: "session", id: session.id, version: 3, cwd: f.installation })}\r\n\r\n${JSON.stringify({ type: "message", id: "record", parentId: null, message: { role: "user", content: "原始文本" } })}\n{partial`;
      const file = join(history, "original.jsonl"); writeFileSync(file, content);
      const response = await fetch(`${f.origin}${api}`);
      assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /no-store/);
      const document = await response.json();
      assert.equal(document.projectId, f.project.id); assert.equal(document.sessionId, session.id);
      assert.equal(document.content, content); assert.equal(document.fileName, "original.jsonl");
      assert.equal(document.bytes, Buffer.byteLength(content)); assert.equal(document.totalBytes, document.bytes);
      assert.equal(document.truncated, false); assert.equal(readFileSync(file, "utf8"), content);
      assert.equal(readFileSync(metadata, "utf8"), before); assert.equal(f.adapters.size, 0);
      assert.equal((await f.request(`${api}?path=other.jsonl`)).status, 400);
      assert.equal((await f.request(api, {})).status, 405);
      assert.equal((await f.request(`${f.api}/sessions/missing/jsonl`)).status, 404);
      const otherRoot = join(f.root, "other-jsonl"); mkdirSync(otherRoot);
      const other = f.registry.register(otherRoot);
      assert.equal((await f.request(`/api/projects/${other.id}/sessions/${session.id}/jsonl`)).status, 404);
      assert.equal(f.adapters.size, 0);
    } finally { await f.close(); }
  });

  it("hides projects without deleting data or stopping owners and restores the same registration on import", async () => {
    const f = await fixture();
    try {
      const session = await f.create("project-visibility");
      const sessionApi = `${f.api}/sessions/${session.id}`;
      const marker = join(session.workspace!.executionRoot, "preserved.txt"); writeFileSync(marker, "keep all working files\n");
      const metadata = join(f.installation, ".kiva", "web", "sessions", `${session.id}.json`);
      await f.request(`${sessionApi}/commands`, { type: "prompt", message: "keep running while hidden" });
      const before = readFileSync(metadata, "utf8"), owner = f.adapters.get(session.id)!;
      assert.equal((await f.request(`${f.api}/actions`, { type: "remove" }, { origin: "https://foreign.invalid" })).status, 403);
      assert.equal((await f.request(`${f.api}/actions`, { type: "delete" })).status, 400);
      assert.equal((await f.request(`${f.api}/actions`)).status, 405);
      const hidden = await f.request(`${f.api}/actions`, { type: "remove" });
      assert.equal(hidden.status, 200); assert.equal(hidden.body.projectId, f.project.id); assert.deepEqual(hidden.body.projects, []);
      assert.deepEqual((await f.request("/api/projects")).body.projects, []);
      assert.deepEqual(new WorkspaceRegistry(f.installation).list(), []);
      assert.equal((await f.request(`${sessionApi}`)).body.lifecycle, "running");
      assert.equal(owner.starts(), 1); assert.equal(owner.stops(), 0);
      assert.equal(readFileSync(marker, "utf8"), "keep all working files\n"); assert.equal(readFileSync(metadata, "utf8"), before);
      assert.equal((await f.request(`${f.api}/actions`, { type: "remove" })).status, 200, "hiding is idempotent");
      const restored = await f.request("/api/projects", { path: f.installation });
      assert.equal(restored.body.project.id, f.project.id);
      assert.equal((await f.request("/api/projects")).body.projects[0].id, f.project.id);
      assert.equal((await f.request(`${sessionApi}`)).body.lifecycle, "running");
      assert.equal(readFileSync(metadata, "utf8"), before);
      assert.equal((await f.request("/api/projects/not-registered/actions", { type: "remove" })).status, 404);

      // A hidden registration still protects its directory from workspace cleanup.
      await f.request(`${sessionApi}/commands`, { type: "abort" });
      const registeredTree = f.registry.register(session.workspace!.treeRoot);
      await f.request(`/api/projects/${registeredTree.id}/actions`, { type: "remove" });
      const preview = await f.request(`${sessionApi}/deletion-preview`, {});
      assert.equal(preview.body.workspace.state, "unavailable");
      assert.match(preview.body.workspace.message, /registered project/);
      assert.equal(existsSync(marker), true);
    } finally { await f.close(); }
  });

  it("serves passive installation model options before any session exists", async () => {
    const f = await fixture();
    try {
      const agent = join(f.installation, ".kiva", "agent");
      mkdirSync(agent, { recursive: true });
      writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { "transport-fixture": { api: "openai-completions", baseUrl: "https://example.invalid/v1", apiKey: "fixture-secret", models: [{ id: "configured", name: "Configured", contextWindow: 8192, maxTokens: 2048, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
      const result = await f.request(`${f.api}/models`);
      assert.equal(result.status, 200);
      assert.ok((result.body.models as Array<{ provider: string; id: string }>).some((model) => model.provider === "transport-fixture" && model.id === "configured"));
      assert.equal(JSON.stringify(result.body).includes("fixture-secret"), false);
      assert.equal(f.adapters.size, 0);
      assert.equal(f.repository.list(f.project.id).length, 0);
      assert.equal((await f.request("/api/projects/not-registered/models")).status, 404);
    } finally { await f.close(); }
  });

  it("saves a complete installation default without execution and pins only new sessions", async () => {
    const f = await fixture();
    try {
      const agent = join(f.installation, ".kiva", "agent"); mkdirSync(agent, { recursive: true });
      writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { fixture: { api: "openai-completions", baseUrl: "https://example.invalid/v1", apiKey: "fixture-secret", models: ["controlled", "alternate"].map((id) => ({ id, name: id, contextWindow: 8192, maxTokens: 2048, reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })) } } }));
      const before = await f.create("before-default");
      const choice = { provider: "fixture", modelId: "alternate", thinkingLevel: "high" };
      assert.equal((await f.request(`${f.api}/models`, { ...choice, thinkingLevel: "not-a-level" })).status, 409);
      assert.equal((await f.request(`${f.api}/models`, { provider: "fixture", modelId: "alternate" })).status, 400);
      assert.equal((await f.request(`${f.api}/models`, choice, { origin: "https://foreign.invalid" })).status, 403);
      assert.equal(existsSync(join(agent, "settings.json")), false);
      assert.equal((await f.request(`${f.api}/models`, choice)).status, 200);
      assert.deepEqual((await f.request(`${f.api}/models`)).body.defaults, choice);
      const otherRoot = join(f.root, "another-project"); mkdirSync(otherRoot);
      const other = f.registry.register(otherRoot);
      assert.deepEqual((await f.request(`/api/projects/${other.id}/models`)).body.defaults, choice);
      assert.equal(f.adapters.size, 0);
      const created = await f.create("after-default");
      assert.deepEqual(created.controls, { model: { provider: "fixture", id: "alternate" }, thinkingLevel: "high" });
      const original = { model: { provider: "fixture", id: "controlled" }, thinkingLevel: "low" };
      const [once, retried] = await Promise.all([
        f.repository.create(f.project.id, { operationId: "concurrent-default-retry" }, original),
        f.repository.create(f.project.id, { operationId: "concurrent-default-retry" }, { model: { provider: "fixture", id: "alternate" }, thinkingLevel: "high" }),
      ]);
      assert.equal(once.id, retried.id); assert.deepEqual(retried.controls, original);
      assert.equal(f.repository.read(f.project.id, before.id).session.controls?.model, undefined);
      assert.equal((await f.request(`${f.api}/sessions/${created.id}`)).body.lifecycle, "dormant");
      const forCurrent = { ...choice, modelId: "controlled", thinkingLevel: "medium", sessionId: created.id };
      assert.equal((await f.request(`${f.api}/models`, forCurrent)).status, 200);
      assert.equal(f.adapters.size, 1);
      assert.equal((await f.request(`${f.api}/sessions/${created.id}`)).body.snapshot.thinkingLevel, "medium");
      const stored = readFileSync(join(agent, "settings.json"), "utf8");
      assert.equal((await f.request(`${f.api}/models`, { ...choice, sessionId: "missing" })).status, 404);
      assert.equal(readFileSync(join(agent, "settings.json"), "utf8"), stored);
      await f.request(`${f.api}/sessions/${created.id}/commands`, { type: "prompt", message: "stay running" });
      assert.equal((await f.request(`${f.api}/models`, { ...choice, sessionId: created.id })).status, 409);
      assert.equal(readFileSync(join(agent, "settings.json"), "utf8"), stored);
      // Changing defaults alone never edits another existing session's confirmed controls.
      await f.request(`${f.api}/models`, choice);
      assert.equal(f.repository.read(f.project.id, created.id).session.controls?.model?.id, "controlled");
    } finally { await f.close(); }
  });

  it("creates a real isolated resource while GET and WS stay passive, then scopes live events and concurrent owners", { timeout: 20_000 }, async () => {
    const f = await fixture();
    try {
      const a = await f.create("operation-a"), b = await f.create("operation-b");
      const read = await f.request(`${f.api}/sessions/${a.id}`);
      assert.equal(read.status, 200); assert.equal((read.body as unknown as SessionRuntimeRead).lifecycle, "dormant");
      assert.notEqual(a.workspace?.executionRoot, f.installation); assert.equal(f.adapters.size, 0);
      assert.equal((await f.request(`${f.api}/sessions/${a.id}/files?path=tracked.txt`)).body.content, "committed fixture\n");
      const socket = new WebSocket(`${f.origin.replace("http", "ws")}${f.api}/sessions/${a.id}/events`);
      const [data] = await once(socket, "message");
      const event = JSON.parse(String(data)) as RuntimeWireEvent;
      assert.equal(event.projectId, f.project.id); assert.equal(event.sessionId, a.id); assert.equal(event.event.type, "snapshot"); assert.equal(f.adapters.size, 0);
      const events: RuntimeWireEvent[] = []; socket.on("message", (data) => events.push(JSON.parse(String(data))));
      await Promise.all([a, b].map((session) => f.request(`${f.api}/sessions/${session.id}/commands`, { type: "prompt", message: `run-${session.id}` })));
      assert.equal(f.adapters.size, 2);
      assert.ok(events.every((item) => item.sessionId === a.id));
      socket.close();
      assert.equal((await f.request(`${f.api}/sessions/${b.id}`)).body.lifecycle, "running");
      assert.equal((await f.request(`${f.api}/sessions/${a.id}/deletion-preview`, {})).status, 409);
      assert.equal((await f.request(`${f.api}/sessions/${a.id}/commands`, { type: "abort" })).status, 202);
      assert.equal((await f.request(`${f.api}/sessions/${b.id}`)).body.lifecycle, "running");
    } finally { await f.close(); }
  });

  it("binds deletion to lifecycle revision, blocks dirty cleanup before history moves, and retains branch refs", { timeout: 20_000 }, async () => {
    const f = await fixture();
    try {
      const session = await f.create("operation-delete"), path = `${f.api}/sessions/${session.id}`;
      const preview = await f.request(`${path}/deletion-preview`, {});
      assert.equal(preview.body.removeWorktree, true);
      await f.request(`${path}/commands`, { type: "initialize" });
      const stale = await f.request(`${path}/actions`, { type: "delete", confirmation: preview.body.confirmation, removeWorktree: true });
      assert.equal(stale.status, 409); assert.equal(f.repository.read(f.project.id, session.id).session.collection, "active");
      writeFileSync(join(session.workspace!.treeRoot, "local.txt"), "untracked must survive\n");
      const dirtyPreview = await f.request(`${path}/deletion-preview`, {});
      const dirty = await f.request(`${path}/actions`, { type: "delete", confirmation: dirtyPreview.body.confirmation, removeWorktree: true });
      assert.equal(dirty.status, 409); assert.equal(f.repository.read(f.project.id, session.id).session.collection, "active");
      const retained = await f.request(`${path}/actions`, { type: "delete", confirmation: dirtyPreview.body.confirmation, removeWorktree: false });
      assert.equal(retained.status, 200); assert.equal(retained.body.workspace, "retained"); assert.equal(existsSync(join(session.workspace!.treeRoot, "local.txt")), true);
      await f.request(`${path}/actions`, { type: "restore_deleted" });
      assert.equal(f.repository.read(f.project.id, session.id).session.id, session.id);
      const clean = await f.create("operation-clean"), cleanPath = `${f.api}/sessions/${clean.id}`;
      const cleanPreview = await f.request(`${cleanPath}/deletion-preview`, {});
      const removed = await f.request(`${cleanPath}/actions`, { type: "delete", confirmation: cleanPreview.body.confirmation, removeWorktree: true });
      assert.equal(removed.status, 200); assert.equal(removed.body.workspace, "removed"); assert.equal(existsSync(clean.workspace!.treeRoot), false);
      assert.equal(f.git("rev-parse", `refs/heads/${clean.workspace!.branch}`), clean.workspace!.baseCommit);
    } finally { await f.close(); }
  });

  it("rejects unscoped/identity-changing mutations, origin violations, duplicate input and wrong project/session pairs", { timeout: 20_000 }, async () => {
    const f = await fixture();
    try {
      const session = await f.create("operation-validation");
      assert.equal((await f.request("/api/runtime/command", { type: "abort" })).body.code, "refresh_required");
      assert.equal((await f.request(`${f.api}/sessions/${session.id}/commands`, { type: "new_session" })).status, 400);
      assert.equal((await f.request(`${f.api}/sessions/${session.id}/commands`, { type: "initialize" }, { origin: "http://foreign.invalid" })).status, 403);
      assert.equal((await f.request(`${f.api}/sessions?collection=active&collection=trash`)).status, 400);
      assert.equal((await f.request(`${f.api}/sessions/not-in-project`)).status, 404);
      assert.equal((await f.request(`/api/projects/not-registered/sessions/${session.id}`)).status, 404);
      const nongit = join(f.root, "non-git"); mkdirSync(nongit);
      const registered = await f.request("/api/projects", { path: nongit });
      const rejected = await f.request(`/api/projects/${registered.body.project.id}/sessions`, { operationId: "unsupported" });
      assert.equal(rejected.status, 409); assert.equal(f.adapters.size, 0);
    } finally { await f.close(); }
  });
});
