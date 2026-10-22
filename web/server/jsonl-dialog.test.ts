import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer, type TestRendererOptions } from "react-test-renderer";
import { installUiMocks } from "./helpers/mock-ui";
import type { SessionJsonlDocument } from "../shared/session-jsonl";
import type { SessionResource } from "../shared/workspace-contract";
import { parseSessionViewerLink } from "../features/sessions/session-viewer-link";

installUiMocks();
const { SessionJsonlDialog } = await import("../features/sessions/session-jsonl-dialog");
const { Dialog, DialogContent } = await import("../components/ui/dialog");

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
function session(id = "one"): SessionResource { return { id, projectId: "alpha", name: `Session ${id}`, path: `/sessions/${id}.jsonl`, collection: "active", preview: "", updatedAt: "2026-10-21T00:00:00Z", createdAt: "2026-10-21T00:00:00Z", legacy: false, executable: true }; }
function document(content: string, overrides: Partial<SessionJsonlDocument> = {}): SessionJsonlDocument { return { projectId: "alpha", sessionId: "one", fileName: "one.jsonl", content, bytes: Buffer.byteLength(content), totalBytes: Buffer.byteLength(content), truncated: false, ...overrides }; }
function message(id: string, parentId: string | null, content: string, role = "user") { return { type: "message", id, parentId, message: { role, content } }; }
const jsonl = (records: unknown[]) => records.map((record) => JSON.stringify(record)).join("\n");
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("owned session JSONL reader", () => {
  let renderer: ReactTestRenderer | undefined;
  let closed: number;
  let requests: Array<{ url: string; init?: RequestInit }>;
  let clipboard: string[];
  const originals = new Map(["fetch", "document", "window", "navigator"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const onClose = () => { closed += 1; };
  const tab = (label: string) => renderer!.root.findAllByProps({ role: "tab" }).find((node) => text(node) === label)!;
  const records = () => renderer!.root.findAllByProps({ className: "jsonl-record" });
  const record = (line: number) => records().find((node) => node.props["data-jsonl-line"] === line)!;
  const tree = (line: number) => renderer!.root.findAllByProps({ role: "treeitem" }).find((node) => node.props["data-tree-line"] === line)!;
  const control = (label: string) => renderer!.root.findAll((node) => node.type === "button" && node.props["aria-label"] === label)[0];
  const toggle = (label: string) => renderer!.root.findAllByType("label").find((node) => text(node) === label)!.findByType("input");
  async function open(source = document(jsonl([message("root", null, "hello")])), options?: TestRendererOptions, initialSelection?: Parameters<typeof SessionJsonlDialog>[0]["initialSelection"]) {
    globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); return Response.json(source); };
    await act(async () => { renderer = create(createElement(SessionJsonlDialog, { session: session(), onClose, initialSelection }), options); await settle(); });
  }
  beforeEach(() => {
    closed = 0; requests = []; clipboard = [];
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost:9495" } } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { async writeText(value: string) { clipboard.push(value); } } } });
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount()); renderer = undefined;
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  });

  it("reads the exact passive scope, starts at the newest branch and preserves original raw source", async () => {
    const source = '\r\n' + jsonl([message("root", null, "<script>你好</script>"), message("old", "root", "旧分支", "assistant"), message("new", "root", "新分支", "assistant")]).replaceAll("\n", "\r\n") + '\r\nbad json\n42\n';
    await open(document(source));
    assert.deepEqual(requests.map(({ url, init }) => [url, init?.method ?? "GET"]), [["/api/projects/alpha/sessions/one/jsonl", "GET"]]);
    assert.equal(tab("渲染视图").props["aria-selected"], true);
    assert.deepEqual(records().map((node) => node.props["data-jsonl-line"]), [2, 4]);
    assert.equal(tree(4).props["aria-selected"], true);
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-field-tree" }).length, 0, "source details mount only when requested");
    await act(() => tree(3).props.onClick());
    assert.deepEqual(records().map((node) => node.props["data-jsonl-line"]), [2, 3]);
    assert.doesNotMatch(text(renderer!.root), /链接中的记录未在当前快照中找到/);
    await act(() => tree(2).props.onClick());
    assert.deepEqual(records().map((node) => node.props["data-jsonl-line"]), [2, 4], "reselecting the ancestor follows its newest descendant");
    assert.doesNotMatch(text(renderer!.root), /链接中的记录未在当前快照中找到/);
    assert.match(text(record(2)), /<script>你好<\/script>/);
    await act(() => tab("原始文本").props.onClick());
    assert.equal(text(renderer!.root.findByProps({ className: "jsonl-raw" })), source);
    assert.equal(requests.length, 1);
    assert.equal(renderer!.root.findAll((node) => Boolean(node.props.dangerouslySetInnerHTML)).length, 0);
  });

  it("filters and searches navigation while retaining the target and keeping branch reading intact", async () => {
    await open(document(jsonl([message("user", null, "开始"), { type: "model_change", id: "model", parentId: "user", modelId: "fixture" }, message("old", "model", "旧分支目标", "assistant"), message("latest", "model", "最新分支", "assistant")])));
    assert.equal(tree(2), undefined, "default tree hides settings");
    const filter = renderer!.root.findByProps({ "aria-label": "会话树过滤", value: "default" });
    await act(() => filter.props.onValueChange("all"));
    assert.ok(tree(2));
    const search = renderer!.root.findByProps({ "aria-label": "搜索会话树" });
    await act(() => search.props.onChange({ target: { value: "旧分支目标" } }));
    assert.deepEqual(renderer!.root.findAllByProps({ role: "treeitem" }).map((node) => node.props["data-tree-line"]), [3, 4]);
    assert.match(text(record(4)), /最新分支/);
    await act(() => tree(3).props.onClick());
    assert.match(text(record(3)), /旧分支目标/);
    assert.equal(record(4), undefined);
    assert.equal(requests.length, 1);
  });

  it("groups confirmed tools, retains both source records, and controls thought/output/hidden visibility", async () => {
    const source = jsonl([
      message("user", null, "请检查 **工作区**"),
      { type: "message", id: "call", parentId: "user", message: { role: "assistant", content: [{ type: "thinking", thinking: "先确认状态" }, { type: "text", text: "运行 `git status`" }, { type: "toolCall", id: "tool", name: "bash", arguments: { command: "git status --short" } }] } },
      { type: "message", id: "output", parentId: "call", message: { role: "toolResult", toolCallId: "tool", toolName: "bash", isError: false, content: [{ type: "text", text: " M README.md" }] } },
      { type: "custom_message", id: "hidden", parentId: "output", display: false, customType: "fixture", content: "隐藏的扩展上下文" },
      message("done", "hidden", "完成 ![图片](https://example.invalid/image.png)", "assistant"),
    ]);
    await open(document(source));
    assert.equal(text(record(1).findByProps({ className: "markdown-body" })), "请检查 工作区");
    assert.equal(record(3), undefined, "confirmed result is grouped into its call");
    const group = record(2).findByProps({ className: "jsonl-tool-call" });
    assert.equal(group.props["data-result-line"], 3); assert.match(text(group), /bashgit status --short成功/);
    assert.equal(group.findByProps({ className: "jsonl-tool-result" }).props.open, false);
    assert.equal(record(2).findByProps({ className: "jsonl-thinking" }).props.open, false);
    assert.equal(record(4), undefined);
    await act(() => toggle("展开思考").props.onChange({ target: { checked: true } }));
    await act(() => toggle("展开工具输出").props.onChange({ target: { checked: true } }));
    await act(() => toggle("显示隐藏消息").props.onChange({ target: { checked: true } }));
    assert.equal(record(2).findByProps({ className: "jsonl-thinking" }).props.open, true);
    assert.equal(record(2).findByProps({ className: "jsonl-tool-result" }).props.open, true);
    assert.match(text(record(4)), /隐藏的扩展上下文/);
    const trigger = { isConnected: true };
    await act(() => control("查看第 3 行详情").props.onClick({ currentTarget: trigger }));
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 2);
    assert.match(text(renderer!.root.findByProps({ className: "jsonl-parent" })), /L2call/);
    await act(() => renderer!.root.findByProps({ "aria-label": "展开字段 message" }).props.onClick());
    assert.match(text(renderer!.root.findByProps({ className: "jsonl-field-tree" })), /toolResult/);
    const popup = renderer!.root.findAllByType(DialogContent).at(-1)!;
    assert.equal(popup.props.finalFocus(), trigger);
    await act(() => control("关闭记录详情").props.onClick());
    assert.equal(renderer!.root.findAllByProps({ className: "jsonl-field-tree" }).length, 0);
    assert.equal(renderer!.root.findAllByType("img").length, 0);
    assert.equal(requests.length, 1);
  });

  it("preserves diagnostic source evidence without fabricating branch membership", async () => {
    await open(document(jsonl([message("root", null, "正常消息"), { type: "message", id: "orphan", parentId: "missing", message: { role: "assistant", content: "孤立消息" } }, null]) + '\nbad json'));
    assert.ok(record(1)); assert.equal(record(4), undefined);
    await act(() => tree(4).props.onClick());
    assert.match(text(record(4)), /第 4 行无法解析/);
    assert.equal(text(record(4).findByProps({ className: "jsonl-tool-output" })), "bad json");
    await act(() => tree(2).props.onClick());
    assert.equal(record(1), undefined, "missing parents never attach to the previous source line");
    assert.match(text(record(2)), /孤立消息/);
  });

  it("bounds tree and reading DOM and reveals a searched target beyond both windows", async () => {
    const source = jsonl(Array.from({ length: 401 }, (_, index) => message(`id-${index}`, index ? `id-${index - 1}` : null, `消息 ${index + 1}`)));
    await open(document(source));
    assert.ok(records().length <= 60); assert.equal(record(401).props["data-selected"], true, "reader still starts on the latest leaf");
    assert.ok(tree(1)); assert.equal(tree(401), undefined, "tree starts on the first page independently of the reader");
    assert.match(text(renderer!.root.findByProps({ className: "jsonl-tree-pagination" })), /1–160 \/ 401/);
    assert.ok(renderer!.root.findAllByProps({ role: "treeitem" }).length <= 160);
    const search = renderer!.root.findByProps({ "aria-label": "搜索会话树" });
    await act(() => search.props.onChange({ target: { value: '"content":"消息 201"' } }));
    await act(() => tree(201).props.onClick());
    assert.ok(record(201)); assert.equal(record(201).props["data-selected"], true);
    assert.equal(records().length, 60);
    assert.match(text(renderer!.root.findByProps({ className: "jsonl-pagination" })), /181–240 \/ 401/);
    await act(() => renderer!.root.findByProps({ className: "jsonl-pagination" }).findAllByType("button").at(-1)!.props.onClick());
    assert.ok(record(241)); assert.equal(record(201), undefined);
    assert.equal(requests.length, 1);
  });

  it("moves tree keyboard focus across render windows without changing the selected branch", async () => {
    const focus: number[] = [];
    const source = jsonl(Array.from({ length: 401 }, (_, index) => message(`id-${index}`, index ? `id-${index - 1}` : null, `消息 ${index + 1}`)));
    await open(document(source), { createNodeMock(element) {
      if ((element.props as Record<string, unknown>).className === "jsonl-tree-list") return { scrollTop: 0, querySelector(selector: string) { return { focus() { focus.push(Number(selector.match(/"(\d+)"/u)![1])); } }; } };
      return null;
    } }, { target: "id-0" });
    let prevented = 0;
    await act(() => tree(1).props.onKeyDown({ key: "End", preventDefault() { prevented += 1; }, stopPropagation() {} }));
    assert.ok(tree(401)); assert.equal(tree(401).props.tabIndex, 0); assert.deepEqual(focus, [401]);
    assert.equal(record(1).props["data-selected"], true);
    await act(() => tree(401).props.onKeyDown({ key: "Home", preventDefault() { prevented += 1; }, stopPropagation() {} }));
    assert.ok(tree(1)); assert.equal(tree(1).props.tabIndex, 0); assert.deepEqual(focus, [401, 1]); assert.equal(prevented, 2);
  });

  it("copies original message text and a link that reopens the exact historical branch and target", async () => {
    const originalText = "原始消息 " + "x".repeat(13_000);
    const source = document(jsonl([message("root", null, originalText), message("old", "root", "旧分支", "assistant"), message("new", "root", "新分支", "assistant")]));
    await open(source);
    await act(() => tree(2).props.onClick());
    await act(async () => control("复制第 1 行文本").props.onClick());
    assert.equal(clipboard[0], originalText, "copy is not limited to the rendered preview");
    await act(async () => control("复制第 1 行链接").props.onClick());
    const link = new URL(clipboard[1]);
    assert.equal(link.pathname, "/projects/alpha/sessions/one");
    const parsed = parseSessionViewerLink(link.searchParams);
    assert.equal(parsed.selection.leaf, "old"); assert.equal(parsed.selection.target, "root");
    assert.equal(link.href.includes(originalText), false);
    await act(() => renderer!.unmount()); renderer = undefined;
    await open(source, undefined, parsed.selection);
    assert.ok(record(2)); assert.equal(record(3), undefined); assert.equal(tree(1).props["aria-selected"], true);
  });

  it("uses line fallbacks for oversized IDs and folds unmatched tool outputs with the global control", async () => {
    const longId = "x".repeat(600);
    const source = document(jsonl([
      message(longId, null, "根消息"),
      { type: "message", id: "result", parentId: longId, message: { role: "toolResult", toolCallId: "unknown", toolName: "bash", content: "未配对输出" } },
      message("done", "result", "完成", "assistant"),
    ]));
    await open(source);
    assert.equal(record(2).findByProps({ className: "jsonl-tool-result" }).props.open, false);
    await act(() => toggle("展开工具输出").props.onChange({ target: { checked: true } }));
    assert.equal(record(2).findByProps({ className: "jsonl-tool-result" }).props.open, true);
    await act(async () => control("复制第 1 行链接").props.onClick());
    const parsed = parseSessionViewerLink(new URL(clipboard[0]).searchParams);
    assert.equal(parsed.error, undefined); assert.equal(parsed.selection.target, undefined); assert.equal(parsed.selection.targetLine, 1);
    await act(() => renderer!.unmount()); renderer = undefined;
    await open(source, undefined, parsed.selection);
    assert.equal(record(1).props["data-selected"], true); assert.equal(records().length, 3);
  });

  it("preserves mobile tree search across navigation and delegates nested focus and dismissal", async () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost:9495" }, matchMedia() { return { matches: true, addEventListener() {}, removeEventListener() {} }; } } });
    await open(document(jsonl([message("root", null, "开始"), message("old", "root", "历史目标", "assistant"), message("latest", "root", "最新分支", "assistant")])));
    assert.equal(renderer!.root.findAllByProps({ role: "treeitem" }).length, 0);
    await act(() => control("打开会话树").props.onClick());
    const search = renderer!.root.findByProps({ "aria-label": "搜索会话树" });
    await act(() => search.props.onChange({ target: { value: "历史目标" } }));
    await act(() => tree(2).props.onClick());
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 1); assert.equal(record(2).props["data-selected"], true);
    await act(() => control("打开会话树").props.onClick());
    assert.equal(renderer!.root.findByProps({ "aria-label": "搜索会话树" }).props.value, "历史目标");
    const popup = renderer!.root.findAllByType(DialogContent).at(-1)!;
    assert.ok(popup.props.initialFocus); assert.ok(popup.props.finalFocus); assert.equal(popup.props.onKeyDown, undefined);
    await act(() => renderer!.root.findAllByType(Dialog).at(-1)!.props.onOpenChange(false));
    assert.equal(closed, 0); assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 1);
  });

  it("retains manual tree paging across mobile remounts and reveals a later selected target", async () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost:9495" }, matchMedia() { return { matches: true, addEventListener() {}, removeEventListener() {} }; } } });
    const source = jsonl(Array.from({ length: 401 }, (_, index) => message(`id-${index}`, index ? `id-${index - 1}` : null, `消息 ${index + 1}`)));
    await open(document(source));
    assert.equal(record(401).props["data-selected"], true);
    await act(() => control("打开会话树").props.onClick()); assert.ok(tree(1)); assert.equal(tree(401), undefined);
    const pagination = () => renderer!.root.findByProps({ className: "jsonl-tree-pagination" });
    await act(() => pagination().findAllByType("button").find((node) => text(node) === "尾页")!.props.onClick());
    assert.ok(tree(401)); assert.equal(tree(1), undefined);
    await act(() => control("关闭会话树").props.onClick());
    await act(() => toggle("展开思考").props.onChange({ target: { checked: true } }));
    await act(() => control("打开会话树").props.onClick()); assert.ok(tree(401)); assert.equal(tree(1), undefined, "manual last page survives unrelated reader changes and tree remount");
    await act(() => tree(350).props.onClick());
    assert.equal(record(350).props["data-selected"], true);
    await act(() => control("打开会话树").props.onClick()); assert.equal(tree(350).props["aria-selected"], true);
    await act(() => pagination().findAllByType("button").find((node) => text(node) === "首页")!.props.onClick()); assert.ok(tree(1));
    await act(() => control("关闭会话树").props.onClick());
    await act(() => control("打开会话树").props.onClick()); assert.ok(tree(1)); assert.equal(tree(350), undefined, "manual first page is not replaced by the active target on reopen");
    assert.equal(record(350).props["data-selected"], true);
    await act(() => control("关闭会话树").props.onClick());
    await act(() => renderer!.update(createElement(SessionJsonlDialog, { session: session(), onClose, initialSelection: { target: "id-200" } })));
    await act(() => control("打开会话树").props.onClick());
    assert.equal(tree(201).props["aria-selected"], true); assert.equal(tree(1), undefined, "a later real target change reveals its page");
    assert.equal(record(201).props["data-selected"], true); assert.equal(requests.length, 1);
  });

  it("downloads the exact returned UTF-8 snapshot and names truncated snapshots explicitly", async () => {
    const source = '\uFEFF{"type":"session"}\r\n\r\nbad json\r\n{"tail":';
    const originalCreate = URL.createObjectURL; const originalRevoke = URL.revokeObjectURL;
    let blob: Blob | undefined; const anchor = { href: "", download: "", clicked: false, removed: false, click() { this.clicked = true; }, remove() { this.removed = true; } };
    URL.createObjectURL = (value) => { blob = value as Blob; return "blob:snapshot"; }; URL.revokeObjectURL = () => {};
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement(tag: string) { assert.equal(tag, "a"); return anchor; }, body: { append() {} } } });
    try {
      await open(document(source, { truncated: true, totalBytes: 9_000_000 }));
      await act(() => control("下载已读取的部分 JSONL 快照").props.onClick());
      assert.equal(anchor.download, "one.partial.jsonl"); assert.equal(anchor.href, "blob:snapshot"); assert.ok(anchor.clicked && anchor.removed);
      assert.deepEqual(Buffer.from(await blob!.arrayBuffer()), Buffer.from(source));
      assert.equal(text(renderer!.root.findByProps({ className: "jsonl-raw" })), source);
    } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
  });

  it("supports tab keys, shared dismissal, explicit close and nested overlay ownership", async () => {
    await open(); let prevented = 0; let stopped = 0;
    const key = (value: string) => ({ key: value, preventDefault() { prevented += 1; }, stopPropagation() { stopped += 1; } });
    await act(() => tab("渲染视图").props.onKeyDown(key("ArrowRight")));
    assert.equal(tab("原始文本").props["aria-selected"], true); assert.equal(tab("原始文本").props.tabIndex, 0);
    await act(() => tab("原始文本").props.onKeyDown(key("Home")));
    assert.equal(tab("渲染视图").props["aria-selected"], true); assert.equal(prevented, 2); assert.equal(stopped, 2);
    await act(() => renderer!.root.findByType(Dialog).props.onOpenChange(true)); assert.equal(closed, 0);
    await act(() => renderer!.root.findByType(Dialog).props.onOpenChange(false)); assert.equal(closed, 1);
    await act(() => control("关闭 JSONL").props.onClick()); assert.equal(closed, 2);
    const backdrop = renderer!.root.findAllByType("div").find((node) => node.props.className === "ui-dialog-overlay")!;
    await act(() => backdrop.props.onMouseDown({ target: "inside", currentTarget: "outside" })); assert.equal(closed, 2);
    await act(() => backdrop.props.onMouseDown({ target: "outside", currentTarget: "outside" })); assert.equal(closed, 3);
  });

  it("delegates close-button focus and exact connected trigger restoration to the shared dialog", async () => {
    const close = { isConnected: true }; const opener = { isConnected: true };
    globalThis.fetch = async () => Response.json(document(""));
    await act(async () => { renderer = create(createElement(SessionJsonlDialog, { session: session(), onClose, returnFocus: opener as unknown as HTMLElement }), { createNodeMock: (element) => (element.props as Record<string, unknown>)["aria-label"] === "关闭 JSONL" ? close : null }); await settle(); });
    const content = renderer!.root.findByType(DialogContent);
    assert.equal(content.props.initialFocus.current, close); assert.equal(content.props.finalFocus(), opener); assert.equal(content.props.showCloseButton, false);
    assert.equal(content.props.onKeyDown, undefined);
    opener.isConnected = false; assert.equal(content.props.finalFocus(), false);
  });

  it("shows read failures, retries, validates resource identity and explains missing link targets", async () => {
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
    assert.match(text(renderer!.root.findByProps({ role: "alert" })), /所属项目或会话不匹配/); assert.equal(renderer!.root.findAllByProps({ className: "jsonl-raw" }).length, 0);
    await act(() => renderer!.unmount()); renderer = undefined;
    await open(document(jsonl([message("root", null, "available")])), undefined, { target: "missing" });
    assert.match(text(renderer!.root), /链接中的记录未在当前快照中找到/); assert.ok(record(1));
  });

  it("ignores delayed old-scope reads and aborts on close", async () => {
    const one = deferred<Response>(); const two = deferred<Response>();
    globalThis.fetch = async (input, init) => { requests.push({ url: String(input), init }); return String(input).includes("/one/") ? one.promise : two.promise; };
    await act(async () => { renderer = create(createElement(SessionJsonlDialog, { session: session(), onClose })); await settle(); });
    await act(async () => { renderer!.update(createElement(SessionJsonlDialog, { session: session("two"), onClose })); await settle(); });
    assert.equal(requests[0].init?.signal?.aborted, true);
    await act(async () => { two.resolve(Response.json(document('"second target"', { sessionId: "two" }))); await settle(); });
    await act(async () => { one.resolve(Response.json(document('"wrong old target"'))); await settle(); });
    assert.equal(text(renderer!.root.findByProps({ className: "jsonl-raw" })), '"second target"');
    await act(() => renderer!.unmount()); renderer = undefined; assert.equal(requests.at(-1)?.init?.signal?.aborted, true);
  });
});
