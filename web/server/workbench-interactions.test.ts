import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { WorkspaceShell } from "../features/workspace/shell";
import { parseWorkspaceRoute } from "../features/workspace/route";
import SessionPage from "../app/(workspace)/projects/[projectId]/sessions/[sessionId]/page";
import SessionsPage from "../app/(workspace)/projects/[projectId]/sessions/page";
import FilesPage from "../app/(workspace)/projects/[projectId]/sessions/[sessionId]/files/page";
import ProjectFilesPage from "../app/(workspace)/projects/[projectId]/files/page";
import ChangesPage from "../app/(workspace)/projects/[projectId]/sessions/[sessionId]/changes/page";
import ArchivePage from "../app/(workspace)/projects/[projectId]/archive/page";
import TrashPage from "../app/(workspace)/projects/[projectId]/trash/page";
import ProjectsPage from "../app/(workspace)/projects/page";
import type { BootstrapData } from "../shared/types";
import type { RuntimeSnapshot } from "../shared/runtime-types";
import type { DeletionPreview, SessionResource, ProjectResource } from "../shared/workspace-contract";
import { formatMessageTime } from "../shared/message-time";

const p: ProjectResource = { id: "alpha", name: "Alpha", path: "/repo", capability: { state: "ready", repositoryRoot: "/repo", commonDirectory: "/repo/.git", projectSubdirectory: "", head: "base", branch: "main" } };
function session(id: string, overrides: Partial<SessionResource> = {}): SessionResource {
  return { id, projectId: "alpha", name: `Session ${id}`, path: `/repo/.kiva/sessions/${id}.jsonl`, preview: id, updatedAt: "2026-10-20T16:00:00Z", createdAt: "2026-10-20T16:00:00Z", collection: "active", legacy: false, executable: true, workspace: { projectId: "alpha", sessionId: id, operationId: id, managedRoot: "/worktrees", treeRoot: `/worktrees/${id}`, executionRoot: `/worktrees/${id}`, repositoryRoot: "/repo", commonDirectory: "/repo/.git", projectSubdirectory: "", branch: `kiva/session/${id}`, baseCommit: "base", state: "ready" }, ...overrides };
}
function snapshot(id = "one", changes: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return { status: "idle", session: { id, messageCount: 0 }, messages: [], thinkingLevel: "medium", thinkingLevels: ["off", "medium", "high"], model: { provider: "test", id: "test-model" }, models: [{ provider: "test", id: "test-model", contextWindow: 100_000, reasoning: true }], context: { tokens: 25_000, contextWindow: 100_000, percent: 25, input: 20_000, output: 5_000, cacheRead: 0, cacheWrite: 0, total: 30_000, cost: 0.1234 }, queue: { steering: [], followUp: [] }, commands: [], ...changes };
}
const bootstrap: BootstrapData = { renderedAt: "2026-10-20T16:00:30Z", project: { name: "Alpha", path: "/repo", branch: "main", dirtyFiles: 1, files: ["README.md", "src/main.ts"], changes: [{ status: "M", path: "README.md" }] }, runtime: { piVersion: "1.3.0", modelConfigFound: true, status: "ready" }, sessions: [], recentProjects: ["/repo"] };

class FakeWebSocket {
  static sockets: FakeWebSocket[] = [];
  onopen?: () => void; onmessage?: (message: { data: string }) => void; onerror?: () => void; onclose?: (event: { code: number }) => void;
  closed = false; seq = 0;
  constructor(readonly url: string) { FakeWebSocket.sockets.push(this); }
  close() { this.closed = true; }
  publish(event: unknown, scope = { projectId: "alpha", sessionId: "one" }) { this.onmessage?.({ data: JSON.stringify({ protocol: 1, ...scope, streamId: "stream", seq: ++this.seq, event }) }); }
}
function text(node: ReactTestInstance): string { return node.children.map((child) => typeof child === "string" ? child : text(child)).join(""); }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("routed workspace features", () => {
  let renderer: ReactTestRenderer | undefined;
  let requests: Array<{ url: string; body?: Record<string, unknown> }>;
  let sessions: SessionResource[];
  let currentSnapshot: RuntimeSnapshot;
  let currentHref: string;
  let pendingNavigation: Promise<void>;
  let extraFetch: ((url: string, init?: RequestInit) => Promise<Response | undefined>) | undefined;
  let preview: DeletionPreview;
  let confirm = true;
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = globalThis.window;
  const originalLocation = globalThis.location;
  const originalStorage = globalThis.sessionStorage;
  const events = new Map<string, Set<(event: unknown) => void>>();

  async function page(href: string): Promise<ReactNode> {
    const route = parseWorkspaceRoute(href.split("?")[0]);
    if (!route.projectId) return ProjectsPage();
    const params = Promise.resolve({ projectId: route.projectId, sessionId: route.sessionId! });
    if (route.section === "archive") return ArchivePage({ params });
    if (route.section === "trash") return TrashPage({ params });
    if (route.section === "files") return route.sessionId ? FilesPage({ params }) : ProjectFilesPage({ params });
    if (route.section === "changes") return ChangesPage({ params });
    return route.sessionId ? SessionPage({ params }) : SessionsPage({ params });
  }
  async function renderRoute(href: string) {
    currentHref = href;
    const parsed = new URL(href, "http://localhost");
    const content = await page(href);
    const element = createElement(WorkspaceShell, { pathname: parsed.pathname, search: parsed.search.slice(1), navigate, children: content });
    if (renderer) renderer.update(element); else renderer = create(element);
    await settle();
  }
  function navigate(href: string) { pendingNavigation = renderRoute(href); }
  async function open(href = "/projects/alpha/sessions/one") { await act(async () => { await renderRoute(href); }); }
  async function click(node: ReactTestInstance) { await act(async () => { node.props.onClick({ button: 0, preventDefault() {} }); await pendingNavigation; await settle(); }); }
  const button = (label: string) => renderer!.root.findAllByType("button").find((node) => text(node) === label)!;
  const commandRequests = () => requests.filter((entry) => entry.url.endsWith("/commands"));
  async function publish(value = currentSnapshot, socket = FakeWebSocket.sockets.at(-1)!) { await act(async () => { socket.onopen?.(); socket.publish({ type: "snapshot", snapshot: value }, { projectId: "alpha", sessionId: value.session.id }); }); }

  beforeEach(() => {
    renderer = undefined; requests = []; sessions = [session("one"), session("two")]; currentSnapshot = snapshot(); preview = { projectId: "alpha", sessionId: "one", sessionName: "Session one", collection: "active", confirmation: "target-state-token", workspace: { state: "clean", treeRoot: "/worktrees/one", branch: "kiva/session/one", revision: "revision", localChanges: [] }, removeWorktree: true, recovery: "恢复历史不会重建工作文件" }; extraFetch = undefined; confirm = true; FakeWebSocket.sockets = []; events.clear(); pendingNavigation = Promise.resolve();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener(name: string, callback: (event: unknown) => void) { const listeners = events.get(name) ?? new Set(); listeners.add(callback); events.set(name, listeners); }, removeEventListener(name: string, callback: (event: unknown) => void) { events.get(name)?.delete(callback); }, confirm: () => confirm, prompt: () => "Renamed" } });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol: "http:", host: "localhost:30141" } });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { setItem() {}, getItem() { return null; } } });
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeWebSocket });
    globalThis.fetch = async (input, init) => {
      const url = String(input); const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined; requests.push({ url, body });
      const custom = await extraFetch?.(url, init); if (custom) return custom;
      if (url === "/api/projects" && init?.method === "POST") return Response.json({ project: { ...p, id: "beta", path: body.path } });
      if (url === "/api/projects") return Response.json({ projects: [p] });
      if (url === "/api/projects/alpha") return Response.json({ project: p, bootstrap });
      if (url === "/api/projects/beta") return Response.json({ project: { ...p, id: "beta" }, bootstrap });
      if (url === "/api/projects/alpha/sessions" && init?.method === "POST") return Response.json({ projectId: "alpha", sessionId: "created", session: session("created") });
      if (url === "/api/projects/alpha/sessions") return Response.json({ active: sessions.filter((item) => item.collection === "active"), archived: sessions.filter((item) => item.collection === "archived"), trash: sessions.filter((item) => item.collection === "trash") });
      if (url.endsWith("/workspace")) return Response.json({ ...bootstrap, project: { ...bootstrap.project, path: url.includes("/sessions/") ? "/worktrees/one" : "/repo" } });
      if (url.includes("/files?")) return Response.json({ path: new URL(url, "http://localhost").searchParams.get("path"), content: "# Real file" });
      if (url.includes("/changes?")) return Response.json({ path: "README.md", content: "diff --git a/README.md b/README.md" });
      if (url.startsWith("/api/project/directories")) { const path = new URL(url, "http://localhost").searchParams.get("path") ?? "/repo"; return Response.json({ path, parent: "/", directories: path === "/repo" ? [{ name: "other", path: "/repo/other" }] : [] }); }
      if (url.endsWith("/deletion-preview")) return Response.json(preview);
      if (url.endsWith("/continue")) return Response.json({ projectId: "alpha", sessionId: "continued", session: session("continued") });
      if (url.endsWith("/actions")) return Response.json({ status: "complete", history: "trashed", workspace: body.removeWorktree ? "removed" : "retained" });
      if (url.endsWith("/commands")) return Response.json({ accepted: true });
      const id = url.split("/").at(-1)!; const found = sessions.find((item) => item.id === id) ?? session(id);
      return Response.json({ projectId: "alpha", sessionId: id, session: found, snapshot: { ...currentSnapshot, session: { ...currentSnapshot.session, id } }, lifecycle: "dormant", executable: found.executable });
    };
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount());
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["WebSocket", originalWebSocket], ["window", originalWindow], ["location", originalLocation], ["sessionStorage", originalStorage]] as const) { if (value !== undefined) Object.defineProperty(globalThis, name, { configurable: true, value }); else Reflect.deleteProperty(globalThis, name); }
  });

  it("uses actual route pages and scoped reads without commands on navigation", async () => {
    await open();
    assert.equal(commandRequests().length, 0);
    assert.match(FakeWebSocket.sockets[0].url, /\/api\/projects\/alpha\/sessions\/one\/events$/);
    const fileLink = renderer!.root.findAllByType("a").find((node) => text(node) === "文件")!;
    assert.equal(fileLink.props.href, "/projects/alpha/sessions/one/files"); await click(fileLink);
    await click(button("README.md"));
    assert.equal(currentHref, "/projects/alpha/sessions/one/files?path=README.md");
    assert.ok(renderer!.root.findAllByType("pre").some((node) => text(node) === "# Real file"));
    assert.equal(commandRequests().length, 0); assert.equal(FakeWebSocket.sockets[0].closed, true);
    await open("/projects/alpha/files?path=README.md");
    assert.ok(renderer!.root.findAllByType("span").some((node) => text(node).includes("原项目目录")));
  });

  it("retains project collapse/search ordering and creates while another session runs", async () => {
    await open(); await publish(snapshot("one", { status: "running" }));
    const row = renderer!.root.findByProps({ className: "project-card" });
    assert.deepEqual(row.findAllByType("button").map((node) => node.props.className), ["project-toggle", "project-new-session", "project-search", "project-collapse"]);
    await click(renderer!.root.findByProps({ className: "project-toggle" }));
    assert.equal(renderer!.root.findByProps({ id: "project-sessions-alpha" }).props.hidden, true);
    assert.ok(!requests.some((entry) => entry.url.includes("directories")));
    await click(renderer!.root.findByProps({ className: "project-search" }));
    assert.equal(renderer!.root.findByProps({ id: "project-sessions-alpha" }).props.hidden, false);
    const search = renderer!.root.findByProps({ placeholder: "搜索会话" });
    await act(() => search.props.onChange({ target: { value: "Session two" } }));
    assert.equal(renderer!.root.findAllByProps({ className: "session-item-title" }).length, 1);
    assert.equal(renderer!.root.findByProps({ className: "project-new-session" }).props.disabled, false);
    await click(renderer!.root.findByProps({ className: "project-new-session" }));
    assert.equal(currentHref, "/projects/alpha/sessions/created");
    assert.ok(requests.some((entry) => entry.url === "/api/projects/alpha/sessions" && typeof entry.body?.operationId === "string"));
    assert.ok(commandRequests().every((entry) => entry.body?.type !== "new_session" && entry.body?.type !== "switch_session"));
  });

  it("retains scoped draft and attachment memory across file and session navigation", async () => {
    await open();
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "source draft" } }));
    const attachment = { name: "note.md", type: "text/plain", size: 3, text: async () => "abc" };
    await act(async () => renderer!.root.findByProps({ type: "file" }).props.onChange({ target: { files: [attachment], value: "file" } }));
    await open("/projects/alpha/sessions/two");
    assert.equal(renderer!.root.findByType("textarea").props.value, "");
    await open("/projects/alpha/sessions/one/files"); await open();
    assert.equal(renderer!.root.findByType("textarea").props.value, "source draft");
    assert.equal(renderer!.root.findAllByProps({ "aria-label": "移除 note.md" }).length, 1);
  });

  it("restores a failed async send only into its captured source draft", async () => {
    const response = deferred<Response>();
    extraFetch = async (url) => url.endsWith("/commands") ? response.promise : undefined;
    await open(); await publish();
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "restore one" } }));
    let submission!: Promise<void>;
    await act(() => { submission = renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    await open("/projects/alpha/sessions/two");
    response.resolve(Response.json({ error: "failed source send" }, { status: 409 }));
    await act(async () => { await submission; });
    assert.equal(renderer!.root.findByType("textarea").props.value, "");
    await open(); assert.equal(renderer!.root.findByType("textarea").props.value, "restore one");
  });

  it("ignores late previews and scoped events from the previous identity", async () => {
    const stale = deferred<Response>();
    extraFetch = async (url) => url.includes("/files?path=README") ? stale.promise : undefined;
    await open(); const old = FakeWebSocket.sockets[0];
    await open("/projects/alpha/sessions/one/files?path=README.md");
    await open("/projects/alpha/sessions/two/files?path=src%2Fmain.ts");
    stale.resolve(Response.json({ path: "README.md", content: "STALE PREVIEW" }));
    await act(async () => { old.publish({ type: "snapshot", snapshot: snapshot("one", { messages: [{ id: "stale", role: "user", text: "STALE MESSAGE", thinking: "", tools: [] }] }) }); await settle(); });
    assert.doesNotMatch(text(renderer!.root), /STALE PREVIEW|STALE MESSAGE/);
  });

  it("preserves confirmed identity and ignores cancelled or late create navigation", async () => {
    const result = deferred<Response>(); extraFetch = async (url, init) => url === "/api/projects/alpha/sessions" && init?.method === "POST" ? result.promise : undefined;
    await open(); let action!: Promise<void>;
    await act(() => { action = renderer!.root.findByProps({ className: "project-new-session" }).props.onClick(); });
    await open("/projects/alpha/files");
    result.resolve(Response.json({ projectId: "alpha", sessionId: "late", session: session("late") }));
    await act(async () => { await settle(); await action; });
    assert.equal(currentHref, "/projects/alpha/files");
    extraFetch = async (url, init) => url === "/api/projects/alpha/sessions" && init?.method === "POST" ? Response.json({ cancelled: true }) : undefined;
    await click(renderer!.root.findByProps({ className: "project-new-session" }));
    assert.equal(currentHref, "/projects/alpha/files");
  });

  it("retains title-free header, mobile drawer, empty right panel and real directory picker", async () => {
    await open();
    const header = renderer!.root.findByProps({ className: "conversation-header" }); assert.equal(text(header), "");
    await click(renderer!.root.findByProps({ "aria-label": "打开导航" })); assert.match(renderer!.root.findByType("main").props.className, /sidebar-mobile-open/);
    await click(renderer!.root.findByProps({ "aria-label": "切换右侧栏" })); assert.equal(renderer!.root.findByProps({ className: "inspector" }).children.length, 0);
    await click(renderer!.root.findByProps({ "aria-label": "添加项目" }));
    assert.ok(requests.some((entry) => entry.url.startsWith("/api/project/directories")));
    await click(button("other")); await click(button("使用此文件夹"));
    assert.ok(requests.some((entry) => entry.url === "/api/projects" && entry.body?.path === "/repo/other"));
    assert.equal(currentHref, "/projects/beta/sessions");
  });

  it("preserves model/thinking/context controls and queue/abort in the composer", async () => {
    await open(); await publish();
    const form = renderer!.root.findByType("form");
    assert.deepEqual(form.findByProps({ className: "composer-settings" }).children.map((child) => typeof child === "string" ? child : child.props.className), ["composer-context", "composer-select composer-model", "composer-select composer-thinking"]);
    await act(async () => renderer!.root.findByProps({ "aria-label": "选择模型" }).props.onChange({ target: { value: JSON.stringify({ provider: "test", id: "test-model" }) } }));
    await act(async () => renderer!.root.findByProps({ "aria-label": "思考强度" }).props.onChange({ target: { value: "high" } }));
    await click(renderer!.root.findByProps({ "aria-label": "上下文使用量" }));
    assert.match(text(renderer!.root.findByProps({ id: "composer-context-details" })), /25%|25,000/);
    confirm = false; await click(button("压缩上下文")); assert.ok(!commandRequests().some((entry) => entry.body?.type === "compact"));
    confirm = true; await click(button("压缩上下文"));
    await publish(snapshot("one", { status: "running", queue: { steering: ["steer one"], followUp: ["follow one"] } }));
    assert.equal(renderer!.root.findByProps({ "aria-label": "选择模型" }).props.disabled, true);
    await click(renderer!.root.findByProps({ "aria-label": "清空队列" })); await click(renderer!.root.findByProps({ "aria-label": "停止" }));
    assert.deepEqual(commandRequests().map((entry) => entry.body?.type), ["set_model", "set_thinking", "compact", "clear_queue", "abort"]);
    assert.ok(commandRequests().every((entry) => entry.url === "/api/projects/alpha/sessions/one/commands"));
  });

  it("renders original timestamps and keeps live tool ownership through event updates", async () => {
    const timestamp = Date.parse("2006-01-02T15:04:05Z"); await open(); await publish(snapshot("one", { messages: [{ id: "known", timestamp, role: "assistant", text: "History", thinking: "", tools: [] }, { id: "unknown", role: "assistant", text: "Old", thinking: "", tools: [] }] }));
    const times = renderer!.root.findAllByType("time"); assert.equal(times[0].props.dateTime, "2006-01-02T15:04:05.000Z"); assert.equal(text(times[0]), formatMessageTime(timestamp)); assert.equal(text(times[1]), "时间未知");
    await publish();
    const socket = FakeWebSocket.sockets.at(-1)!;
    await act(() => { socket.publish({ type: "pi_event", event: { type: "message_start", message: { role: "assistant", timestamp } } }); socket.publish({ type: "pi_event", event: { type: "message_end", message: { role: "assistant", content: [] } } }); socket.publish({ type: "pi_event", event: { type: "tool_execution_start", toolCallId: "read", toolName: "read", args: { path: "README.md" } } }); socket.publish({ type: "pi_event", event: { type: "tool_execution_end", toolCallId: "read", result: "result", isError: false } }); });
    assert.equal(renderer!.root.findAllByProps({ className: "assistant-message" }).length, 1);
    assert.equal(renderer!.root.findByType("time").props.dateTime, "2006-01-02T15:04:05.000Z");
    assert.equal(renderer!.root.findByProps({ "data-status": "done" }).props.className, "tool-status");
  });

  it("keeps legacy history read-only and explicitly continues to a confirmed new URL", async () => {
    sessions[0] = session("one", { legacy: true, executable: false, workspace: undefined });
    await open(); assert.equal(renderer!.root.findAllByType("textarea").length, 0); assert.match(text(renderer!.root), /不会还原历史代码/); assert.equal(commandRequests().length, 0);
    await click(button("在独立工作区继续")); assert.equal(currentHref, "/projects/alpha/sessions/continued");
  });

  it("continues an assistant received in a running snapshot without duplicating it", async () => {
    await open();
    await publish(snapshot("one", { status: "running", messages: [{ id: "streaming-owner", role: "assistant", text: "partial", thinking: "", tools: [] }] }));
    const socket = FakeWebSocket.sockets.at(-1)!;
    await act(() => { socket.publish({ type: "pi_event", event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: " continued" } } }); socket.publish({ type: "pi_event", event: { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "partial continued" }] } } }); });
    assert.equal(renderer!.root.findAllByProps({ className: "assistant-message" }).length, 1);
    assert.match(text(renderer!.root.findByProps({ className: "assistant-body" })), /partial continued/);
    await act(() => socket.publish({ type: "pi_event", event: { type: "message_start", message: { role: "assistant", timestamp: 123 } } }));
    assert.equal(renderer!.root.findAllByProps({ className: "assistant-message" }).length, 2, "A later assistant start still gets its own row");
  });

  it("loads cold runtime controls only by explicit action and scopes extension responses", async () => {
    currentSnapshot = snapshot("one", { models: [], thinkingLevels: [] });
    await open(); await publish(); assert.equal(commandRequests().length, 0);
    await click(button("加载模型与运行设置"));
    await publish(snapshot("one", { uiRequest: { id: "extension-one", method: "confirm", title: "Extension confirmation" } }));
    await click(button("取消"));
    assert.deepEqual(commandRequests().map((entry) => entry.body?.type), ["initialize", "extension_ui_response"]);
    assert.equal(commandRequests()[1].body?.id, "extension-one"); assert.equal(commandRequests()[1].body?.cancelled, true);
  });

  it("rejects duplicate selected paths and missing resources without showing another preview", async () => {
    await open("/projects/alpha/sessions/one/files?path=README.md&path=src%2Fmain.ts");
    assert.match(text(renderer!.root), /重复的 path 参数/); assert.ok(!requests.some((entry) => entry.url.includes("/files?")));
    await open("/projects/alpha/sessions/one?sessionId=two"); assert.match(text(renderer!.root), /资源标识只能出现在路径中/);
    extraFetch = async (url) => url === "/api/projects/alpha/sessions/missing" ? Response.json({ error: "Session not found" }, { status: 404 }) : undefined;
    await open("/projects/alpha/sessions/missing"); assert.match(text(renderer!.root), /Session not found/); assert.equal(renderer!.root.findAllByType("textarea").length, 0);
  });

  it("reuses collection pages and preserves stable session URLs across archives", async () => {
    sessions = [session("archived", { collection: "archived", executable: false }), session("trashed", { collection: "trash", executable: false })];
    await open("/projects/alpha/archive");
    const archived = renderer!.root.findAllByType("a").find((node) => node.props.href === "/projects/alpha/sessions/archived")!; assert.ok(archived);
    await open("/projects/alpha/trash"); assert.ok(renderer!.root.findAllByType("a").some((node) => node.props.href === "/projects/alpha/sessions/trashed"));
  });

  it("defaults cleanup checked, blocks dirty cleanup, and sends unchecked history-only choice", async () => {
    preview.workspace.state = "dirty"; preview.workspace.localChanges = ["?? work.txt"];
    await open(); await click(renderer!.root.findByProps({ "aria-label": "会话操作 Session one" })); await click(button("删除"));
    const checkbox = renderer!.root.findByProps({ type: "checkbox" }); assert.equal(checkbox.props.checked, true); assert.equal(button("删除会话").props.disabled, true);
    await act(() => checkbox.props.onChange({ target: { checked: false } })); assert.equal(button("删除会话").props.disabled, false);
    await click(button("删除会话"));
    assert.ok(requests.some((entry) => entry.url.endsWith("/actions") && entry.body?.confirmation === "target-state-token" && entry.body.removeWorktree === false));
  });

  it("keeps exact target visible on busy preview and reports raw partial deletion truthfully", async () => {
    extraFetch = async (url) => url.endsWith("/deletion-preview") ? Response.json({ error: "Task is busy" }, { status: 409 }) : undefined;
    await open(); await click(renderer!.root.findByProps({ "aria-label": "会话操作 Session one" })); await click(button("删除"));
    assert.match(text(renderer!.root.findByProps({ role: "dialog" })), /one.*\/worktrees\/one/s); assert.equal(button("删除会话").props.disabled, true);
    extraFetch = async (url) => url.endsWith("/actions") ? Response.json({ status: "partial", history: "retained", workspace: "removed", error: "history move failed" }) : undefined;
    await click(button("重新检查")); await click(button("删除会话"));
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 1); assert.match(text(renderer!.root), /history move failed/); assert.equal(button("删除会话").props.disabled, true);
  });

  it("resumes a persisted partial deletion from trash with its original cleanup choice", async () => {
    const deletion = { operationId: "original-operation", status: "partial" as const, history: "trashed" as const, workspace: "removed" as const, removeWorktree: true, error: "cleanup metadata failed" };
    sessions = [session("one", { collection: "trash", executable: false, deletion, workspace: { ...session("one").workspace!, state: "removed" } })];
    preview = { ...preview, collection: "trash", workspace: { ...preview.workspace, state: "removed" } };
    Object.assign(preview, { deletion });
    await open("/projects/alpha/trash");
    await click(renderer!.root.findAllByProps({ "aria-label": "会话操作 Session one" })[0]);
    await click(button("重试删除"));
    assert.match(text(renderer!.root.findByProps({ role: "dialog" })), /original-operation.*历史 trashed，工作区 removed/s);
    assert.equal(renderer!.root.findAllByProps({ type: "checkbox" }).length, 0);
    await click(button("删除会话"));
    const command = requests.find((entry) => entry.url.endsWith("/actions"))!;
    assert.equal(command.body?.removeWorktree, true); assert.equal(command.body?.confirmation, "target-state-token");
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
  });
});
