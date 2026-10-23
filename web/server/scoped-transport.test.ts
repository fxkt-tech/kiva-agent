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
import { SessionCatalog } from "./session-catalog";
import { WorkspaceReader } from "./workspace-reader";
import type { SessionResource, SessionWorkspaceMode } from "../shared/workspace-contract";
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
  const create = async (operationId: string, workspaceMode?: SessionWorkspaceMode) => (await request(`${api}/sessions`, { operationId, ...(workspaceMode ? { workspaceMode } : {}) })).body.session as SessionResource;
  const close = async () => { sockets.clients.forEach((socket) => socket.terminate()); sockets.close(); await manager.stop(); await new Promise<void>((resolve) => server.close(() => resolve())); };
  return { root, installation, registry, repository, project, manager, adapters, origin, api, request, create, close, git };
}

describe("scoped HTTP/WebSocket transport", () => {
  it("serves collection-scoped list summaries while preserving legacy collection responses", async (t) => {
    const f = await fixture();
    try {
      const current = await f.create("summary-current"), archived = await f.create("summary-archived");
      f.repository.action(f.project.id, archived.id, { type: "archive" });
      const legacyList = await f.request(`${f.api}/sessions`);
      assert.deepEqual(Object.keys(legacyList.body).sort(), ["active", "archived", "trash"]);
      t.mock.method(f.repository, "list", () => { throw new Error("Scoped summaries must not invoke legacy detail projection"); });
      t.mock.method(SessionCatalog.prototype, "all", () => { throw new Error("Scoped summaries must not scan the synchronous catalog"); });
      let projectResolves = 0;
      const resolve = f.registry.resolve.bind(f.registry);
      t.mock.method(f.registry, "resolve", (id: string) => { projectResolves++; return resolve(id); });
      const active = await f.request(`${f.api}/sessions?collection=active`);
      assert.equal(active.status, 200);
      assert.equal(active.body.collection, "active");
      assert.deepEqual(active.body.sessions.map((session: SessionResource) => session.id), [current.id]);
      assert.equal("controls" in active.body.sessions[0], false);
      assert.equal("executable" in active.body.sessions[0], false);
      assert.equal(projectResolves, 1, "route scope validation must be reused by the snapshot reader");
      const archive = await f.request(`${f.api}/sessions?collection=archived`);
      assert.deepEqual(archive.body.sessions.map((session: SessionResource) => session.id), [archived.id]);
      assert.deepEqual((await f.request(`${f.api}/sessions?collection=trash`)).body.sessions, []);
      assert.equal((await f.request(`${f.api}/sessions?collection=unknown`)).status, 400);
      assert.equal((await f.request(`${f.api}/sessions?collection=active&collection=active`)).status, 400);
      assert.equal(f.adapters.size, 0);
    } finally { await f.close(); }
  });

  it("returns a changes-only projection for exact workspace routes and rejects invalid views", async () => {
    const f = await fixture();
    try {
      writeFileSync(join(f.installation, "tracked.txt"), "changed fixture\n");
      const changes = await f.request(`${f.api}/workspace?view=changes`);
      assert.equal(changes.status, 200);
      assert.equal("files" in changes.body.project, false);
      assert.deepEqual(changes.body.project.changes, [{ status: "M", path: "tracked.txt" }]);
      assert.ok((await f.request(`${f.api}/workspace`)).body.project.files.includes("tracked.txt"));
      const session = await f.create("changes-current");
      const sessionChanges = await f.request(`${f.api}/sessions/${session.id}/workspace?view=changes`);
      assert.equal(sessionChanges.status, 200);
      assert.equal("files" in sessionChanges.body.project, false);
      assert.equal(sessionChanges.body.project.path, f.installation);
      for (const path of [
        `${f.api}/workspace?view=files`, `${f.api}/workspace?view=other`, `${f.api}/workspace?view=changes&view=changes`,
        `${f.api}?view=changes`, "/api/projects?view=changes", "/api/project/directories?view=unsupported", `${f.api}/sessions/workspace?view=changes`, `${f.api}/files?path=tracked.txt&view=changes`,
      ]) assert.equal((await f.request(path)).status, 400, path);
      assert.equal(f.adapters.size, 0);
    } finally { await f.close(); }
  });

  it("loads metadata and directory data without bootstrap history or unrelated registry enumeration", async (t) => {
    const f = await fixture();
    try {
      t.mock.method(f.registry, "list", () => { throw new Error("A scoped read must not enumerate unrelated projects"); });
      t.mock.method(SessionCatalog.prototype, "list", () => { throw new Error("Directory reads must not parse session histories"); });
      let directoryReads = 0;
      const read = WorkspaceReader.prototype.read;
      t.mock.method(WorkspaceReader.prototype, "read", function (this: WorkspaceReader, ...args: Parameters<WorkspaceReader["read"]>) { directoryReads++; return read.apply(this, args); });
      const metadata = await f.request(f.api);
      assert.equal(metadata.status, 200);
      assert.deepEqual(Object.keys(metadata.body), ["project"]);
      assert.equal(directoryReads, 0, "metadata must not enumerate workspace files");
      const directory = await f.request(`${f.api}/workspace`);
      assert.equal(directory.status, 200);
      assert.deepEqual(Object.keys(directory.body).sort(), ["project", "renderedAt"]);
      assert.ok(directory.body.project.files.includes("tracked.txt"));
      assert.equal(directoryReads, 1);
      assert.equal(f.adapters.size, 0);
    } finally { await f.close(); }
  });

  it("defaults to the current project files while retaining explicit isolated worktrees and captured retry modes", async () => {
    const f = await fixture();
    try {
      writeFileSync(join(f.installation, "tracked.txt"), "local source edit\n");
      writeFileSync(join(f.installation, "untracked.txt"), "untracked source\n");
      const branch = f.git("symbolic-ref", "HEAD"), index = f.git("ls-files", "--stage"), worktrees = f.git("worktree", "list", "--porcelain");
      const session = await f.create("current-default");
      assert.equal(session.workspace?.mode, "current-branch");
      assert.equal(session.workspace?.executionRoot, f.installation);
      assert.equal(f.git("symbolic-ref", "HEAD"), branch);
      assert.equal(f.git("ls-files", "--stage"), index);
      assert.equal(f.git("worktree", "list", "--porcelain"), worktrees);
      assert.equal(existsSync(join(f.root, "worktrees")), false);
      const api = `${f.api}/sessions/${session.id}`;
      assert.equal((await f.request(`${api}/files?path=tracked.txt`)).body.content, "local source edit\n");
      assert.equal((await f.request(`${api}/files?path=untracked.txt`)).body.content, "untracked source\n");
      assert.match((await f.request(`${api}/changes?path=tracked.txt`)).body.content, /local source edit/);
      assert.equal((await f.request(`${api}/workspace`)).body.project.path, f.installation);
      assert.equal(f.adapters.size, 0, "creating and inspecting a session must not start Pi");
      assert.equal((await f.request(`${api}/commands`, { type: "initialize" })).status, 202);
      assert.equal(f.adapters.get(session.id)?.state.cwd, f.installation);
      assert.equal((await f.create("current-default")).id, session.id);
      const conflict = await f.request(`${f.api}/sessions`, { operationId: "current-default", workspaceMode: "worktree" });
      assert.equal(conflict.status, 409);
      const isolated = await f.create("explicit-worktree", "worktree");
      assert.equal(isolated.workspace?.mode, "worktree");
      assert.notEqual(isolated.workspace?.executionRoot, f.installation);
      assert.equal((await f.request(`${f.api}/sessions/${isolated.id}/files?path=tracked.txt`)).body.content, "committed fixture\n");
      assert.equal((await f.create("explicit-worktree")).id, isolated.id, "an omitted retry mode preserves an existing worktree");
      assert.equal(f.repository.read(f.project.id, session.id).session.workspace?.mode, "current-branch");
      assert.equal(readFileSync(join(f.installation, "tracked.txt"), "utf8"), "local source edit\n");
    } finally { await f.close(); }
  });

  it("rejects invalid create/continue modes before metadata or runtime side effects", async () => {
    const f = await fixture();
    try {
      const worktrees = f.git("worktree", "list", "--porcelain");
      for (const workspaceMode of [null, "", "project", false, 1, {}, ["worktree"]]) {
        assert.equal((await f.request(`${f.api}/sessions`, { operationId: "invalid-mode", workspaceMode })).status, 400);
      }
      assert.equal(f.repository.list(f.project.id).length, 0);
      assert.equal(existsSync(join(f.installation, ".kiva", "web", "sessions")), false);
      assert.equal(f.git("worktree", "list", "--porcelain"), worktrees);
      assert.equal(f.adapters.size, 0);
      const session = await f.create("valid-current");
      const api = `${f.api}/sessions/${session.id}`;
      await f.request(`${api}/commands`, { type: "initialize" });
      const adapter = f.adapters.get(session.id)!;
      assert.equal((await f.request(`${api}/continue`, { operationId: "bad-continue", workspaceMode: "project" })).status, 400);
      assert.equal(adapter.starts(), 1);
      assert.equal(adapter.stops(), 0, "invalid continuation must not release an idle owner");
      assert.equal(f.repository.list(f.project.id).length, 1);
    } finally { await f.close(); }
  });

  it("permits only history deletion for a current-branch session, preserving project files and branch", async () => {
    const f = await fixture();
    try {
      const session = await f.create("shared-deletion");
      const api = `${f.api}/sessions/${session.id}`;
      writeFileSync(join(f.installation, "tracked.txt"), "keep this dirty file\n");
      writeFileSync(join(f.installation, "local.txt"), "keep untracked file\n");
      const history = join(f.installation, ".kiva", "sessions"); mkdirSync(history, { recursive: true });
      const file = join(history, `${session.id}.jsonl`);
      const transcript = `${JSON.stringify({ type: "session", version: 3, id: session.id, timestamp: new Date().toISOString(), cwd: f.installation })}\n`;
      writeFileSync(file, transcript);
      const branch = f.git("symbolic-ref", "HEAD"), worktrees = f.git("worktree", "list", "--porcelain");
      const metadata = join(f.installation, ".kiva", "web", "sessions", `${session.id}.json`);
      const preview = await f.request(`${api}/deletion-preview`, {});
      assert.equal(preview.status, 200); assert.equal(preview.body.removeWorktree, false);
      const before = readFileSync(metadata, "utf8");
      const forged = await f.request(`${api}/actions`, { type: "delete", confirmation: preview.body.confirmation, removeWorktree: true });
      assert.equal(forged.status, 409);
      assert.equal(readFileSync(metadata, "utf8"), before);
      assert.equal(readFileSync(file, "utf8"), transcript);
      assert.equal(f.repository.read(f.project.id, session.id).session.collection, "active");
      const refreshed = await f.request(`${api}/deletion-preview`, {});
      const removed = await f.request(`${api}/actions`, { type: "delete", confirmation: refreshed.body.confirmation, removeWorktree: false });
      assert.equal(removed.status, 200); assert.equal(removed.body.history, "trashed");
      assert.equal(f.repository.read(f.project.id, session.id).session.collection, "trash");
      assert.equal(readFileSync(join(f.installation, "tracked.txt"), "utf8"), "keep this dirty file\n");
      assert.equal(readFileSync(join(f.installation, "local.txt"), "utf8"), "keep untracked file\n");
      assert.equal(f.git("symbolic-ref", "HEAD"), branch);
      assert.equal(f.git("worktree", "list", "--porcelain"), worktrees);
      assert.equal((await f.request(`${api}/actions`, { type: "restore_deleted" })).status, 200);
      assert.equal(f.repository.resolveExecution(f.project.id, session.id).executionRoot, f.installation);
      assert.equal(f.adapters.size, 0);
    } finally { await f.close(); }
  });

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
      const session = await f.create("project-visibility", "worktree");
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
      const a = await f.create("operation-a", "worktree"), b = await f.create("operation-b", "worktree");
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
      const session = await f.create("operation-delete", "worktree"), path = `${f.api}/sessions/${session.id}`;
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
      const clean = await f.create("operation-clean", "worktree"), cleanPath = `${f.api}/sessions/${clean.id}`;
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
