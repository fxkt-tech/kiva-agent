import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { installUiMocks } from "./helpers/mock-ui";

installUiMocks();
const { WorkspaceShell } = await import("../features/workspace/shell");
const { Dialog } = await import("../components/ui/dialog");
import { parseWorkspaceRoute } from "../features/workspace/route";
const { default: SessionPage } = await import("../app/(workspace)/projects/[projectId]/sessions/[sessionId]/page");
const { default: SessionsPage } = await import("../app/(workspace)/projects/[projectId]/sessions/page");
const { default: FilesPage } = await import("../app/(workspace)/projects/[projectId]/sessions/[sessionId]/files/page");
const { default: ProjectFilesPage } = await import("../app/(workspace)/projects/[projectId]/files/page");
const { default: ChangesPage } = await import("../app/(workspace)/projects/[projectId]/sessions/[sessionId]/changes/page");
const { default: ArchivePage } = await import("../app/(workspace)/projects/[projectId]/archive/page");
const { default: TrashPage } = await import("../app/(workspace)/projects/[projectId]/trash/page");
const { default: ProjectsPage } = await import("../app/(workspace)/projects/page");
import type { BootstrapData } from "../shared/types";
import type { RuntimeSnapshot } from "../shared/runtime-types";
import type { ModelConfiguration } from "../shared/model-configuration";
import type { DeletionPreview, SessionResource, ProjectResource } from "../shared/workspace-contract";
import { formatMessageTime } from "../shared/message-time";
import { webPreferences } from "../lib/web-preferences";
import { isMacPlatform } from "../lib/shortcuts";
import { DEFAULT_WEB_PREFERENCES, WEB_PREFERENCES_KEY } from "../shared/web-preferences";

const p: ProjectResource = { id: "alpha", name: "Alpha", path: "/repo", capability: { state: "ready", repositoryRoot: "/repo", commonDirectory: "/repo/.git", projectSubdirectory: "", head: "base", branch: "main" } };
function session(id: string, overrides: Partial<SessionResource> = {}): SessionResource {
  return { id, projectId: "alpha", name: `Session ${id}`, path: `/repo/.kiva/sessions/${id}.jsonl`, preview: id, updatedAt: "2026-10-20T16:00:00Z", createdAt: "2026-10-20T16:00:00Z", collection: "active", legacy: false, executable: true, workspace: { projectId: "alpha", sessionId: id, operationId: id, managedRoot: "/worktrees", treeRoot: `/worktrees/${id}`, executionRoot: `/worktrees/${id}`, repositoryRoot: "/repo", commonDirectory: "/repo/.git", projectSubdirectory: "", branch: `kiva/session/${id}`, baseCommit: "base", state: "ready" }, ...overrides };
}
function currentBranchSession(id: string, overrides: Partial<SessionResource> = {}): SessionResource {
  return session(id, { workspace: { mode: "current-branch", projectId: "alpha", sessionId: id, operationId: id, treeRoot: "/repo", executionRoot: "/repo", repositoryRoot: "/repo", commonDirectory: "/repo/.git", projectSubdirectory: "", branch: "main", baseCommit: "base", state: "ready" }, ...overrides });
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
  let visibleProjects: ProjectResource[];
  let currentSnapshot: RuntimeSnapshot;
  let defaults: ModelConfiguration | undefined;
  let currentHref: string;
  let pendingNavigation: Promise<void>;
  let extraFetch: ((url: string, init?: RequestInit) => Promise<Response | undefined>) | undefined;
  let preview: DeletionPreview;
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
  async function click(node: ReactTestInstance) { const target = typeof node.props.onClick === "function" ? node : node.findAll((child) => typeof child.type === "string" && typeof child.props.onClick === "function")[0]; assert.ok(target, "expected an actionable control"); await act(async () => { target.props.onClick({ button: 0, preventDefault() {}, stopPropagation() {} }); await pendingNavigation; await settle(); }); }
  const button = (label: string) => renderer!.root.findAll((node) => node.type === "button" || (node.type === "div" && node.props.role === "menuitem")).find((node) => text(node) === label)!;
  const trigger = (label: string) => renderer!.root.findAllByType("button").find((node) => node.props["aria-label"] === label)!;
  const field = (label: string) => renderer!.root.findAll((node) => (node.props["aria-label"] ?? node.props.label) === label && typeof node.props.onValueChange === "function")[0];
  const treeRow = (path: string) => renderer!.root.findAllByProps({ className: "workspace-tree-row" }).find((node) => node.props["data-path"] === path)!;
  const commandRequests = () => requests.filter((entry) => entry.url.endsWith("/commands"));
  async function publish(value = currentSnapshot, socket = FakeWebSocket.sockets.at(-1)!) { await act(async () => { socket.onopen?.(); socket.publish({ type: "snapshot", snapshot: value }, { projectId: "alpha", sessionId: value.session.id }); }); }

  beforeEach(() => {
    renderer = undefined; requests = []; visibleProjects = [p]; sessions = [session("one"), session("two")]; currentSnapshot = snapshot(); defaults = undefined; preview = { projectId: "alpha", sessionId: "one", sessionName: "Session one", collection: "active", confirmation: "target-state-token", workspace: { state: "clean", treeRoot: "/worktrees/one", branch: "kiva/session/one", revision: "revision", localChanges: [] }, removeWorktree: true, recovery: "恢复历史不会重建工作文件" }; extraFetch = undefined; FakeWebSocket.sockets = []; events.clear(); pendingNavigation = Promise.resolve();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener(name: string, callback: (event: unknown) => void) { const listeners = events.get(name) ?? new Set(); listeners.add(callback); events.set(name, listeners); }, removeEventListener(name: string, callback: (event: unknown) => void) { events.get(name)?.delete(callback); } } });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol: "http:", host: "localhost:9495" } });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { setItem() {}, getItem() { return null; } } });
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeWebSocket });
    webPreferences.destroy(); webPreferences.resetGroup("appearance"); webPreferences.resetGroup("conversation"); webPreferences.resetGroup("shortcuts");
    globalThis.fetch = async (input, init) => {
      const url = String(input); const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined; requests.push({ url, body });
      const custom = await extraFetch?.(url, init); if (custom) return custom;
      if (url === "/api/projects" && init?.method === "POST") { const project = body.path === p.path ? p : { ...p, id: "beta", path: body.path }; visibleProjects = [project, ...visibleProjects.filter((item) => item.id !== project.id)]; return Response.json({ project }); }
      if (url === "/api/projects") return Response.json({ projects: visibleProjects });
      if (url === "/api/settings") return Response.json({ revision: "settings_revision_1234", canAddProvider: true, providers: [], versions: { app: "0.1.0", pi: "1.3.0" }, check: { status: "ok", checkedAt: "2026-10-21T12:00:00.000Z" } });
      if (/^\/api\/projects\/(alpha|beta)\/actions$/.test(url)) { const projectId = url.split("/")[3]; visibleProjects = visibleProjects.filter((item) => item.id !== projectId); return Response.json({ projectId, projects: visibleProjects }); }
      if (url === "/api/projects/alpha") return Response.json({ project: p, bootstrap });
      if (url === "/api/projects/beta") return Response.json({ project: { ...p, id: "beta" }, bootstrap });
      if (url === "/api/settings/models" || /^\/api\/projects\/(alpha|beta)\/models$/.test(url)) {
        if (body) {
          defaults = { provider: body.provider, modelId: body.modelId, thinkingLevel: body.thinkingLevel };
          if (body.sessionId) { currentSnapshot = { ...currentSnapshot, model: { provider: body.provider, id: body.modelId }, thinkingLevel: body.thinkingLevel }; FakeWebSocket.sockets.at(-1)?.publish({ type: "snapshot", snapshot: currentSnapshot }); }
        }
        return Response.json({ revision: "catalog_revision_1234", defaults, models: [{ ...snapshot().models[0], thinkingLevels: ["off", "medium", "high"] }, { ...snapshot().models[0], id: "alternate-model", thinkingLevels: ["off", "medium", "high"] }, { ...snapshot().models[0], id: "plain-model", reasoning: false, thinkingLevels: ["off"] }] });
      }
      if (url === "/api/projects/alpha/sessions" && init?.method === "POST") return Response.json({ projectId: "alpha", sessionId: "created", session: body.workspaceMode === "current-branch" ? currentBranchSession("created") : session("created") });
      if (url === "/api/projects/alpha/sessions") return Response.json({ active: sessions.filter((item) => item.collection === "active"), archived: sessions.filter((item) => item.collection === "archived"), trash: sessions.filter((item) => item.collection === "trash") });
      if (url.endsWith("/workspace")) return Response.json({ ...bootstrap, project: { ...bootstrap.project, path: url.includes("/sessions/") ? "/worktrees/one" : "/repo" } });
      if (url.includes("/files?")) return Response.json({ path: new URL(url, "http://localhost").searchParams.get("path"), content: "# Real file" });
      if (url.includes("/changes?")) return Response.json({ path: "README.md", content: "diff --git a/README.md b/README.md" });
      if (url.startsWith("/api/project/directories")) { const path = new URL(url, "http://localhost").searchParams.get("path") ?? "/repo"; return Response.json({ path, parent: "/", directories: path === "/repo" ? [{ name: "other", path: "/repo/other" }] : [] }); }
      if (url.endsWith("/deletion-preview")) return Response.json(preview);
      if (url.endsWith("/continue")) return Response.json({ projectId: "alpha", sessionId: "continued", session: body.workspaceMode === "current-branch" ? currentBranchSession("continued") : session("continued") });
      if (url.endsWith("/actions")) return Response.json({ status: "complete", history: "trashed", workspace: body.removeWorktree ? "removed" : "retained" });
      if (url.endsWith("/commands")) return Response.json({ accepted: true });
      if (url.endsWith("/jsonl")) { const parts = url.split("/"); const content = `${JSON.stringify({ type: "session", id: parts[5], version: 3 })}\r\n${JSON.stringify({ type: "message", id: "entry", parentId: null, message: { role: "user", content: "JSONL 原文" } })}\n`; return Response.json({ projectId: parts[3], sessionId: parts[5], fileName: "original.jsonl", content, bytes: Buffer.byteLength(content), totalBytes: Buffer.byteLength(content), truncated: false }); }
      const id = url.split("/").at(-1)!; const found = sessions.find((item) => item.id === id) ?? session(id);
      return Response.json({ projectId: "alpha", sessionId: id, session: found, snapshot: { ...currentSnapshot, session: { ...currentSnapshot.session, id } }, lifecycle: "dormant", executable: found.executable });
    };
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount());
    webPreferences.destroy();
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["WebSocket", originalWebSocket], ["window", originalWindow], ["location", originalLocation], ["sessionStorage", originalStorage]] as const) { if (value !== undefined) Object.defineProperty(globalThis, name, { configurable: true, value }); else Reflect.deleteProperty(globalThis, name); }
  });

  it("uses actual route pages and scoped reads without commands on navigation", async () => {
    await open();
    assert.equal(commandRequests().length, 0);
    assert.match(FakeWebSocket.sockets[0].url, /\/api\/projects\/alpha\/sessions\/one\/events$/);
    const fileLink = renderer!.root.findAllByType("a").find((node) => text(node) === "文件")!;
    assert.equal(fileLink.props.href, "/projects/alpha/sessions/one/files"); await click(fileLink);
    await click(treeRow("README.md"));
    assert.equal(currentHref, "/projects/alpha/sessions/one/files?path=README.md");
    assert.ok(renderer!.root.findAllByType("pre").some((node) => text(node) === "# Real file"));
    assert.equal(commandRequests().length, 0); assert.equal(FakeWebSocket.sockets[0].closed, true);
    await open("/projects/alpha/files?path=README.md");
    assert.ok(renderer!.root.findAllByType("span").some((node) => text(node).includes("原项目目录")));
  });

  it("places actual session connection state first in the composer footer, independently of runtime errors", async () => {
    await open();
    const connection = () => renderer!.root.findByProps({ "aria-label": "当前会话后端连接" });
    const send = () => renderer!.root.findByProps({ "aria-label": "发送消息" });
    const footer = renderer!.root.findByProps({ className: "composer-note" });
    assert.equal(footer.children[0], connection());
    assert.equal(connection().props.role, "status"); assert.equal(connection().props["aria-live"], "polite");
    assert.equal(connection().props["data-state"], "connecting"); assert.equal(text(connection()), "连接中");
    assert.match(text(footer), /^连接中本地/);
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "retain draft" } }));
    assert.equal(send().props.disabled, true, "successful passive GETs do not prove a session transport connection");
    const socket = FakeWebSocket.sockets[0];
    await act(() => socket.onopen?.());
    assert.equal(text(connection()), "已连接"); assert.equal(send().props.disabled, false);
    await act(() => socket.publish({ type: "error", message: "model request failed" }));
    assert.equal(text(connection()), "已连接", "agent errors do not change the open transport state");
    assert.ok(renderer!.root.findAllByProps({ role: "alert" }).some((node) => text(node).includes("model request failed")));
    await act(() => socket.publish({ type: "pi_event", event: { type: "agent_start" } }));
    assert.equal(text(connection()), "已连接");
    assert.equal(commandRequests().length, 0);
  });

  it("shows reconnecting throughout retry waits and attempts, then stops on terminal policy closure", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    await open();
    const connection = () => renderer!.root.findByProps({ "aria-label": "当前会话后端连接" });
    const send = () => renderer!.root.findByProps({ "aria-label": "发送消息" });
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "keep through reconnect" } }));
    const first = FakeWebSocket.sockets[0];
    await act(() => { first.onerror?.(); first.onclose?.({ code: 1006 }); });
    assert.equal(text(connection()), "重连中");
    assert.equal(connection().props["data-state"], "reconnecting");
    assert.equal(send().props.disabled, true);
    await act(() => context.mock.timers.tick(1_499));
    assert.equal(FakeWebSocket.sockets.length, 1);
    await act(() => context.mock.timers.tick(1));
    assert.equal(FakeWebSocket.sockets.length, 2); assert.equal(text(connection()), "重连中");
    const retry = FakeWebSocket.sockets[1];
    await act(() => { first.onopen?.(); first.onerror?.(); first.onclose?.({ code: 1008 }); });
    assert.equal(text(connection()), "重连中", "a closed attempt cannot update its replacement");
    await act(() => retry.onopen?.());
    assert.equal(text(connection()), "已连接");
    assert.equal(send().props.disabled, false);
    assert.equal(renderer!.root.findAllByProps({ role: "alert" }).some((node) => text(node).includes("无法连接到 KivA 运行时")), false);
    await act(() => retry.onclose?.({ code: 1008 }));
    assert.equal(text(connection()), "已断开"); assert.equal(connection().props["data-state"], "disconnected");
    assert.equal(send().props.disabled, true);
    assert.equal(renderer!.root.findByType("textarea").props.value, "keep through reconnect");
    await act(() => context.mock.timers.tick(10_000));
    assert.equal(FakeWebSocket.sockets.length, 2, "terminal policy failures never retry");
    assert.equal(commandRequests().length, 0);
  });

  it("resets connection state and cancels retries on scope changes, including returning to the original scope", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    await open(); await publish();
    const connection = () => renderer!.root.findByProps({ "aria-label": "当前会话后端连接" });
    const first = FakeWebSocket.sockets[0];
    await act(() => first.onclose?.({ code: 1006 }));
    await open("/projects/alpha/sessions/two");
    const second = FakeWebSocket.sockets[1];
    assert.equal(text(connection()), "连接中");
    await act(() => { first.onopen?.(); first.onerror?.(); first.onclose?.({ code: 1008 }); context.mock.timers.tick(1_500); });
    assert.equal(text(connection()), "连接中"); assert.equal(FakeWebSocket.sockets.length, 2);
    await act(() => second.onopen?.());
    assert.equal(text(connection()), "已连接");
    await open();
    assert.equal(text(connection()), "连接中");
    await act(() => { first.onopen?.(); first.onerror?.(); second.onclose?.({ code: 1006 }); });
    assert.equal(text(connection()), "连接中");
    const third = FakeWebSocket.sockets[2];
    await act(() => third.onclose?.({ code: 1006 }));
    await act(() => renderer!.unmount()); renderer = undefined;
    await act(() => { third.onopen?.(); third.onerror?.(); third.onclose?.({ code: 1006 }); context.mock.timers.tick(10_000); });
    assert.equal(FakeWebSocket.sockets.length, 3, "unmount cancels the retry and ignores late callbacks");
    assert.equal(commandRequests().length, 0);
  });

  it("does not invent a session connection on project entry or confuse model catalog failures with disconnection", async () => {
    extraFetch = async (url) => url.endsWith("/models") ? Response.json({ error: "model catalog unavailable" }, { status: 503 }) : undefined;
    await open("/projects/alpha/sessions");
    assert.equal(renderer!.root.findAllByProps({ "aria-label": "当前会话后端连接" }).length, 0);
    assert.equal(FakeWebSocket.sockets.length, 0);
    await open();
    const connection = () => renderer!.root.findByProps({ "aria-label": "当前会话后端连接" });
    assert.equal(text(connection()), "连接中");
    await act(() => FakeWebSocket.sockets[0].onopen?.());
    assert.equal(text(connection()), "已连接");
    assert.ok(renderer!.root.findAllByProps({ role: "alert" }).some((node) => text(node).includes("无法读取模型列表")));
    await act(() => FakeWebSocket.sockets[0].onclose?.({ code: 1008 }));
    assert.equal(text(connection()), "已断开");
    assert.equal(commandRequests().length, 0);
  });

  it("opens the selected row's JSONL without switching or executing the viewed session", async () => {
    await open(); await publish();
    await click(trigger("会话操作 Session two"));
    await click(button("查看 JSONL"));
    assert.equal(currentHref, "/projects/alpha/sessions/one");
    assert.equal(renderer!.root.findAllByProps({ className: "session-menu" }).length, 0);
    assert.ok(renderer!.root.findAllByProps({ role: "dialog" }).some((node) => text(node).includes("Session two")));
    await click(renderer!.root.findAllByType("button").find((node) => node.props.role === "tab" && text(node) === "原始文本")!);
    const raw = text(renderer!.root.findByProps({ "aria-label": "JSONL 原始文本" }));
    assert.match(raw, /"id":"two"/); assert.match(raw, /\r\n/); assert.match(raw, /JSONL 原文/);
    assert.deepEqual(requests.filter((entry) => entry.url.endsWith("/jsonl")).map((entry) => entry.url), ["/api/projects/alpha/sessions/two/jsonl"]);
    assert.equal(requests.some((entry) => entry.body), false);
    await click(renderer!.root.findByProps({ "aria-label": "关闭 JSONL" }));
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
    assert.equal(FakeWebSocket.sockets.length, 1); assert.equal(commandRequests().length, 0);
  });

  it("hides a project only after confirmation and restores its retained sessions on reimport", async () => {
    await open(); await publish();
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "keep this draft" } }));
    await click(trigger("项目操作 Alpha"));
    await click(button("移除"));
    assert.match(text(renderer!.root.findByProps({ role: "dialog" })), /仅从项目列表中隐藏.*不会被删除.*任务会继续/);
    await click(button("取消"));
    assert.equal(requests.some((entry) => entry.body), false);
    await click(trigger("项目操作 Alpha")); await click(button("移除")); await click(button("移除项目"));
    assert.equal(currentHref, "/projects");
    assert.equal(renderer!.root.findAllByProps({ className: "project-card" }).length, 0);
    assert.deepEqual(requests.filter((entry) => entry.body).map((entry) => [entry.url, entry.body]), [["/api/projects/alpha/actions", { type: "remove" }]]);
    await click(renderer!.root.findByProps({ "aria-label": "添加项目" })); await click(button("使用此文件夹"));
    assert.equal(currentHref, "/projects/alpha/sessions");
    assert.ok(renderer!.root.findAllByProps({ className: "session-item-title" }).some((node) => text(node) === "Session one"));
    await open(); await publish();
    assert.equal(renderer!.root.findByType("textarea").props.value, "keep this draft");
    assert.equal(commandRequests().length, 0);
  });

  it("renames the chosen row through an explicit form without changing the active session", async () => {
    await open(); await publish();
    await click(trigger("会话操作 Session two")); await click(button("重命名"));
    const name = () => renderer!.root.findByProps({ "aria-label": "新的会话名称" });
    assert.equal(name().props.value, "Session two");
    await act(() => name().props.onChange({ target: { value: "  Renamed two  " } }));
    await click(button("取消"));
    assert.equal(requests.some((entry) => entry.body), false);
    await click(trigger("会话操作 Session two")); await click(button("重命名"));
    assert.equal(name().props.value, "Session two");
    await act(() => name().props.onChange({ target: { value: "  Renamed two  " } }));
    await act(async () => { renderer!.root.findByProps({ className: "rename-session-form" }).props.onSubmit({ preventDefault() {} }); await settle(); });
    assert.deepEqual(requests.filter((entry) => entry.body).map((entry) => [entry.url, entry.body]), [["/api/projects/alpha/sessions/two/actions", { type: "rename", name: "Renamed two" }]]);
    assert.equal(currentHref, "/projects/alpha/sessions/one");
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
    assert.equal(commandRequests().length, 0);
  });

  it("retains a failed rename candidate and blocks dismissal and duplicate submission while saving", async () => {
    await open(); await click(trigger("会话操作 Session two")); await click(button("重命名"));
    const form = () => renderer!.root.findByProps({ className: "rename-session-form" });
    const name = () => renderer!.root.findByProps({ "aria-label": "新的会话名称" });
    await act(() => name().props.onChange({ target: { value: "Candidate" } }));
    extraFetch = async (url) => url.endsWith("/two/actions") ? Response.json({ error: "Rename failed" }, { status: 409 }) : undefined;
    await act(async () => { form().props.onSubmit({ preventDefault() {} }); await settle(); });
    assert.equal(name().props.value, "Candidate");
    assert.match(text(renderer!.root.findByProps({ role: "alert" })), /Rename failed/);
    const gate = deferred<Response>();
    extraFetch = async (url) => url.endsWith("/two/actions") ? gate.promise : undefined;
    await act(async () => { form().props.onSubmit({ preventDefault() {} }); await settle(); });
    assert.equal(button("取消").props.disabled, true);
    await act(() => renderer!.root.findByType(Dialog).props.onOpenChange(false));
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 1);
    await act(async () => { form().props.onSubmit({ preventDefault() {} }); await settle(); });
    assert.equal(requests.filter((entry) => entry.url.endsWith("/two/actions")).length, 2);
    await act(async () => { gate.resolve(Response.json({ accepted: true })); await settle(); });
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
    assert.equal(commandRequests().length, 0);
  });

  it("keeps only name/create/trailing menu, searches through the menu and creates while another session runs", async () => {
    await open(); await publish(snapshot("one", { status: "running" }));
    const row = renderer!.root.findByProps({ className: "project-card" });
    assert.deepEqual(row.findAllByType("button").map((node) => node.props.className), ["project-toggle", "project-new-session", "project-more"]);
    assert.equal(renderer!.root.findAllByProps({ className: "project-search" }).length, 0);
    assert.equal(renderer!.root.findAllByProps({ className: "project-collapse" }).length, 0);
    await click(renderer!.root.findByProps({ className: "project-toggle" }));
    assert.equal(renderer!.root.findByProps({ id: "project-sessions-alpha" }).props.hidden, true);
    assert.ok(!requests.some((entry) => entry.url.includes("directories")));
    await click(renderer!.root.findByProps({ className: "project-more" }));
    assert.equal(renderer!.root.findByProps({ id: "project-sessions-alpha" }).props.hidden, true, "opening the menu must not expand a collapsed project");
    assert.deepEqual(renderer!.root.findByProps({ role: "menu" }).findAllByProps({ role: "menuitem" }).map(text), ["搜索会话", "移除"]);
    await click(renderer!.root.findAll((node) => node.type === "div" && node.props.role === "menuitem" && node.props["aria-label"] === "搜索 Alpha 会话")[0]);
    assert.equal(renderer!.root.findAllByProps({ role: "menu" }).length, 0);
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

  it("toggles row whitespace without treating child actions as disclosure and resets menu search", async () => {
    await open();
    const row = renderer!.root.findByProps({ className: "project-card" });
    await act(() => row.props.onClick({ target: row, currentTarget: row }));
    assert.equal(renderer!.root.findByProps({ id: "project-sessions-alpha" }).props.hidden, true);
    const action = renderer!.root.findByProps({ className: "project-more" });
    await act(() => row.props.onClick({ target: action, currentTarget: row }));
    assert.equal(renderer!.root.findByProps({ id: "project-sessions-alpha" }).props.hidden, true);
    await click(action); await click(renderer!.root.findAll((node) => node.type === "div" && node.props.role === "menuitem" && node.props["aria-label"] === "搜索 Alpha 会话")[0]);
    assert.equal(renderer!.root.findByProps({ className: "project-toggle" }).props["aria-expanded"], true);
    await act(() => renderer!.root.findByProps({ placeholder: "搜索会话" }).props.onChange({ target: { value: "Session two" } }));
    assert.equal(renderer!.root.findAllByProps({ className: "session-item-title" }).length, 1);
    await click(action); await click(renderer!.root.findAll((node) => node.type === "div" && node.props.role === "menuitem" && node.props["aria-label"] === "搜索 Alpha 会话")[0]);
    assert.equal(renderer!.root.findAllByType("input").filter((node) => node.props.placeholder === "搜索会话").length, 0);
    assert.equal(renderer!.root.findAllByProps({ className: "session-item-title" }).length, 2);
    assert.equal(currentHref, "/projects/alpha/sessions");
    assert.equal(requests.some((entry) => entry.body || entry.url.includes("directories")), false);
  });

  it("searches the scoped sessions view from the shared project menu on files", async () => {
    await open("/projects/alpha/files");
    await click(renderer!.root.findByProps({ className: "project-more" }));
    await click(renderer!.root.findAll((node) => node.type === "div" && node.props.role === "menuitem" && node.props["aria-label"] === "搜索 Alpha 会话")[0]);
    assert.equal(currentHref, "/projects/alpha/sessions");
    assert.equal(renderer!.root.findByProps({ id: "project-sessions-alpha" }).props.hidden, false);
    assert.equal(renderer!.root.findAllByType("input").filter((node) => node.props.placeholder === "搜索会话").length, 1);
    await open("/projects/alpha/files");
    await click(renderer!.root.findByProps({ className: "project-more" }));
    await click(renderer!.root.findAll((node) => node.type === "div" && node.props.role === "menuitem" && node.props["aria-label"] === "搜索 Alpha 会话")[0]);
    assert.equal(currentHref, "/projects/alpha/sessions");
    assert.equal(renderer!.root.findAllByType("input").filter((node) => node.props.placeholder === "搜索会话").length, 1, "returning from files reopens existing search rather than toggling it closed");
    assert.equal(requests.some((entry) => entry.body), false);
  });

  it("saves model and thinking together before session creation and applies both before the first prompt", async () => {
    await open("/projects/alpha/sessions");
    const choice = { provider: "test", modelId: "alternate-model", thinkingLevel: "high" };
    await click(renderer!.root.findByProps({ "aria-label": "模型与思考强度" }));
    await act(() => field("选择模型").props.onValueChange(JSON.stringify(["test", "alternate-model"])));
    await act(() => field("思考强度").props.onValueChange("high"));
    assert.doesNotMatch(text(renderer!.root.findByProps({ role: "dialog" })), /所有项目的新会话|其他已有会话不变/);
    assert.equal(requests.filter((entry) => entry.body).length, 0, "candidate changes are local until confirmation");
    await click(button("保存并应用"));
    assert.deepEqual(requests.filter((entry) => entry.body).map((entry) => entry.body), [choice]);
    assert.equal(commandRequests().length, 0, "choosing entry options must not start a runtime");
    assert.equal(requests.some((entry) => entry.url.endsWith("/sessions") && entry.body), false);
    await open("/projects/alpha/files"); await open("/projects/alpha/sessions");
    assert.match(text(renderer!.root.findByProps({ "aria-label": "模型与思考强度" })), /alternate-model.*high/);
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "use my selected model" } }));
    await act(async () => { await renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); await pendingNavigation; });
    assert.deepEqual(commandRequests().map((entry) => ({ url: entry.url, body: entry.body })), [
      { url: "/api/projects/alpha/sessions/created/commands", body: { type: "set_configuration", ...choice } },
      { url: "/api/projects/alpha/sessions/created/commands", body: { type: "prompt", message: "use my selected model", images: [], files: [] } },
    ]);
  });

  it("offers configured models in a cold existing session without an initialization step", async () => {
    currentSnapshot = snapshot("one", { models: [], thinkingLevels: [], model: undefined });
    await open(); await publish();
    const trigger = renderer!.root.findByProps({ "aria-label": "模型与思考强度" });
    assert.equal(trigger.props.disabled, false);
    assert.equal(commandRequests().length, 0, "passive options must not start the session");
    await click(trigger);
    await act(() => field("选择模型").props.onValueChange(JSON.stringify(["test", "alternate-model"])));
    await click(button("保存并应用"));
    assert.deepEqual(requests.filter((entry) => entry.body).map((entry) => entry.body), [{ provider: "test", modelId: "alternate-model", thinkingLevel: "medium", sessionId: "one" }]);
    assert.equal(commandRequests().length, 0);
    assert.match(text(renderer!.root.findByProps({ "aria-label": "模型与思考强度" })), /alternate-model.*medium/);
  });

  it("cancels candidate changes, derives non-reasoning options, and retains a failed save for retry", async () => {
    await open("/projects/alpha/sessions");
    const trigger = () => renderer!.root.findByProps({ "aria-label": "模型与思考强度" });
    await click(trigger());
    await act(() => field("选择模型").props.onValueChange(JSON.stringify(["test", "plain-model"])));
    const thinking = field("思考强度");
    assert.equal(thinking.props.value, "off"); assert.deepEqual(thinking.props.options.map((option: { value: string }) => option.value), ["off"]);
    await click(button("取消")); assert.equal(requests.filter((entry) => entry.body).length, 0);
    assert.doesNotMatch(text(trigger()), /plain-model/);
    await click(trigger());
    extraFetch = async (url, init) => url.endsWith("/models") && init?.method === "POST" ? Response.json({ error: "settings permission denied" }, { status: 500 }) : undefined;
    await click(button("保存并应用"));
    assert.match(text(renderer!.root.findByProps({ role: "dialog" })), /模型设置未保存.*settings permission denied/);
    assert.equal(renderer!.root.findAllByProps({ "data-slot": "toast" }).length, 0);
    assert.equal(button("保存并应用").props.disabled, false);
    extraFetch = undefined; await click(button("保存并应用"));
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
    const toast = renderer!.root.findByProps({ "data-slot": "toast" });
    assert.equal(toast.props.role, "status");
    assert.equal(text(toast), "模型设置已保存");
    assert.doesNotMatch(text(renderer!.root), /模型与思考强度已保存|所有项目的新会话将使用此默认设置/);
    assert.equal(renderer!.root.findAllByProps({ "data-slot": "alert" }).length, 0);
    await click(renderer!.root.findByProps({ "aria-label": "关闭提示：模型设置已保存" }));
    assert.equal(renderer!.root.findAllByProps({ "data-slot": "toast" }).length, 0);
  });

  it("presents model and file failures with the same titled, icon-led Alert", async () => {
    extraFetch = async (url) => url.endsWith("/models") || url.includes("/files?") ? Response.json({ error: "API endpoint not found" }, { status: 404 }) : undefined;
    await open("/projects/alpha/sessions");
    const modelAlert = renderer!.root.findByProps({ "data-slot": "alert" });
    assert.equal(modelAlert.props.role, "alert");
    assert.equal(modelAlert.props["data-variant"], "error");
    assert.match(text(modelAlert), /模型列表加载失败.*无法读取模型列表/);
    assert.equal(modelAlert.findAllByType("svg").length, 1);
    assert.equal(commandRequests().length, 0);
    await open("/projects/alpha/files?path=README.md");
    const fileAlert = renderer!.root.findByProps({ "data-slot": "alert" });
    assert.match(text(fileAlert), /文件读取失败.*API endpoint not found/);
    assert.equal(fileAlert.props.role, "alert");
  });

  it("uses dismissible Alerts for failed actions and preserves picker retry", async () => {
    extraFetch = async (url, init) => url === "/api/projects/alpha/sessions" && init?.method === "POST" || url.startsWith("/api/project/directories") ? Response.json({ error: "operation failed" }, { status: 409 }) : undefined;
    await open("/projects/alpha/sessions");
    await click(renderer!.root.findByProps({ className: "project-new-session" }));
    assert.match(text(renderer!.root.findByProps({ "data-slot": "alert" })), /创建会话失败.*operation failed/);
    await click(renderer!.root.findByProps({ "aria-label": "关闭提示：创建会话失败" }));
    assert.equal(renderer!.root.findAllByProps({ "data-slot": "alert" }).length, 0);
    await click(renderer!.root.findByProps({ "aria-label": "添加项目" }));
    const dialog = renderer!.root.findByProps({ role: "dialog" });
    assert.match(text(dialog.findByProps({ "data-slot": "alert" })), /无法打开目录.*operation failed/);
    extraFetch = undefined;
    await act(() => dialog.findByType("form").props.onSubmit({ preventDefault() {} }));
    assert.equal(dialog.findAllByProps({ "data-slot": "alert" }).length, 0);
    assert.equal(button("使用此文件夹").props.disabled, false);
  });

  it("renders resource failures and cleanup warnings as Alerts without enabling unsafe deletion", async () => {
    extraFetch = async (url) => url === "/api/projects/alpha/sessions/missing" ? Response.json({ error: "Session not found" }, { status: 404 }) : undefined;
    await open("/projects/alpha/sessions/missing");
    assert.match(text(renderer!.root.findByProps({ "data-slot": "alert" })), /无法打开此资源.*Session not found/);
    extraFetch = undefined; preview.workspace.state = "dirty";
    await open(); await click(trigger("会话操作 Session one")); await click(button("删除"));
    const warning = renderer!.root.findByProps({ role: "dialog" }).findByProps({ "data-slot": "alert", "data-variant": "warning" });
    assert.match(text(warning), /暂时不能清理工作区/);
    assert.equal(button("删除会话").props.disabled, true);
    assert.equal(renderer!.root.findByProps({ type: "checkbox" }).props.checked, true);
  });

  it("shows a failed send once through the runtime Alert and keeps its draft", async () => {
    extraFetch = async (url) => url.endsWith("/commands") ? Response.json({ error: "send failed" }, { status: 409 }) : undefined;
    await open(); await publish();
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "keep this draft" } }));
    await act(async () => { await renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
    const errors = renderer!.root.findAllByProps({ "data-slot": "alert", "data-variant": "error" });
    assert.equal(errors.length, 1, "the composer must not duplicate the same runtime failure");
    assert.match(text(errors[0]), /运行时出现问题.*send failed/);
    assert.equal(renderer!.root.findByType("textarea").props.value, "keep this draft");
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

  it("sends with Enter, keeps Shift+Enter and IME input native, and ignores key repeats", async () => {
    await open(); await publish();
    const input = () => renderer!.root.findByType("textarea");
    assert.equal(input().props.rows, 1);
    const message = "First line\n第二行";
    await act(() => input().props.onChange({ target: { value: message } }));
    let submitted = Promise.resolve(); let submissions = 0;
    async function key(options: { shiftKey?: boolean; repeat?: boolean; isComposing?: boolean; keyCode?: number } = {}) {
      let prevented = false;
      const submitter = { disabled: renderer!.root.findByProps({ "aria-label": "发送消息" }).props.disabled };
      await act(async () => {
        input().props.onKeyDown({ key: "Enter", shiftKey: false, repeat: false, ...options, nativeEvent: { isComposing: options.isComposing ?? false, keyCode: options.keyCode ?? 13 }, preventDefault() { prevented = true; }, currentTarget: { form: { querySelector: () => submitter, requestSubmit(button: unknown) { assert.equal(button, submitter); submissions++; submitted = renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); } } } });
        await submitted; await pendingNavigation; await settle();
      });
      return prevented;
    }
    assert.equal(await key({ shiftKey: true }), false);
    await act(() => input().props.onCompositionStart());
    assert.equal(await key(), false, "composition state protects events with a missing native flag");
    await act(() => input().props.onCompositionEnd());
    assert.equal(await key({ isComposing: true }), false);
    assert.equal(await key({ keyCode: 229 }), false, "Safari's IME confirmation must not send");
    assert.equal(await key({ repeat: true }), true, "repeats neither send nor insert a newline");
    assert.equal(submissions, 0); assert.equal(input().props.value, message);
    assert.equal(await key(), true);
    assert.equal(submissions, 1);
    assert.equal(input().props.value, "");
    assert.deepEqual(commandRequests().map((entry) => [entry.url, entry.body?.type, entry.body?.message]), [["/api/projects/alpha/sessions/one/commands", "prompt", message]]);
    assert.equal(text(renderer!.root.findByProps({ className: "composer-keyboard-hint" })), "Enter 发送 · Shift+Enter 换行");

    await publish(snapshot("one", { status: "running" }));
    await act(() => input().props.onChange({ target: { value: "queued correction" } }));
    assert.equal(await key(), true);
    assert.equal(commandRequests().at(-1)?.body?.type, "steer", "Enter preserves the running-session queue behavior");
    assert.equal(commandRequests().at(-1)?.body?.message, "queued correction");
  });

  it("does not bypass the disabled send button with Enter", async () => {
    await open();
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "not connected" } }));
    let submissions = 0;
    async function enter() {
      let prevented = false;
      const submitter = { disabled: renderer!.root.findByProps({ "aria-label": "发送消息" }).props.disabled };
      assert.equal(submitter.disabled, true);
      await act(() => renderer!.root.findByType("textarea").props.onKeyDown({ key: "Enter", shiftKey: false, repeat: false, nativeEvent: { isComposing: false, keyCode: 13 }, preventDefault() { prevented = true; }, currentTarget: { form: { querySelector: () => submitter, requestSubmit() { submissions++; } } } }));
      assert.equal(prevented, true);
    }
    await enter();
    await publish();
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "" } }));
    await enter();
    assert.equal(submissions, 0); assert.equal(commandRequests().length, 0);
  });

  it("keeps the sidebar footer limited to settings with and without Pi version metadata", async () => {
    extraFetch = async (url) => url === "/api/projects/alpha" ? Response.json({ project: p, bootstrap: { ...bootstrap, runtime: { ...bootstrap.runtime, piVersion: "2.3.4" } } }) : undefined;
    await open();
    assert.equal(text(renderer!.root.findByProps({ className: "sidebar-footer" })), "设置");
    assert.equal(renderer!.root.findAllByProps({ className: "status-dot" }).length, 0);
    extraFetch = async (url) => url === "/api/projects/beta" ? Response.json({ project: { ...p, id: "beta" } }) : undefined;
    await open("/projects/beta/sessions");
    assert.equal(text(renderer!.root.findByProps({ className: "sidebar-footer" })), "设置");
  });

  it("opens installation settings from no-project and conversation routes without losing a draft or running commands", async () => {
    visibleProjects = [];
    await open("/projects");
    const settingsButton = () => renderer!.root.findByProps({ "aria-label": "设置" });
    await click(settingsButton());
    assert.equal(renderer!.root.findByProps({ role: "dialog" }).props["aria-modal"], "true");
    assert.equal(currentHref, "/projects"); assert.equal(FakeWebSocket.sockets.length, 0);
    await click(renderer!.root.findByProps({ "aria-label": "关闭设置" }));
    visibleProjects = [p]; await open(); await publish();
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "draft survives settings" } }));
    await click(settingsButton()); await click(renderer!.root.findByProps({ id: "settings-tab-conversation" }));
    await click(renderer!.root.findByProps({ "aria-label": "关闭设置" }));
    assert.equal(renderer!.root.findByType("textarea").props.value, "draft survives settings");
    assert.equal(currentHref, "/projects/alpha/sessions/one"); assert.equal(commandRequests().length, 0);
    assert.equal(requests.filter((entry) => entry.body).length, 0);
  });

  it("does not fabricate creation errors on the project root and retains real errors only in their project scope", async () => {
    visibleProjects = [];
    await open("/projects");
    assert.equal(renderer!.root.findAllByProps({ className: "workspace-feedback" }).length, 0);
    await act(() => renderer!.unmount()); renderer = undefined;
    visibleProjects = [p];
    await open("/projects");
    assert.equal(renderer!.root.findAllByProps({ className: "workspace-feedback" }).length, 0);
    extraFetch = async (url, init) => url === "/api/projects/alpha/sessions" && init?.method === "POST" ? Response.json({ error: "creation failed fixture" }, { status: 500 }) : undefined;
    await open("/projects/alpha/sessions");
    await click(renderer!.root.findByProps({ "aria-label": "在 Alpha 中新建会话" }));
    assert.match(text(renderer!.root.findByProps({ className: "workspace-feedback" })), /创建会话失败creation failed fixture/);
    await open("/projects"); assert.equal(renderer!.root.findAllByProps({ className: "workspace-feedback" }).length, 0);
    await open("/projects/beta/sessions"); assert.equal(renderer!.root.findAllByProps({ className: "workspace-feedback" }).length, 0);
    await open("/projects/alpha/sessions"); assert.match(text(renderer!.root.findByProps({ className: "workspace-feedback" })), /creation failed fixture/);
  });

  it("initializes and synchronizes theme on the no-project route without first opening a dialog or conversation", async () => {
    visibleProjects = [];
    webPreferences.destroy();
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const attributes = new Map<string, string>(); let writes = 0;
    const stored = JSON.stringify({ ...DEFAULT_WEB_PREFERENCES, appearance: { ...DEFAULT_WEB_PREFERENCES.appearance, theme: "dark" } });
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: () => stored, setItem() { writes++; } } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { setAttribute(name: string, value: string) { attributes.set(name, value); }, removeAttribute(name: string) { attributes.delete(name); } }, querySelector() { return null; } } });
    try {
      assert.equal(events.get("storage")?.size ?? 0, 0);
      await open("/projects");
      assert.equal(attributes.get("data-theme"), "dark"); assert.equal(events.get("storage")?.size, 1);
      assert.equal(renderer!.root.findAllByType("textarea").length, 0); assert.equal(renderer!.root.findAllByProps({ className: "settings-dialog" }).length, 0);
      const light = JSON.stringify({ ...DEFAULT_WEB_PREFERENCES, appearance: { ...DEFAULT_WEB_PREFERENCES.appearance, theme: "light" } });
      await act(() => { for (const listener of events.get("storage") ?? []) listener({ key: WEB_PREFERENCES_KEY, newValue: light }); });
      assert.equal(attributes.get("data-theme"), "light", "an already-open root page must follow another tab's saved choice");
      await act(() => { for (const listener of events.get("storage") ?? []) listener({ key: WEB_PREFERENCES_KEY, newValue: JSON.stringify(DEFAULT_WEB_PREFERENCES) }); });
      assert.equal(attributes.has("data-theme"), false); assert.equal(writes, 0, "cross-tab changes do not echo writes");
      assert.equal(requests.filter((entry) => entry.body).length, 0);
    } finally {
      webPreferences.destroy();
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
    }
  });

  it("uses saved Mod+Enter send mode, preserves native newlines and initializes queue mode only once", async () => {
    webPreferences.update("shortcuts", { sendMode: "mod-enter" });
    webPreferences.update("conversation", { queueMode: "follow_up" });
    await open(); await publish(snapshot("one", { status: "running" }));
    assert.equal(field("消息队列模式").props.value, "follow_up");
    await act(() => field("消息队列模式").props.onValueChange("steer"));
    await act(() => webPreferences.update("conversation", { queueMode: "follow_up" }));
    assert.equal(field("消息队列模式").props.value, "steer", "preference updates must not overwrite current composer selection");
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "mod-enter message" } }));
    async function key(mod = false, shiftKey = false, isComposing = false) {
      let prevented = false;
      const submitter = { disabled: renderer!.root.findByProps({ "aria-label": "发送消息" }).props.disabled };
      let submission = Promise.resolve();
      await act(async () => {
        renderer!.root.findByType("textarea").props.onKeyDown({ key: "Enter", metaKey: isMacPlatform() && mod, ctrlKey: !isMacPlatform() && mod, shiftKey, altKey: false, repeat: false, nativeEvent: { isComposing, keyCode: 13 }, preventDefault() { prevented = true; }, currentTarget: { form: { querySelector: () => submitter, requestSubmit() { submission = renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); } } } });
        await submission; await settle();
      }); return prevented;
    }
    assert.equal(await key(), false); assert.equal(await key(true, true), false); assert.equal(await key(true, false, true), false);
    assert.equal(commandRequests().length, 0); assert.equal(await key(true), true);
    assert.equal(commandRequests().at(-1)?.body?.type, "steer");
    assert.match(text(renderer!.root.findByProps({ className: "composer-keyboard-hint" })), /(Command|Ctrl)\+Enter 发送 · Enter 换行/);
  });

  it("initializes message disclosures from preferences and preserves manual state through streaming and later preference changes", async () => {
    webPreferences.update("conversation", { thinkingExpanded: true, toolsExpanded: true });
    await open();
    const message = { id: "with-details", role: "assistant" as const, text: "Response", thinking: "Reason", streaming: true, tools: [{ id: "tool", name: "read", status: "running" as const, args: { path: "a" } }] };
    await publish(snapshot("one", { messages: [message] }));
    const thinking = () => renderer!.root.findByProps({ className: "thinking-block" });
    const tool = () => renderer!.root.findByProps({ className: "tool-card tool-details" });
    assert.equal(thinking().props.open, true); assert.equal(tool().props.open, true);
    await act(() => { thinking().props.onToggle({ currentTarget: { open: false } }); tool().props.onToggle({ currentTarget: { open: false } }); });
    await publish(snapshot("one", { messages: [{ ...message, thinking: "Reason continues", text: "Response continues" }] }));
    assert.equal(thinking().props.open, false); assert.equal(tool().props.open, false);
    await act(() => webPreferences.update("conversation", { thinkingExpanded: true, toolsExpanded: true }));
    assert.equal(thinking().props.open, false); assert.equal(tool().props.open, false);
    assert.equal(commandRequests().length, 0);
  });

  it("keeps registry errors in the sidebar Alert without a misleading footer connection label", async () => {
    extraFetch = async (url) => url === "/api/projects" ? Response.json({ error: "registry unavailable" }, { status: 503 }) : undefined;
    await open(); await publish();
    const footer = renderer!.root.findByProps({ className: "sidebar-footer" });
    assert.equal(text(footer), "设置");
    assert.doesNotMatch(text(footer), /本地工作区|连接异常/);
    assert.equal(footer.findAll((node) => typeof node.props.className === "string" && node.props.className.split(/\s+/).includes("status-dot")).length, 0);
    assert.ok(renderer!.root.findAllByProps({ role: "alert" }).some((node) => text(node).includes("项目列表加载失败registry unavailable")));
    assert.equal(text(renderer!.root.findByProps({ "aria-label": "当前会话后端连接" })), "已连接");
  });

  it("retains standalone mobile navigation and the real directory picker without a session header or right panel", async () => {
    await open();
    assert.equal(renderer!.root.findAllByType("header").length, 0);
    assert.equal(renderer!.root.findAllByProps({ "aria-label": "切换右侧栏" }).length, 0);
    assert.equal(renderer!.root.findAllByProps({ id: "workspace-panel" }).length, 0);
    assert.doesNotMatch(renderer!.root.findByProps({ "aria-label": "打开导航" }).props.className, /focus-visible:ring/);
    await click(renderer!.root.findByProps({ "aria-label": "打开导航" })); assert.match(renderer!.root.findByType("main").props.className, /sidebar-mobile-open/);
    await click(renderer!.root.findByProps({ "aria-label": "关闭导航" })); assert.doesNotMatch(renderer!.root.findByType("main").props.className, /sidebar-mobile-open/);
    await click(renderer!.root.findByProps({ "aria-label": "打开导航" }));
    await act(() => { for (const listener of events.get("keydown") ?? []) listener({ key: "Escape" }); });
    assert.doesNotMatch(renderer!.root.findByType("main").props.className, /sidebar-mobile-open/);
    await click(renderer!.root.findByProps({ "aria-label": "打开导航" }));
    await click(renderer!.root.findByProps({ "aria-label": "关闭导航遮罩" }));
    assert.doesNotMatch(renderer!.root.findByType("main").props.className, /sidebar-mobile-open/);
    await click(renderer!.root.findByProps({ "aria-label": "添加项目" }));
    assert.ok(requests.some((entry) => entry.url.startsWith("/api/project/directories")));
    await click(button("other")); await click(button("使用此文件夹"));
    assert.ok(requests.some((entry) => entry.url === "/api/projects" && entry.body?.path === "/repo/other"));
    assert.equal(currentHref, "/projects/beta/sessions");
  });

  it("omits the header and right panel on every route while keeping standalone navigation reachable", async () => {
    for (const href of ["/projects/alpha/sessions/one", "/projects/alpha/sessions", "/projects/alpha/sessions/one/files", "/projects/alpha/sessions/one/changes", "/projects/alpha/files", "/projects/alpha/archive", "/projects/alpha/trash", "/projects"]) {
      await open(href);
      assert.equal(renderer!.root.findAllByType("header").length, 0, href);
      assert.equal(renderer!.root.findAllByProps({ "aria-label": "切换右侧栏" }).length, 0, href);
      assert.equal(renderer!.root.findAllByProps({ id: "workspace-panel" }).length, 0, href);
      assert.equal(renderer!.root.findAllByProps({ className: "inspector" }).length, 0, href);
      assert.doesNotMatch(renderer!.root.findByType("main").props.className, /inspector-closed/);
      assert.match(renderer!.root.findByProps({ "aria-label": "打开导航" }).props.className, /workspace-navigation-toggle/);
      await click(renderer!.root.findByProps({ "aria-label": "打开导航" }));
      assert.match(renderer!.root.findByType("main").props.className, /sidebar-mobile-open/, `${href} keeps navigation reachable`);
    }
    assert.equal(commandRequests().length, 0);
  });

  it("shows remaining context outside unchanged usage details and hides empty usage", async () => {
    await open(); await publish();
    const trigger = () => renderer!.root.findByProps({ "aria-label": "上下文剩余量" });
    assert.equal(text(trigger()), "75%");
    assert.equal(trigger().findByProps({ className: "context-ring-value" }).props.strokeDasharray, "75 100");
    await click(trigger());
    const details = renderer!.root.findByProps({ id: "composer-context-details" });
    assert.equal(text(details.findByProps({ className: "context-heading" })), "上下文使用量25%");
    assert.equal(details.findByProps({ "aria-label": "上下文使用百分比" }).props["aria-valuenow"], 25);
    assert.match(text(details), /2.5万 tokens.*10万 上限.*累计 3万.*\$0.1234/s);
    for (const percent of [0, null, -1]) {
      await publish(snapshot("one", { context: { ...snapshot().context!, percent } }));
      assert.equal(renderer!.root.findAllByProps({ "aria-label": "上下文剩余量" }).length, 0);
    }
    await publish(snapshot("one", { context: undefined }));
    assert.equal(renderer!.root.findAllByProps({ className: "composer-context" }).length, 0);
    await publish(snapshot("one", { context: { ...snapshot().context!, percent: 0.025 } }));
    assert.equal(text(trigger()), "100%");
    assert.equal(trigger().findByProps({ className: "context-ring-value" }).props.strokeDasharray, "99.975 100");
    await click(trigger());
    assert.equal(text(renderer!.root.findByProps({ className: "context-heading" })), "上下文使用量<1%");
    await publish(snapshot("one", { context: { ...snapshot().context!, percent: 0 } }));
    assert.equal(renderer!.root.findAllByProps({ id: "composer-context-details" }).length, 0);
    await publish(snapshot("one", { context: { ...snapshot().context!, percent: 99.5 } }));
    assert.equal(text(trigger()), "1%");
    await publish(snapshot("one", { context: { ...snapshot().context!, percent: 100 } }));
    assert.equal(text(trigger()), "0%");
    assert.equal(trigger().findByProps({ className: "context-ring-value" }).props.strokeDasharray, "0 100");
    await publish(snapshot("one", { context: { ...snapshot().context!, percent: 125 } }));
    assert.equal(text(trigger()), "0%", "over-capacity estimates must not show negative remaining capacity");
    await click(trigger());
    assert.equal(text(renderer!.root.findByProps({ className: "context-heading" })), "上下文使用量125%");
    assert.equal(renderer!.root.findByProps({ "aria-label": "上下文使用百分比" }).props["aria-valuenow"], 100);
    await click(trigger());
    await publish();
    assert.equal(trigger().props["aria-expanded"], false);
    assert.equal(commandRequests().length, 0);
  });

  it("uses the input for slash commands without a separate command button", async () => {
    await open(); await publish(snapshot("one", { commands: [{ name: "review", description: "Review code", source: "skill" }] }));
    const inputActions = renderer!.root.findByProps({ className: "composer-input-actions" });
    assert.deepEqual(inputActions.findAllByType("button").map((node) => node.props["aria-label"]), ["添加附件"]);
    assert.equal(renderer!.root.findAllByProps({ className: "composer-command" }).length, 0);
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "/rev" } }));
    const command = renderer!.root.findByProps({ className: "command-list" }).findByType("button");
    assert.match(text(command), /\/review.*Review code/);
    await click(command);
    assert.equal(renderer!.root.findByType("textarea").props.value, "/review ");
    assert.equal(renderer!.root.findAllByProps({ className: "command-palette" }).length, 0);
    assert.equal(commandRequests().length, 0, "selecting a command only edits the draft");
    await act(() => { for (const listener of events.get("keydown") ?? []) listener({ key: "k", metaKey: isMacPlatform(), ctrlKey: !isMacPlatform(), shiftKey: false, altKey: false, preventDefault() {} }); });
    assert.equal(renderer!.root.findAllByProps({ className: "command-palette" }).length, 1, "keyboard command access remains available");
  });

  it("preserves model/thinking/context controls and queue/abort in the composer", async () => {
    await open(); await publish();
    const form = renderer!.root.findByType("form");
    const settings = form.findByProps({ className: "composer-settings" });
    assert.equal(settings.findAllByProps({ className: "composer-context" }).length, 1);
    assert.equal(settings.findAllByProps({ className: "model-settings-control" }).length, 1);
    await click(renderer!.root.findByProps({ "aria-label": "模型与思考强度" }));
    await act(async () => field("思考强度").props.onValueChange("high"));
    await click(button("保存并应用"));
    await click(renderer!.root.findByProps({ "aria-label": "上下文剩余量" }));
    assert.match(text(renderer!.root.findByProps({ id: "composer-context-details" })), /25%|25,000/);
    await click(button("压缩上下文"));
    assert.ok(renderer!.root.findByProps({ role: "alertdialog" }));
    await click(button("取消"));
    assert.ok(!commandRequests().some((entry) => entry.body?.type === "compact"));
    await click(renderer!.root.findByProps({ "aria-label": "上下文剩余量" }));
    await click(button("压缩上下文"));
    await click(button("压缩上下文"));
    await publish(snapshot("one", { status: "running", queue: { steering: ["steer one"], followUp: ["follow one"] } }));
    assert.equal(renderer!.root.findByProps({ "aria-label": "模型与思考强度" }).props.disabled, true);
    await click(renderer!.root.findByProps({ "aria-label": "清空队列" })); await click(renderer!.root.findByProps({ "aria-label": "停止" }));
    assert.deepEqual(commandRequests().map((entry) => entry.body?.type), ["compact", "clear_queue", "abort"]);
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

  for (const mode of ["current-branch", "worktree"] as const) it(`passes ${mode} through sidebar, shortcut and first-send creation`, async () => {
    if (mode === "worktree") webPreferences.update("conversation", { workspaceMode: mode });
    await open("/projects/alpha/sessions");
    await click(trigger("在 Alpha 中新建会话"));
    assert.equal(currentHref, "/projects/alpha/sessions/created");
    await open("/projects/alpha/sessions");
    await act(async () => {
      for (const listener of events.get("keydown") ?? []) listener({ key: "n", metaKey: isMacPlatform(), ctrlKey: !isMacPlatform(), altKey: false, shiftKey: false, preventDefault() {} });
      await settle(); await pendingNavigation;
    });
    assert.equal(currentHref, "/projects/alpha/sessions/created");
    await open("/projects/alpha/sessions");
    await act(() => renderer!.root.findByType("textarea").props.onChange({ target: { value: "first message" } }));
    await act(async () => { await renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }); await pendingNavigation; });
    const creations = requests.filter((entry) => entry.url === "/api/projects/alpha/sessions" && entry.body);
    assert.equal(creations.length, 3);
    assert.ok(creations.every((entry) => entry.body?.workspaceMode === mode && typeof entry.body.operationId === "string"));
    assert.equal(new Set(creations.map((entry) => entry.body!.operationId)).size, 3);
    assert.ok(commandRequests().some((entry) => entry.body?.type === "prompt" && entry.body.message === "first message"));
  });

  it("retains the captured mode and operation across pending creation, failure and a changed default", async () => {
    const pending = deferred<Response>();
    let attempts = 0;
    extraFetch = async (url, init) => url === "/api/projects/alpha/sessions" && init?.method === "POST" && ++attempts === 1 ? pending.promise : undefined;
    await open("/projects/alpha/sessions");
    await act(async () => { trigger("在 Alpha 中新建会话").props.onClick(); await settle(); });
    await act(() => webPreferences.update("conversation", { workspaceMode: "worktree" }));
    await act(async () => { pending.resolve(Response.json({ error: "retry fixture" }, { status: 500 })); await settle(); });
    await click(trigger("在 Alpha 中新建会话"));
    const creations = requests.filter((entry) => entry.url === "/api/projects/alpha/sessions" && entry.body);
    assert.equal(creations.length, 2); assert.deepEqual(creations[1].body, creations[0].body);
    assert.equal(creations[1].body?.workspaceMode, "current-branch");
    await open("/projects/alpha/sessions"); await click(trigger("在 Alpha 中新建会话"));
    const next = requests.filter((entry) => entry.url === "/api/projects/alpha/sessions" && entry.body).at(-1)!;
    assert.equal(next.body?.workspaceMode, "worktree"); assert.notEqual(next.body?.operationId, creations[0].body?.operationId);
  });

  it("keeps legacy history read-only and explicitly continues to a confirmed new URL", async () => {
    webPreferences.update("conversation", { workspaceMode: "worktree" });
    sessions[0] = session("one", { legacy: true, executable: false, workspace: undefined });
    await open(); assert.equal(renderer!.root.findAllByType("textarea").length, 0); assert.match(text(renderer!.root), /不会还原历史代码/); assert.equal(commandRequests().length, 0);
    await click(button("在独立 worktree 继续")); assert.equal(currentHref, "/projects/alpha/sessions/continued");
    assert.equal(requests.find((entry) => entry.url.endsWith("/continue"))?.body?.workspaceMode, "worktree");
  });

  it("continues using current branch by default and retains its captured choice on retry", async () => {
    sessions[0] = session("one", { legacy: true, executable: false, workspace: undefined });
    sessions.push(currentBranchSession("continued", { sourceSessionId: "one" }));
    let attempts = 0;
    extraFetch = async (url) => url.endsWith("/continue") && ++attempts === 1 ? Response.json({ error: "continuation retry" }, { status: 500 }) : undefined;
    await open(); assert.match(text(renderer!.root), /项目当前文件，包含未提交改动/);
    await click(button("在当前分支继续"));
    await act(() => webPreferences.update("conversation", { workspaceMode: "worktree" }));
    assert.ok(button("在当前分支继续"), "failed operation continues advertising its captured mode");
    await click(button("在当前分支继续"));
    const continuations = requests.filter((entry) => entry.url.endsWith("/continue"));
    assert.equal(continuations.length, 2); assert.deepEqual(continuations[1].body, continuations[0].body);
    assert.equal(continuations[1].body?.workspaceMode, "current-branch");
    assert.equal(currentHref, "/projects/alpha/sessions/continued");
    const notice = renderer!.root.findByProps({ className: "session-workspace-notice" });
    assert.match(text(notice), /当前分支.*共享项目目录.*未提交改动/);
    assert.doesNotMatch(text(notice), /代码起点为创建时的已提交版本/);
  });

  it("keeps existing workspace modes, paths and captions independent of the new default", async () => {
    await open();
    const context = () => renderer!.root.findByProps({ className: "composer-project-context" });
    assert.equal(context().props.title, "/worktrees/one"); assert.match(text(context()), /kiva\/session\/one/);
    await act(() => webPreferences.update("conversation", { workspaceMode: "worktree" }));
    await act(() => webPreferences.update("conversation", { workspaceMode: "current-branch" }));
    assert.equal(context().props.title, "/worktrees/one");
    assert.match(text(renderer!.root.findByProps({ className: "session-workspace-notice" })), /独立 worktree/);
    sessions[0] = currentBranchSession("one", { sourceSessionId: "legacy" });
    await open("/projects/alpha/sessions/two"); await open();
    assert.equal(context().props.title, "/repo"); assert.match(text(context()), /main/);
    assert.match(text(renderer!.root.findByProps({ className: "session-workspace-notice" })), /继承自会话 legacy；文件使用项目当前内容/);
    for (const kind of ["files", "changes"] as const) {
      await open(`/projects/alpha/sessions/one/${kind}`);
      assert.equal(text(renderer!.root.findByProps({ className: "workspace-tree-scope" })), "当前分支 · 共享项目目录");
    }
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
    await open(); await click(trigger("会话操作 Session one")); await click(button("删除"));
    const checkbox = renderer!.root.findAll((node) => typeof node.props.onCheckedChange === "function")[0]; assert.equal(checkbox.props.checked, true); assert.equal(button("删除会话").props.disabled, true);
    await act(() => checkbox.props.onCheckedChange(false)); assert.equal(button("删除会话").props.disabled, false);
    await click(button("删除会话"));
    assert.ok(requests.some((entry) => entry.url.endsWith("/actions") && entry.body?.confirmation === "target-state-token" && entry.body.removeWorktree === false));
  });

  it("never offers current-branch cleanup during loading or errors and deletes history only", async () => {
    const current = currentBranchSession("one");
    sessions[0] = { ...current, workspace: { ...current.workspace!, executionRoot: "/repo/package", projectSubdirectory: "package" } };
    const pending = deferred<Response>();
    extraFetch = async (url) => url.endsWith("/deletion-preview") ? pending.promise : undefined;
    await open(); await click(trigger("会话操作 Session one")); await click(button("删除"));
    const checkboxes = () => renderer!.root.findAll((node) => typeof node.props.onCheckedChange === "function");
    assert.equal(checkboxes().length, 0); assert.equal(button("删除会话").props.disabled, true);
    assert.match(text(renderer!.root.findByProps({ role: "dialog" })), /当前分支的项目文件不会被删除/);
    assert.equal(renderer!.root.findByProps({ className: "deletion-details" }).findAllByType("dd")[1].children[0], "/repo/package");
    await act(async () => { pending.resolve(Response.json({ error: "preview retry" }, { status: 409 })); await settle(); });
    assert.equal(checkboxes().length, 0); assert.equal(button("删除会话").props.disabled, true);
    assert.equal(renderer!.root.findByProps({ className: "deletion-details" }).findAllByType("dd")[1].children[0], "/repo/package");
    extraFetch = undefined;
    preview = { ...preview, removeWorktree: false, workspace: { ...preview.workspace, state: "none", treeRoot: "/repo/package", branch: "main" } };
    await click(button("重新检查"));
    assert.equal(checkboxes().length, 0); assert.equal(button("删除会话").props.disabled, false);
    await click(button("删除会话"));
    const deletion = requests.find((entry) => entry.url.endsWith("/actions"));
    assert.equal(deletion?.body?.removeWorktree, false);
    assert.equal(deletion?.body?.confirmation, "target-state-token");
  });

  it("keeps exact target visible on busy preview and reports raw partial deletion truthfully", async () => {
    extraFetch = async (url) => url.endsWith("/deletion-preview") ? Response.json({ error: "Task is busy" }, { status: 409 }) : undefined;
    await open(); await click(trigger("会话操作 Session one")); await click(button("删除"));
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
