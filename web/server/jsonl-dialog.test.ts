import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer, type TestRendererOptions } from "react-test-renderer";
import { installUiMocks } from "./helpers/mock-ui";
import type { SessionJsonlDocument } from "../shared/session-jsonl";
import type { SessionResource } from "../shared/workspace-contract";
import { JSONL_PAGE_TEXT_LIMIT, JSONL_TEXT_LIMIT } from "../features/sessions/jsonl-presentation";

installUiMocks();
const { SessionJsonlDialog } = await import("../features/sessions/session-jsonl-dialog");
const { Dialog, DialogContent } = await import("../components/ui/dialog");

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
function session(id = "one"): SessionResource { return { id, projectId: "alpha", name: `Session ${id}`, path: `/sessions/${id}.jsonl`, collection: "active", preview: "", updatedAt: "2026-10-21T00:00:00Z", createdAt: "2026-10-21T00:00:00Z", legacy: false, executable: true }; }
function document(content: string, overrides: Partial<SessionJsonlDocument> = {}): SessionJsonlDocument { return { projectId: "alpha", sessionId: "one", fileName: "one.jsonl", content, bytes: Buffer.byteLength(content), totalBytes: Buffer.byteLength(content), truncated: false, ...overrides }; }
const clickEvent = () => ({ stopPropagation() {} });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("session JSONL dialog", () => {
  let renderer: ReactTestRenderer | undefined;
  let closed: number;
  let requests: Array<{ url: string; init?: RequestInit }>;
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const onClose = () => { closed += 1; };
  const tab = (label: string) => renderer!.root.findAllByProps({ role: "tab" }).find((node) => text(node) === label)!;
  const record = (line: number) => renderer!.root.findAllByProps({ className: "jsonl-record" }).find((node) => node.props["data-jsonl-line"] === line)!;
  async function open(source = document('{"type":"session","id":"root"}'), options?: TestRendererOptions) {
    globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); return Response.json(source); };
    await act(async () => { renderer = create(createElement(SessionJsonlDialog, { session: session(), onClose }), options); await settle(); });
  }
  beforeEach(() => { closed = 0; requests = []; });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount()); renderer = undefined;
    globalThis.fetch = originalFetch;
    if (originalDocument !== undefined) Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument }); else Reflect.deleteProperty(globalThis, "document");
  });

  it("reads only the scoped endpoint, defaults to linked rendered records and retains exact raw text", async () => {
    const source = '\r\n{"type":"session","id":"root"}\r\n{"type":"message","id":"child","parentId":"root","message":{"role":"user","content":"<script>你好</script>"},"unknown":{"__proto__":3}}\ninvalid json\n42\n';
    await open(document(source));
    assert.deepEqual(requests.map(({ url, init }) => [url, init?.method ?? "GET"]), [["/api/projects/alpha/sessions/one/jsonl", "GET"]]);
    const dialog = renderer!.root.findByProps({ role: "dialog" }); assert.equal(dialog.props["aria-modal"], "true");
    assert.equal(tab("渲染视图").props["aria-selected"], true);
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-record" }).length, 4);
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-field-tree" }).length, 1, "one shared inspector displays the first loaded record");
    assert.equal(record(2).props["data-selected"], true);
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-record-details" }).length, 0, "cards do not contain inline record details");
    await act(() => renderer!.root.findByProps({ "aria-label": "查看第 3 行详情" }).props.onClick(clickEvent()));
    assert.match(text(renderer!.root.findByProps({ className: "jsonl-parent" })), /L2root/);
    await act(() => renderer!.root.findByProps({ "aria-label": "展开字段 message" }).props.onClick());
    assert.match(text(renderer!.root.findByProps({ className: "jsonl-field-tree", "aria-label": "第 3 行的 JSON 字段" })), /<script>你好<\/script>/);
    await act(() => renderer!.root.findByProps({ "aria-label": "展开字段 unknown" }).props.onClick());
    assert.match(text(renderer!.root.findByProps({ className: "jsonl-field-tree", "aria-label": "第 3 行的 JSON 字段" })), /__proto__/);
    await act(() => tab("原始文本").props.onClick());
    assert.equal(tab("原始文本").props["aria-selected"], true);
    assert.equal(text(renderer!.root.findByProps({ className: "jsonl-raw" })), source);
    assert.equal(requests.length, 1, "view switches are local and never initialize a runtime");
    assert.equal(renderer!.root.findAll((node) => Boolean(node.props.dangerouslySetInnerHTML)).length, 0);
  });

  it("reads messages immediately and connects tool input/output while retaining each source record", async () => {
    const source = [
      { type: "message", id: "user", parentId: null, message: { role: "user", content: "请检查 **工作区**" } },
      { type: "message", id: "assistant", parentId: "user", message: { role: "assistant", content: [{ type: "thinking", thinking: "先确认状态" }, { type: "text", text: "我会运行 `git status`。" }, { type: "toolCall", id: "call-one", name: "bash", arguments: { command: "git status --short" } }] } },
      { type: "message", id: "output", parentId: "assistant", message: { role: "toolResult", toolCallId: "call-one", toolName: "bash", isError: false, content: [{ type: "text", text: " M README.md" }] } },
      { type: "model_change", id: "model", parentId: "output", provider: "local", modelId: "fixture" },
      { type: "message", id: "done", parentId: "model", message: { role: "assistant", content: [{ type: "text", text: "检查完成。![附件](https://example.invalid/image.png)" }] } },
    ].map((value) => JSON.stringify(value)).join("\n");
    await open(document(source));
    assert.equal(text(record(1).findByProps({ className: "jsonl-record-title" })), "你");
    assert.equal(text(record(1).findByProps({ className: "markdown-body" })), "请检查 工作区");
    assert.ok(record(1).findAllByType("strong").some((node) => text(node) === "工作区"));
    assert.match(record(2).findAllByProps({ className: "markdown-body" }).map(text).join(" "), /git status/);
    assert.equal(record(2).findByProps({ className: "jsonl-thinking" }).props.open, undefined);
    assert.match(text(record(2).findByProps({ className: "jsonl-tool-input" })), /bashgit status --short/);
    assert.match(text(record(3)), /工具输出bash成功/);
    assert.equal(text(record(3).findByProps({ className: "jsonl-tool-output" })), " M README.md");
    assert.match(text(record(4)), /切换模型local \/ fixture/);
    const outputLink = record(2).findByProps({ className: "jsonl-source-link" });
    assert.match(text(outputLink), /查看输出L3/);
    let stopped = 0;
    await act(() => outputLink.props.onClick({ stopPropagation() { stopped += 1; } }));
    assert.equal(stopped, 1, "source navigation cannot bubble into selecting its containing card");
    assert.equal(renderer!.root.findByProps({ className: "jsonl-inspector" }).props["data-jsonl-inspector-line"], 3);
    assert.equal(record(3).props["data-selected"], true);
    await act(() => record(3).findByProps({ className: "jsonl-source-link" }).props.onClick(clickEvent()));
    assert.equal(record(2).props["data-selected"], true);
    assert.equal(renderer!.root.findAllByType("img").length, 0, "viewing a transcript does not fetch embedded images");
    assert.equal(requests.length, 1);
  });

  it("selects a single inspector, resets its fields and scroll, and preserves the conversation viewport", async () => {
    const source = [
      { type: "message", id: "one", parentId: null, message: { role: "user", content: "first" } },
      { type: "message", id: "two", parentId: "one", message: { role: "assistant", content: [{ type: "text", text: "second" }] } },
    ].map((value) => JSON.stringify(value)).join("\n");
    let navigations = 0;
    const left = { scrollTop: 0, querySelector: () => ({ scrollIntoView() { navigations += 1; }, focus() {} }) };
    const right = { scrollTop: 0 };
    await open(document(source), { createNodeMock: (element) => {
      const props = element.props as Record<string, unknown>;
      if (props.className === "jsonl-record-list") return left;
      if (props.className === "jsonl-inspector-scroll") return right;
      return null;
    } });
    const lineButton = (line: number) => renderer!.root.findByProps({ "aria-label": `查看第 ${line} 行详情` });
    const inspector = () => renderer!.root.findByProps({ className: "jsonl-inspector" });
    assert.equal(inspector().props["data-jsonl-inspector-line"], 1);
    assert.equal(lineButton(1).props["aria-pressed"], true);
    await act(() => renderer!.root.findByProps({ "aria-label": "展开字段 message" }).props.onClick());
    assert.ok(renderer!.root.findByProps({ "aria-label": "收起字段 message" }));
    left.scrollTop = 240; right.scrollTop = 180;
    await act(() => lineButton(2).props.onClick(clickEvent()));
    assert.equal(inspector().props["data-jsonl-inspector-line"], 2);
    assert.equal(lineButton(1).props["aria-pressed"], false);
    assert.equal(lineButton(2).props["aria-pressed"], true);
    assert.equal(left.scrollTop, 240); assert.equal(right.scrollTop, 0); assert.equal(navigations, 0);
    const cardEvent = (interactive = false, selectingText = false) => ({ target: { closest: () => interactive ? {} : null }, currentTarget: { ownerDocument: { getSelection: () => ({ isCollapsed: !selectingText }) } } });
    await act(() => record(1).props.onClick(cardEvent(true)));
    assert.equal(inspector().props["data-jsonl-inspector-line"], 2, "native controls do not select another record");
    await act(() => record(1).props.onClick(cardEvent(false, true)));
    assert.equal(inspector().props["data-jsonl-inspector-line"], 2, "dragging text keeps the current selection");
    await act(() => record(1).props.onClick(cardEvent()));
    assert.equal(inspector().props["data-jsonl-inspector-line"], 1);
    assert.ok(renderer!.root.findByProps({ "aria-label": "展开字段 message" }), "field expansion resets after switching records");
    assert.equal(left.scrollTop, 240);
    await act(() => lineButton(2).props.onClick(clickEvent()));
    await act(() => renderer!.root.findByProps({ className: "jsonl-parent" }).findByType("button").props.onClick());
    assert.equal(inspector().props["data-jsonl-inspector-line"], 1); assert.equal(navigations, 1);
    assert.equal(requests.length, 1);
  });

  it("distinguishes a clipped nonempty output from a genuinely empty output", async () => {
    const output = (content: string) => ({ type: "message", message: { role: "toolResult", content } });
    const source = [
      output(""),
      ...Array.from({ length: JSONL_PAGE_TEXT_LIMIT / JSONL_TEXT_LIMIT }, () => ({ type: "message", message: { role: "assistant", content: "x".repeat(JSONL_TEXT_LIMIT) } })),
      output("This output is present in the source but exceeds the page preview budget."),
    ].map((value) => JSON.stringify(value)).join("\n");
    await open(document(source));
    assert.equal(text(record(1).findByProps({ className: "jsonl-tool-output" })), "（空输出）");
    const clipped = record(JSONL_PAGE_TEXT_LIMIT / JSONL_TEXT_LIMIT + 2);
    assert.equal(text(clipped.findByProps({ className: "jsonl-tool-output" })), "");
    assert.match(text(clipped.findByProps({ className: "jsonl-preview-limit" })), /预览已截取/);
    assert.doesNotMatch(text(clipped), /空输出/);
    assert.equal(text(renderer!.root.findByProps({ className: "jsonl-raw" })), source);
  });

  it("supports tab keyboard controls, shared dismissal requests, explicit close and backdrop-only closing", async () => {
    await open(); let prevented = 0; let stopped = 0;
    const key = (value: string) => ({ key: value, preventDefault() { prevented += 1; }, stopPropagation() { stopped += 1; } });
    await act(() => tab("渲染视图").props.onKeyDown(key("ArrowRight")));
    assert.equal(tab("原始文本").props["aria-selected"], true); assert.equal(tab("原始文本").props.tabIndex, 0);
    await act(() => tab("原始文本").props.onKeyDown(key("Home")));
    assert.equal(tab("渲染视图").props["aria-selected"], true);
    assert.equal(prevented, 2); assert.equal(stopped, 2);
    await act(() => renderer!.root.findByType(Dialog).props.onOpenChange(true)); assert.equal(closed, 0);
    await act(() => renderer!.root.findByType(Dialog).props.onOpenChange(false)); assert.equal(closed, 1);
    await act(() => renderer!.root.findByProps({ "aria-label": "关闭 JSONL" }).props.onClick()); assert.equal(closed, 2);
    const backdrop = renderer!.root.findAllByType("div").find((node) => node.props.className === "ui-dialog-overlay")!;
    await act(() => backdrop.props.onMouseDown({ target: "inside", currentTarget: "outside" })); assert.equal(closed, 2);
    await act(() => backdrop.props.onMouseDown({ target: "outside", currentTarget: "outside" })); assert.equal(closed, 3);
  });

  it("delegates initial close-button focus and connected trigger restoration to the shared dialog", async () => {
    const close = { isConnected: true };
    const opener = { isConnected: true };
    globalThis.fetch = async () => Response.json(document(""));
    await act(async () => { renderer = create(createElement(SessionJsonlDialog, { session: session(), onClose, returnFocus: opener as unknown as HTMLElement }), { createNodeMock: (element) => {
      const props = element.props as Record<string, unknown>;
      if (props["aria-label"] === "关闭 JSONL") return close;
      return null;
    } }); await settle(); });
    const content = renderer!.root.findByType(DialogContent);
    assert.equal(content.props.initialFocus.current, close);
    assert.equal(content.props.finalFocus("keyboard"), opener);
    assert.equal(content.props.showCloseButton, false);
    assert.equal(content.props.onKeyDown, undefined, "the feature does not install a competing focus trap or Escape handler");
    opener.isConnected = false;
    assert.equal(content.props.finalFocus("keyboard"), false, "removed triggers are never focused");
  });

  it("shows loading, rejects a wrong scope and retries ordinary read failures", async () => {
    const pending = deferred<Response>(); let attempts = 0;
    globalThis.fetch = async () => { attempts += 1; return attempts === 1 ? pending.promise : Response.json(document("null")); };
    await act(async () => { renderer = create(createElement(SessionJsonlDialog, { session: session(), onClose })); await settle(); });
    assert.match(text(renderer!.root), /正在读取 JSONL/);
    await act(async () => { pending.resolve(Response.json({ error: "读取失败" }, { status: 403 })); await settle(); });
    assert.match(text(renderer!.root.findByProps({ role: "alert" })), /JSONL 加载失败读取失败/);
    await act(async () => { renderer!.root.findAllByType("button").find((node) => text(node) === "重试")!.props.onClick(); await settle(); });
    assert.equal(attempts, 2); assert.equal(text(record(1).findByProps({ className: "jsonl-tool-output" })), "null");
    await act(() => renderer!.unmount()); renderer = undefined;
    await open(document('"private"', { projectId: "wrong-project" }));
    assert.match(text(renderer!.root.findByProps({ role: "alert" })), /所属项目或会话不匹配/);
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-raw" }).length, 0);
  });

  it("never renders a delayed old target into a new dialog or after close", async () => {
    const one = deferred<Response>(); const two = deferred<Response>();
    globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); return String(input).includes("/one/") ? one.promise : two.promise; };
    await act(async () => { renderer = create(createElement(SessionJsonlDialog, { session: session(), onClose })); await settle(); });
    await act(async () => { renderer!.update(createElement(SessionJsonlDialog, { session: session("two"), onClose })); await settle(); });
    assert.equal(requests[0].init?.signal?.aborted, true);
    await act(async () => { two.resolve(Response.json(document('"second target"', { sessionId: "two" }))); await settle(); });
    await act(async () => { one.resolve(Response.json(document('"wrong old target"'))); await settle(); });
    assert.equal(text(renderer!.root.findByProps({ className: "jsonl-raw" })), '"second target"');
    await act(() => renderer!.unmount()); renderer = undefined;
    assert.equal(requests.at(-1)?.init?.signal?.aborted, true);
  });

  it("retains malformed line diagnostics, truncation warning, empty states and bounded record pages", async () => {
    await open(document('bad json\n{"type":"future","payload":true}\n', { truncated: true, totalBytes: 9_000_000 }));
    assert.ok(renderer!.root.findAllByProps({ role: "alert" }).some((node) => /仅显示 JSONL 的部分内容/.test(text(node))));
    assert.ok(renderer!.root.findAllByProps({ role: "alert" }).some((node) => /第 1 行无法解析/.test(text(node))));
    assert.equal(text(record(1).findByProps({ className: "jsonl-tool-output" })), "bad json");
    await act(() => renderer!.unmount()); renderer = undefined;
    await open(document("", { fileName: undefined })); assert.match(text(renderer!.root), /尚未创建 JSONL 文件/); assert.match(text(renderer!.root), /还没有 JSONL 记录/);
    await act(() => renderer!.unmount()); renderer = undefined;
    await open(document(Array.from({ length: 401 }, (_, i) => JSON.stringify({ id: String(i) })).join("\n")));
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-record" }).length, 200);
    const pagination = renderer!.root.findByProps({ className: "jsonl-pagination" });
    await act(() => pagination.findAllByType("button").at(-1)!.props.onClick());
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-record" }).length, 200); assert.ok(record(201));
    assert.equal(record(201).props["data-selected"], true);
    assert.equal(renderer!.root.findByProps({ className: "jsonl-inspector" }).props["data-jsonl-inspector-line"], 201);
    await act(() => renderer!.root.findByProps({ className: "jsonl-pagination" }).findAllByType("button").at(-1)!.props.onClick());
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-record" }).length, 1); assert.ok(record(401));
    assert.equal(record(401).props["data-selected"], true);
  });
});
