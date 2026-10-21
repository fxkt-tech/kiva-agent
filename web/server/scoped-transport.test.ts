import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync } from "node:fs";
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
