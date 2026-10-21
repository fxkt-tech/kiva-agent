import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { KivaWorkbench } from "../components/kiva-workbench";
import type { RuntimeSnapshot } from "../shared/runtime-types";
import type { BootstrapData, SessionSummary } from "../shared/types";
import { formatMessageTime } from "../shared/message-time";
import { normalizeMessages } from "./runtime-hub";

const data: BootstrapData = {
  renderedAt: "2026-10-20T16:00:30.000Z",
  project: { name: "kiva-agent", path: "/repo", branch: "main", dirtyFiles: 1, files: ["README.md"], changes: [{ status: "M", path: "README.md" }] },
  runtime: { piVersion: "1.3.0", modelConfigFound: true, status: "ready" },
  sessions: [],
  recentProjects: ["/repo"],
};

class FakeWebSocket {
  static latest: FakeWebSocket;
  onopen?: () => void;
  onmessage?: (message: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;
  constructor() { FakeWebSocket.latest = this; }
  close() {}
}

function runtimeSnapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
    status: "idle", session: { id: "runtime-session", messageCount: 0 }, messages: [],
    model: { provider: "test", id: "test-model" },
    models: [{ provider: "test", id: "test-model", contextWindow: 100_000, reasoning: true }],
    thinkingLevel: "medium", thinkingLevels: ["off", "medium", "high"],
    context: { tokens: 25_000, contextWindow: 100_000, percent: 25, input: 20_000, output: 5_000, cacheRead: 0, cacheWrite: 0, total: 30_000, cost: 0.1234 },
    queue: { steering: [], followUp: [] }, commands: [], ...overrides,
  };
}

async function publishSnapshot(snapshot: RuntimeSnapshot, seq = 1) {
  await act(() => {
    FakeWebSocket.latest.onopen?.();
    FakeWebSocket.latest.onmessage?.({ data: JSON.stringify({ streamId: "test-stream", seq, event: { type: "snapshot", snapshot } }) });
  });
}

async function publishPiEvent(event: unknown, seq: number) {
  await act(() => FakeWebSocket.latest.onmessage?.({ data: JSON.stringify({ streamId: "test-stream", seq, event: { type: "pi_event", event } }) }));
}

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : textContent(child)).join("");
}

describe("KivaWorkbench sidebar", () => {
  let renderer: ReactTestRenderer;
  let reloads = 0;
  let requests: Array<{ url: string; init?: RequestInit }> = [];
  let activeSessions: SessionSummary[] = [];
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    reloads = 0;
    requests = [];
    activeSessions = [];
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol: "http:", host: "localhost:30141", reload: () => { reloads += 1; } } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: globalThis.location, addEventListener() {}, removeEventListener() {} } });
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeWebSocket });
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.startsWith("/api/project/directories")) {
        const path = new URL(url, "http://localhost").searchParams.get("path") ?? "/repo";
        return Response.json({ path, parent: path === "/repo" ? "/" : "/repo", directories: path === "/repo" ? [{ name: "other-project", path: "/repo/other-project" }] : [] });
      }
      if (url.startsWith("/api/project/file")) return Response.json({ path: "README.md", content: "# Real project" });
      if (url === "/api/project/open") return Response.json(data);
      if (url === "/api/runtime/command") return Response.json({ accepted: true });
      return Response.json({ active: activeSessions, archived: [], trash: [] });
    };
  });

  afterEach(async () => {
    if (renderer) await act(() => renderer.unmount());
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: originalWebSocket });
    if (originalWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    else Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "location");
  });

  it("opens a real file workspace from the File navigation item", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    const fileButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "文件");

    assert.ok(fileButton, "File navigation item should exist");
    assert.equal(typeof fileButton.props.onClick, "function", "File navigation item should be interactive");
    await act(() => fileButton.props.onClick());
    assert.ok(renderer.root.findAll((node) => textContent(node) === "文件浏览").length > 0);
    const readmeButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "README.md");
    await act(async () => { readmeButton?.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); });
    assert.ok(renderer.root.findAllByType("pre").some((node) => textContent(node) === "# Real project"));
  });

  it("wires the remaining sidebar controls to visible state changes", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });

    const changeButton = renderer.root.findAllByType("button").find((button) => textContent(button).startsWith("代码变更"));
    assert.equal(typeof changeButton?.props.onClick, "function");
    await act(() => changeButton?.props.onClick());
    assert.equal(textContent(renderer.root.findByProps({ className: "workspace-browser-heading" }).findByType("p")), "代码变更");

    const settingsButton = renderer.root.findByProps({ "aria-label": "切换右侧栏" });
    assert.equal(renderer.root.findAll((node) => node.props.className === "inspector").length, 0, "Context starts collapsed to keep the conversation focused");
    await act(() => settingsButton?.props.onClick());
    assert.equal(renderer.root.findAll((node) => node.props.className === "inspector").length, 1);
    assert.equal(renderer.root.findByProps({ className: "inspector" }).children.length, 0, "The right panel is reserved and contains no old runtime controls");
    await act(() => settingsButton.props.onClick());
    assert.equal(renderer.root.findAll((node) => node.props.className === "inspector").length, 0);

    const projectButton = renderer.root.findByProps({ "aria-label": "添加项目" });
    await act(async () => { projectButton.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); });
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 1);
    assert.ok(requests.some((request) => request.url.startsWith("/api/project/directories")), "Opening the picker should browse real local directories");
    const directoryButton = renderer.root.findAllByType("button").find((button) => textContent(button).includes("other-project"));
    assert.ok(directoryButton, "Directory entries should be navigable");
    await act(async () => { directoryButton.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); });
    const useFolderButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "使用此文件夹");
    assert.ok(useFolderButton);
    await act(async () => { useFolderButton.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); });
    assert.ok(requests.some((request) => request.url === "/api/project/open" && request.init?.body === JSON.stringify({ path: "/repo/other-project" })));
    assert.equal(reloads, 1);

    const sessionsButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "会话");
    await act(() => sessionsButton?.props.onClick());
    const commandButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "命令");
    assert.ok(commandButton, "Commands should remain accessible from the composer");
    await act(() => commandButton.props.onClick());
    assert.equal(renderer.root.findAll((node) => node.props.className === "command-palette").length, 1);

    const searchButton = renderer.root.findByProps({ "aria-label": "搜索会话" });
    await act(() => searchButton.props.onClick());
    assert.equal(renderer.root.findAllByProps({ placeholder: "搜索会话" }).length, 1);
  });

  it("keeps the conversation header title-free while retaining panel and mobile navigation controls", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    await publishSnapshot(runtimeSnapshot({
      session: { id: "header-session", name: "当前会话", messageCount: 1 },
      messages: [{ id: "header-message", role: "user", text: "检查顶部栏", thinking: "", tools: [] }],
    }));
    const header = renderer.root.findByProps({ className: "conversation-header" });
    assert.equal(textContent(header), "", "No title, subtitle, runtime text or menu labels remain in the header");
    assert.equal(header.findAllByType("h1").length, 0);
    assert.equal(header.findAllByType("p").length, 0);
    assert.equal(header.findAllByProps({ className: "runtime-badge" }).length, 0);
    assert.equal(header.findAllByProps({ "aria-label": "会话菜单" }).length, 0);
    const mobileNavigation = header.findByProps({ "aria-label": "打开导航" });
    assert.equal(mobileNavigation.findAllByType("svg").length, 1, "A visible mobile navigation icon replaces the removed title hit target");
    await act(() => mobileNavigation.props.onClick());
    assert.ok(renderer.root.findAllByType("main")[0].props.className.includes("sidebar-mobile-open"));
    const panelToggle = header.findByProps({ "aria-label": "切换右侧栏" });
    await act(() => panelToggle.props.onClick());
    assert.equal(renderer.root.findAllByProps({ className: "inspector" }).length, 1);
    await act(() => panelToggle.props.onClick());
    assert.equal(renderer.root.findAllByProps({ className: "inspector" }).length, 0);
    const files = renderer.root.findAllByType("button").find((button) => textContent(button) === "文件");
    await act(() => files?.props.onClick());
    assert.equal(textContent(header), "", "File navigation must not restore the header title");
    assert.equal(renderer.root.findByProps({ className: "workspace-browser-heading" }).findByType("p").children[0], "文件浏览");
    const changes = renderer.root.findAllByType("button").find((button) => textContent(button).startsWith("代码变更"));
    assert.ok(changes);
    await act(() => changes.props.onClick());
    assert.equal(textContent(header), "", "Changes navigation must not restore the header title");
  });

  it("renders KivA with full local timestamps from normalized history and leaves unknown times explicit", async () => {
    const timestamp = Date.parse("2006-01-02T15:04:05Z");
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    await publishSnapshot(runtimeSnapshot({ messages: normalizeMessages([
      { role: "assistant", timestamp, content: [{ type: "text", text: "已读取项目" }] },
      { role: "assistant", content: [{ type: "text", text: "旧消息缺少时间" }] },
    ]) }));
    const metadata = renderer.root.findAllByProps({ className: "message-meta" });
    assert.equal(textContent(metadata[0].findByType("strong")), "KivA");
    assert.equal(textContent(metadata[0].findByType("time")), formatMessageTime(timestamp));
    assert.equal(metadata[0].findByType("time").props.dateTime, "2006-01-02T15:04:05.000Z");
    assert.equal(textContent(metadata[1].findByType("time")), "时间未知");
    assert.equal(metadata[1].findByType("time").props.dateTime, undefined);
    assert.equal(renderer.root.findAllByType("textarea")[0].props.placeholder, "告诉 KivA 你想完成什么…");
  });

  it("preserves live timestamps through streaming and tool execution without duplicating the assistant row", async () => {
    const timestamp = Date.parse("2006-01-02T15:04:05Z");
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    await publishSnapshot(runtimeSnapshot());
    await publishPiEvent({ type: "message_start", message: { role: "assistant", timestamp, content: [] } }, 2);
    await publishPiEvent({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "检查文件" } }, 3);
    await publishPiEvent({ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "live-read", name: "read", arguments: { path: "README.md" } }] } }, 4);
    await publishPiEvent({ type: "tool_execution_start", toolCallId: "live-read", toolName: "read", args: { path: "README.md" } }, 5);
    assert.equal(renderer.root.findAllByProps({ className: "assistant-message" }).length, 1, "The tool belongs to the completed assistant message, not a new timeless placeholder");
    await publishPiEvent({ type: "tool_execution_end", toolCallId: "live-read", result: { content: [{ type: "text", text: "# README" }] }, isError: false }, 6);
    const firstTime = renderer.root.findAllByType("time")[0];
    assert.equal(firstTime.props.dateTime, "2006-01-02T15:04:05.000Z");
    assert.equal(textContent(firstTime), formatMessageTime(timestamp));
    assert.equal(renderer.root.findByProps({ "data-status": "done" }).props.className, "tool-status");
    assert.doesNotMatch(textContent(renderer.root.findByProps({ className: "assistant-body" })), /正在使用工具/);

    await publishPiEvent({ type: "message_start", message: { role: "assistant", timestamp: timestamp + 5_000, content: [] } }, 7);
    await publishPiEvent({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "已完成" } }, 8);
    await publishPiEvent({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "已完成" }] } }, 9);
    assert.deepEqual(renderer.root.findAllByType("time").map((time) => time.props.dateTime), ["2006-01-02T15:04:05.000Z", "2006-01-02T15:04:10.000Z"]);
  });

  it("shows KivA Agent branding without a header command button and retains mobile close", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    const header = renderer.root.findByProps({ className: "brand-row" });
    assert.equal(textContent(header.findByProps({ className: "brand-name" })), "KivA Agent");
    assert.equal(header.findAllByProps({ "aria-label": "打开命令面板" }).length, 0);
    assert.deepEqual(header.findAllByType("button").map((button) => button.props["aria-label"]), ["关闭导航"]);
  });

  it("collapses project sessions without opening the project picker and removes the sidebar context entry", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    const sidebar = renderer.root.findByProps({ className: "sidebar" });
    assert.ok(sidebar.findAllByType("button").every((button) => textContent(button) !== "运行上下文"));
    assert.equal(sidebar.findAllByProps({ className: "section-label" }).length, 0, "Active sessions sit directly beneath the project without a redundant heading");
    assert.equal(sidebar.findAll((node) => textContent(node) === "最近会话").length, 0);

    const projectButton = renderer.root.findByProps({ className: "project-toggle" });
    assert.equal(projectButton.props["aria-expanded"], true);
    await act(() => projectButton.props.onClick());
    assert.equal(renderer.root.findByProps({ id: "project-sessions" }).props.hidden, true);
    assert.equal(projectButton.props["aria-expanded"], false);
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 0);
    assert.ok(requests.every((request) => !request.url.startsWith("/api/project/directories")));

    const projectRow = renderer.root.findByProps({ className: "project-card" });
    const controls = projectRow.findAllByType("button");
    assert.equal(controls.at(-2)?.props["aria-label"], "搜索会话", "Search belongs immediately before the collapse control");
    const collapseButton = renderer.root.findByProps({ className: "project-collapse" });
    assert.equal(controls.at(-1), collapseButton);
    await act(() => collapseButton.props.onClick());
    assert.equal(renderer.root.findByProps({ id: "project-sessions" }).props.hidden, false);
  });

  it("expands a collapsed project for search and filters actual session rows", async () => {
    activeSessions = [
      { id: "session-code", path: "code.jsonl", name: "修复代码", preview: "检查项目", updatedAt: data.renderedAt },
      { id: "session-ui", path: "ui.jsonl", name: "UI 设计", preview: "调整侧栏", updatedAt: data.renderedAt },
    ];
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    await act(() => renderer.root.findByProps({ className: "project-toggle" }).props.onClick());
    await act(() => renderer.root.findByProps({ "aria-label": "搜索会话" }).props.onClick());
    assert.equal(renderer.root.findByProps({ id: "project-sessions" }).props.hidden, false);

    const input = renderer.root.findByProps({ placeholder: "搜索会话" });
    await act(() => input.props.onChange({ target: { value: "UI" } }));
    assert.deepEqual(renderer.root.findAllByProps({ className: "session-item-title" }).map(textContent), ["UI 设计"]);

    await act(() => renderer.root.findByProps({ "aria-label": "搜索会话" }).props.onClick());
    assert.equal(renderer.root.findAllByProps({ placeholder: "搜索会话" }).length, 0);
    assert.equal(renderer.root.findAllByProps({ className: "session-item-title" }).length, 2, "Closing search clears the hidden filter");
  });

  it("creates sessions from the project's plus before search and clears collapsed search filters", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    await publishSnapshot(runtimeSnapshot({ messages: [{ id: "previous-message", role: "user", text: "原来的会话", thinking: "", tools: [] }] }));
    const sidebar = renderer.root.findByProps({ className: "sidebar" });
    assert.equal(sidebar.findAllByProps({ className: "sidebar-new-session" }).length, 0);
    assert.equal(sidebar.findAllByType("button").filter((button) => textContent(button).includes("新建会话")).length, 0, "There is no global new-session row");
    const project = sidebar.findByProps({ className: "project-card" });
    const createButton = project.findByProps({ className: "project-new-session" });
    assert.deepEqual(project.findAllByType("button").map((button) => button.props.className), ["project-toggle", "project-new-session", "project-search", "project-collapse"]);
    assert.equal(createButton.props["aria-label"], "在 kiva-agent 中新建会话");
    assert.equal(textContent(createButton), "", "The project action is icon-only");
    assert.equal(createButton.findAllByType("svg").length, 1);
    assert.equal(createButton.props.disabled, false);

    await act(() => project.findByProps({ className: "project-search" }).props.onClick());
    await act(() => sidebar.findByProps({ placeholder: "搜索会话" }).props.onChange({ target: { value: "不匹配新会话的过滤词" } }));
    await act(() => project.findByProps({ className: "project-collapse" }).props.onClick());
    await act(() => renderer.root.findByProps({ "aria-label": "打开导航" }).props.onClick());
    activeSessions = [{ id: "new-project-session", path: "new-project-session.jsonl", name: "新会话", preview: "尚未发送消息", updatedAt: data.renderedAt }];
    await act(() => createButton.props.onClick());
    assert.equal(requests.filter((request) => request.url === "/api/runtime/command" && request.init?.body === JSON.stringify({ type: "new_session" })).length, 1);
    assert.equal(sidebar.findByProps({ id: "project-sessions" }).props.hidden, false);
    assert.equal(sidebar.findAllByProps({ placeholder: "搜索会话" }).length, 0);
    assert.deepEqual(sidebar.findAllByProps({ className: "session-item-title" }).map(textContent), ["新会话"]);
    assert.ok(!renderer.root.findAllByType("main")[0].props.className.includes("sidebar-mobile-open"));
    assert.ok(requests.every((request) => !request.url.startsWith("/api/project/")), "Creation uses the current project's runtime without opening or switching projects");
    await publishSnapshot(runtimeSnapshot({ session: { id: "new-project-session", name: "新会话", messageCount: 0 } }), 2);
    assert.equal(renderer.root.findAllByProps({ className: "user-message" }).length, 0);
    assert.equal(sidebar.findByProps({ className: "session-item selected" }).findByProps({ className: "session-item-title" }).children[0], "新会话");
  });

  it("opens the project's active sessions from file and archived views and disables creation while busy or disconnected", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    const createButton = renderer.root.findByProps({ className: "project-new-session" });
    assert.equal(createButton.props.disabled, true);
    await publishSnapshot(runtimeSnapshot({ status: "running" }));
    assert.equal(createButton.props.disabled, true);
    await publishSnapshot(runtimeSnapshot(), 2);
    assert.equal(createButton.props.disabled, false);

    const files = renderer.root.findAllByType("button").find((button) => textContent(button) === "文件");
    assert.ok(files);
    await act(() => files.props.onClick());
    assert.equal(renderer.root.findAllByProps({ className: "workspace-browser" }).length, 1);
    await act(() => createButton.props.onClick());
    assert.equal(renderer.root.findAllByProps({ className: "workspace-browser" }).length, 0);
    const archived = renderer.root.findAllByType("button").find((button) => textContent(button).startsWith("归档"));
    assert.ok(archived);
    await act(() => archived.props.onClick());
    await act(() => createButton.props.onClick());
    assert.equal(renderer.root.findAllByProps({ className: "section-label" }).length, 0, "Creation returns from archive to the active project sessions");
    assert.equal(requests.filter((request) => request.init?.body === JSON.stringify({ type: "new_session" })).length, 2);
    await act(() => FakeWebSocket.latest.onclose?.());
    assert.equal(createButton.props.disabled, true);
  });

  it("keeps model, thinking and live context controls inside the composer without opening the right panel", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    await publishSnapshot(runtimeSnapshot());
    const composer = renderer.root.findByProps({ className: "composer" });
    const settings = composer.findByProps({ className: "composer-settings" });
    assert.deepEqual(settings.children.map((child) => typeof child === "string" ? child : child.props.className), ["composer-context", "composer-select composer-model", "composer-select composer-thinking"], "Runtime controls are ordered context, model, then thinking");
    const model = composer.findByProps({ "aria-label": "选择模型" });
    const thinking = composer.findByProps({ "aria-label": "思考强度" });
    const thinkingControl = composer.findByProps({ className: "composer-select composer-thinking" });
    assert.equal(textContent(thinkingControl.findByType("span")), "medium", "Thinking displays only the current level, without a text prefix");
    assert.deepEqual(thinkingControl.findAllByType("svg").map((icon) => icon.props.className), ["lucide lucide-chevron-down"], "Thinking retains only the dropdown chevron");
    assert.equal(model.props.disabled, false);
    assert.equal(thinking.props.value, "medium");
    await act(() => model.props.onChange({ target: { value: JSON.stringify({ provider: "test", id: "test-model" }) } }));
    await act(() => thinking.props.onChange({ target: { value: "high" } }));
    assert.ok(requests.some((request) => request.init?.body === JSON.stringify({ type: "set_model", provider: "test", modelId: "test-model" })));
    assert.ok(requests.some((request) => request.init?.body === JSON.stringify({ type: "set_thinking", level: "high" })));

    const usage = composer.findByProps({ "aria-label": "上下文使用量" });
    assert.equal(textContent(usage), "25%");
    await act(() => usage.props.onClick());
    const details = composer.findByProps({ id: "composer-context-details" });
    assert.match(textContent(details), /0\.1234/);
    assert.equal(composer.findByProps({ role: "progressbar" }).props["aria-valuenow"], 25);
    const confirmations: string[] = [];
    Object.assign(window, { confirm: (message: string) => { confirmations.push(message); return false; } });
    const compact = composer.findAllByType("button").find((button) => textContent(button) === "压缩上下文");
    assert.ok(compact);
    await act(() => compact.props.onClick());
    assert.equal(requests.filter((request) => request.init?.body === JSON.stringify({ type: "compact" })).length, 0);
    Object.assign(window, { confirm: () => true });
    await act(() => compact.props.onClick());
    assert.equal(confirmations.length, 1);
    assert.ok(requests.some((request) => request.init?.body === JSON.stringify({ type: "compact" })));
    const context = runtimeSnapshot().context;
    assert.ok(context);
    await publishSnapshot(runtimeSnapshot({ thinkingLevel: "high", context: { ...context, tokens: 50_000, percent: 50 } }), 2);
    assert.equal(thinking.props.value, "high");
    assert.equal(textContent(usage), "50%");
    assert.equal(renderer.root.findAllByProps({ className: "inspector" }).length, 0);
  });

  it("shows unknown context before a snapshot and disables model and thinking during a run or disconnect", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    const composer = renderer.root.findByProps({ className: "composer" });
    const model = composer.findByProps({ "aria-label": "选择模型" });
    const thinking = composer.findByProps({ "aria-label": "思考强度" });
    assert.equal(model.props.disabled, true);
    assert.equal(thinking.props.disabled, true);
    const usage = composer.findByProps({ "aria-label": "上下文使用量" });
    assert.equal(textContent(usage), "—");
    await act(() => usage.props.onClick());
    assert.match(textContent(composer.findByProps({ id: "composer-context-details" })), /等待首次请求/);
    assert.equal(composer.findAllByType("button").find((button) => textContent(button) === "压缩上下文")?.props.disabled, true);

    await publishSnapshot(runtimeSnapshot({ status: "running" }));
    assert.equal(model.props.disabled, true);
    assert.equal(thinking.props.disabled, true);
    await publishSnapshot(runtimeSnapshot(), 2);
    assert.equal(model.props.disabled, false);
    await act(() => FakeWebSocket.latest.onclose?.());
    assert.equal(model.props.disabled, true);
    assert.equal(thinking.props.disabled, true);
  });
});
