import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer, type TestRendererOptions } from "react-test-renderer";
import { installUiMocks } from "./helpers/mock-ui";
import type { ArtifactPreviewLease, SessionArtifact, SessionArtifactList } from "../shared/session-artifacts";

installUiMocks();
const { SessionArtifacts } = await import("../features/artifacts/session-artifacts");
const { ArtifactPreview } = await import("../features/artifacts/artifact-preview");
const { clampFloatingArtifact, initialFloatingArtifact } = await import("../features/artifacts/floating-artifact");
const { Dialog } = await import("../components/ui/dialog");
const { Popover, PopoverContent } = await import("../components/ui/popover");
const { DropdownMenuContent } = await import("../components/ui/dropdown-menu");
const scope = { projectId: "alpha", sessionId: "one" };
const artifact: SessionArtifact = { id: "demo", path: "outputs/demo.html", name: "demo.html", kind: "html", mimeType: "text/html", relations: ["written"], sources: [{ entryId: "entry-stable" }], availability: "available", currentVersion: true, version: "v1" };
const list = (overrides: Partial<SessionArtifactList> = {}): SessionArtifactList => ({ ...scope, artifacts: [artifact], revision: "r1", complete: true, warnings: [], ...overrides });
const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("session file bubbles and independent previews", () => {
  let renderer: ReactTestRenderer | undefined;
  let requests: Array<{ url: string; method: string }>;
  let sequence: number;
  let responseList: SessionArtifactList;
  let custom: ((url: string, method: string) => Promise<Response | undefined>) | undefined;
  const listeners = new Map<string, Set<() => void>>();
  const originals = new Map(["fetch", "window", "document", "ResizeObserver"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const control = (label: string) => renderer!.root.findAll((node) => node.type === "button" && node.props["aria-label"] === label)[0];
  const move = () => renderer!.root.findAll((node) => node.type === "div" && node.props["aria-label"] === "移动气泡预览")[0];
  const floating = () => renderer!.root.findAll((node) => node.type === "div" && node.props.className === "artifact-floating-preview")[0];
  const posts = () => requests.filter((request) => request.method === "POST");
  function lease(id = `lease-${++sequence}`, artifactId = artifact.id): ArtifactPreviewLease { return { ...scope, artifactId, leaseId: id, url: `/preview/${id}/outputs/demo.html`, expiresAt: new Date(Date.now() + 900_000).toISOString(), warnings: [] }; }
  beforeEach(() => {
    sequence = 0; requests = []; responseList = list(); custom = undefined; listeners.clear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1440, innerHeight: 900, addEventListener(name: string, listener: () => void) { const entries = listeners.get(name) ?? new Set(); entries.add(listener); listeners.set(name, entries); }, removeEventListener(name: string, listener: () => void) { listeners.get(name)?.delete(listener); } } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, fullscreenElement: null } });
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} disconnect() {} } });
    globalThis.fetch = async (input, init) => {
      const url = String(input), method = init?.method ?? "GET"; requests.push({ url, method });
      const overridden = await custom?.(url, method); if (overridden) return overridden;
      if (method === "DELETE") return Response.json({ accepted: true });
      if (url.endsWith("/preview")) return Response.json(lease(undefined, url.split("/").at(-2)));
      if (url.endsWith("/content")) return new Response('<script>alert("escaped")</script>');
      if (url.endsWith("/artifacts")) return Response.json(responseList);
      throw new Error(`Unexpected request ${method} ${url}`);
    };
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount()); renderer = undefined;
    await settle();
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  });
  async function mount(options?: TestRendererOptions) { await act(async () => { renderer = create(createElement(SessionArtifacts, { scope, refreshKey: "0", onSource() {} }), options); await settle(); }); }
  async function openList() { if (control("打开会话输出")) await act(async () => { control("打开会话输出").props.onClick({}); await settle(); }); }
  async function selectFloating() { await act(async () => { control("气泡预览 outputs/demo.html").props.onClick(); await settle(); }); }
  function key(node: ReactTestInstance, value: string, shiftKey = false) { node.props.onKeyDown({ key: value, shiftKey, preventDefault() {}, stopPropagation() {} }); }

  it("starts with no sidebar or reads, toggles an anchored list, and defaults to a modal", async () => {
    await mount();
    assert.equal(requests.length, 0); assert.equal(renderer!.root.findAllByType("aside").length, 0);
    assert.equal(control("打开会话输出").props["aria-expanded"], false);
    await openList();
    assert.deepEqual(requests, [{ url: "/api/projects/alpha/sessions/one/artifacts", method: "GET" }]);
    assert.equal(control("收起会话输出").props["aria-expanded"], true);
    const newTab = renderer!.root.findByProps({ "aria-label": "在新标签页打开 outputs/demo.html" });
    assert.equal(newTab.props.target, "_blank"); assert.equal(newTab.props.rel, "noopener noreferrer");
    assert.equal(newTab.props.href, "/artifact-preview/alpha/one/demo");
    await act(async () => { control("预览 outputs/demo.html").props.onClick({ currentTarget: { isConnected: false } }); await settle(); });
    assert.equal(control("收起会话输出").props["aria-expanded"], true);
    assert.equal(renderer!.root.findAllByProps({ className: "artifact-list" }).length, 1, "default modal leaves its output list mounted");
    assert.equal(renderer!.root.findByType("iframe").props.sandbox, "allow-scripts"); assert.equal(posts().length, 1);
    await act(() => control("关闭文件预览").props.onClick({}));
    assert.ok(requests.some((request) => request.method === "DELETE" && request.url.endsWith("lease-1")));
    assert.ok(!requests.some((request) => request.url.endsWith("/content")));
  });

  it("labels the list as outputs, changes the header icon and ignores only outside/focus dismissals", async () => {
    await mount();
    const header = renderer!.root.findByProps({ className: "conversation-header" });
    const svg = () => header.findByType("svg");
    assert.match(svg().props.className, /lucide-panel-top-open/);
    await openList();
    assert.match(svg().props.className, /lucide-panel-top-close/);
    const title = renderer!.root.findAllByType("h2").find((node) => text(node) === "输出");
    assert.ok(title);
    const popover = () => renderer!.root.findByType(Popover);
    assert.equal(popover().props.modal, false);
    for (const reason of ["outside-press", "focus-out"]) {
      const details = { reason, isCanceled: false, cancel() { this.isCanceled = true; }, preventUnmountOnClose() {} };
      await act(() => popover().props.onOpenChange(false, details));
      assert.equal(details.isCanceled, true);
      assert.equal(control("收起会话输出").props["aria-expanded"], true);
      assert.ok(control("预览 outputs/demo.html"));
    }
    await act(() => control("收起会话输出").props.onClick({}));
    assert.equal(control("打开会话输出").props["aria-expanded"], false);
    await openList();
    const escape = { reason: "escape-key", isCanceled: false, cancel() { this.isCanceled = true; }, preventUnmountOnClose() {} };
    await act(() => popover().props.onOpenChange(false, escape));
    assert.equal(escape.isCanceled, false);
    assert.equal(control("打开会话输出").props["aria-expanded"], false);
  });

  it("retains the compact list, filter and exact modal return target; Escape does not close behind the modal", async () => {
    await mount(); await openList();
    const row = control("预览 outputs/demo.html"), scroll = renderer!.root.findByProps({ className: "artifact-list-scroll" });
    const search = renderer!.root.findAll((node) => node.type === "input" && node.props["aria-label"] === "筛选会话输出")[0];
    await act(() => search.props.onChange({ target: { value: "demo" } }));
    const trigger = { isConnected: true };
    await act(async () => { row.props.onClick({ currentTarget: trigger }); await settle(); });
    const modal = renderer!.root.findByProps({ className: "artifact-preview-dialog" });
    assert.equal(modal.props.finalFocus(), trigger);
    const escape = { reason: "escape-key", isCanceled: false, cancel() { this.isCanceled = true; }, preventUnmountOnClose() {} };
    await act(() => renderer!.root.findByType(Popover).props.onOpenChange(false, escape));
    assert.equal(escape.isCanceled, true); assert.equal(control("收起会话输出").props["aria-expanded"], true);
    await act(() => control("关闭文件预览").props.onClick({}));
    assert.equal(control("预览 outputs/demo.html"), row); assert.equal(renderer!.root.findByProps({ className: "artifact-list-scroll" }), scroll);
    assert.equal(search.props.value, "demo"); assert.equal(control("收起会话输出").props["aria-expanded"], true);
    const listRow = renderer!.root.findByType("li");
    assert.equal(listRow.findAllByProps({ className: "artifact-row-details" }).length, 0);
    assert.equal(text(listRow.findByProps({ className: "artifact-file-copy" })), "demo.htmloutputs");
    assert.equal(listRow.findByProps({ className: "artifact-row-actions" }).findAllByType("button").length, 1);
    assert.equal(listRow.findByProps({ className: "artifact-row-actions" }).findAllByType("a").length, 1);
  });

  it("uses a single default-modal toolbar with shared controls and preserves list focus and HTML state", async () => {
    await mount(); await openList();
    const row = control("预览 outputs/demo.html"), trigger = { isConnected: true };
    await act(async () => { row.props.onClick({ currentTarget: trigger }); await settle(); });
    const popup = renderer!.root.findByProps({ className: "artifact-preview-dialog" });
    const headers = popup.findAll((node) => node.type === "header");
    assert.equal(headers.length, 1); assert.equal(headers[0].props.className, "artifact-modal-toolbar");
    assert.equal(popup.findAllByProps({ className: "artifact-dialog-heading" }).length, 0);
    assert.equal(popup.findAllByProps({ className: "artifact-preview-toolbar" }).length, 0);
    assert.equal(popup.findAllByProps({ className: "artifact-source-link" }).length, 0);
    assert.equal(popup.props.finalFocus(), trigger);
    const frame = renderer!.root.findByType("iframe");
    await act(async () => { control("源码").props.onClick(); await settle(); });
    assert.equal(renderer!.root.findByType("pre").children[0], '<script>alert("escaped")</script>');
    await act(() => control("页面").props.onClick());
    assert.equal(renderer!.root.findByType("iframe"), frame); assert.equal(posts().length, 1);
    await act(() => control("更多预览操作").props.onClick({}));
    const items = renderer!.root.findAll((node) => node.props.role === "menuitem");
    assert.ok(items.some((node) => text(node).includes("查看来源消息")));
    assert.ok(items.some((node) => text(node).includes("在新标签页打开预览")));
    assert.ok(items.some((node) => text(node).includes("全屏预览")));
    await act(() => control("关闭文件预览").props.onClick({}));
    assert.equal(control("预览 outputs/demo.html"), row); assert.equal(control("收起会话输出").props["aria-expanded"], true);
  });

  it("does not restore disposed menu/modal/list focus over the source viewer transition", async () => {
    let destination: string | undefined;
    await act(async () => { renderer = create(createElement(SessionArtifacts, { scope, refreshKey: "0", onSource(href) { destination = href; } })); await settle(); });
    await openList();
    await act(async () => { control("预览 outputs/demo.html").props.onClick({ currentTarget: { isConnected: true } }); await settle(); });
    const modalFocus = renderer!.root.findByProps({ className: "artifact-preview-dialog" }).props.finalFocus;
    const listFocus = renderer!.root.findByType(PopoverContent).props.finalFocus;
    await act(() => control("更多预览操作").props.onClick({}));
    const menuFocus = renderer!.root.findByType(DropdownMenuContent).props.finalFocus;
    const sourceItem = renderer!.root.findAll((node) => node.props.role === "menuitem" && text(node).includes("查看来源消息"))[0];
    await act(() => sourceItem.props.onClick({ preventDefault() {} }));
    assert.match(destination!, /jsonl=1.*target=entry-stable/);
    assert.equal(menuFocus(), false); assert.equal(modalFocus(), false); assert.equal(listFocus(), false);
  });

  it("portals compact More into the fullscreen root and restores its normal portal after exit", async () => {
    let fullscreenChanged = () => {};
    Object.assign(document, { addEventListener(name: string, listener: () => void) { if (name === "fullscreenchange") fullscreenChanged = listener; }, async exitFullscreen() { Object.assign(document, { fullscreenElement: null }); fullscreenChanged(); } });
    const root = { async requestFullscreen() { Object.assign(document, { fullscreenElement: root }); fullscreenChanged(); } };
    await act(async () => { renderer = create(createElement(ArtifactPreview, { scope, artifact, renderToolbar: ({ controls }) => createElement("div", { className: "test-toolbar" }, controls) }), { createNodeMock(element) { return element.props && typeof element.props === "object" && "className" in element.props && element.props.className === "artifact-preview" ? root : null; } }); await settle(); });
    await act(() => control("更多预览操作").props.onClick({}));
    assert.equal(renderer!.root.findByType(DropdownMenuContent).props.portalContainer, undefined);
    const item = (label: string) => renderer!.root.findAll((node) => node.props.role === "menuitem").find((node) => text(node).trim() === label)!;
    await act(async () => { item("全屏预览").props.onClick({}); await settle(); });
    await act(() => control("更多预览操作").props.onClick({}));
    assert.equal(renderer!.root.findByType(DropdownMenuContent).props.portalContainer.current, root);
    await act(async () => { item("退出全屏预览").props.onClick({}); await settle(); });
    await act(() => control("更多预览操作").props.onClick({}));
    assert.equal(renderer!.root.findByType(DropdownMenuContent).props.portalContainer, undefined); assert.equal(posts().length, 1);
  });

  it("merges floating title and preview controls into one header without duplicating state or source rows", async () => {
    await mount(); await openList(); await selectFloating();
    const popup = floating(), frame = renderer!.root.findByType("iframe");
    const header = popup.findAll((node) => node.type === "div" && node.props.className === "artifact-floating-toolbar");
    assert.equal(header.length, 1); assert.equal(popup.findAllByProps({ className: "artifact-preview-toolbar" }).length, 0);
    assert.equal(popup.findAllByProps({ className: "artifact-source-link" }).length, 0);
    assert.ok(header[0].findAll((node) => node.type === "div" && node.props["aria-label"] === "移动气泡预览").length);
    await act(async () => { control("源码").props.onClick(); await settle(); });
    assert.equal(renderer!.root.findByType("pre").children[0], '<script>alert("escaped")</script>');
    assert.equal(renderer!.root.findByType("iframe"), frame); assert.equal(posts().length, 1);
    await act(() => control("更多预览操作").props.onClick({}));
    const items = renderer!.root.findAll((node) => node.props.role === "menuitem");
    assert.ok(items.some((node) => text(node).includes("查看来源消息")));
    assert.ok(items.some((node) => text(node).includes("全屏预览")));
    const raw = renderer!.root.findAllByType("a").find((node) => node.props.href === "/artifact-preview/alpha/one/demo")!;
    assert.equal(raw.props.target, "_blank"); assert.equal(raw.props.rel, "noopener noreferrer");
  });

  it("keeps every image operation available through the compact header overflow", async () => {
    const image = { ...artifact, kind: "image" as const, path: "chart.png", name: "chart.png", mimeType: "image/png" };
    responseList = list({ artifacts: [image] }); await mount(); await openList();
    await act(async () => { control("气泡预览 chart.png").props.onClick(); await settle(); });
    const img = renderer!.root.findByType("img");
    await act(() => img.props.onLoad({ currentTarget: { naturalWidth: 200, naturalHeight: 100 } }));
    await act(() => control("更多预览操作").props.onClick({}));
    const item = (name: string) => renderer!.root.findAll((node) => node.props.role === "menuitem").find((node) => text(node).includes(name))!;
    assert.ok(item("放大图片")); assert.ok(item("缩小图片"));
    await act(() => item("原尺寸").props.onClick({}));
    assert.equal(img.props.style.width, 200); assert.equal(img.props.style.height, 100); assert.equal(posts().length, 1);
  });

  it("keeps floating HTML and its lease through list toggles, movement and resizing; closes only its own instance", async () => {
    await mount(); await openList(); await selectFloating();
    const frame = renderer!.root.findByType("iframe"), url = frame.props.src;
    assert.ok(renderer!.root.findAllByType(Dialog).some((node) => node.props.modal === false && node.props.disablePointerDismissal));
    assert.equal(posts().length, 1); assert.equal(control("打开会话输出").props["aria-expanded"], false);
    await openList(); await act(() => control("收起会话输出").props.onClick({}));
    const original = floating().props.style;
    await act(() => { key(move(), "ArrowLeft"); key(control("调整气泡预览大小"), "ArrowLeft"); key(control("调整气泡预览大小"), "ArrowUp"); });
    assert.equal(floating().props.style.left, original.left - 10);
    assert.equal(floating().props.style.width, original.width - 10); assert.equal(floating().props.style.height, original.height - 10);
    assert.equal(renderer!.root.findByType("iframe"), frame); assert.equal(frame.props.src, url); assert.equal(posts().length, 1);
    assert.equal(requests.filter((request) => request.method === "DELETE").length, 0);
    await act(() => control("关闭气泡预览").props.onClick({}));
    assert.equal(renderer!.root.findAllByType("iframe").length, 0);
    assert.ok(requests.some((request) => request.method === "DELETE" && request.url.endsWith("lease-1")));
  });

  it("uses pointer capture with a temporary iframe shield and clears cancellation; clamps on viewport resize", async () => {
    await mount(); await openList(); await selectFloating();
    const captured = new Set<number>();
    const target = { focus() {}, setPointerCapture(id: number) { captured.add(id); }, hasPointerCapture(id: number) { return captured.has(id); }, releasePointerCapture(id: number) { captured.delete(id); } };
    const before = floating().props.style;
    const event = { button: 0, pointerId: 7, clientX: 10, clientY: 10, currentTarget: target, preventDefault() {} };
    await act(() => move().props.onPointerDown(event));
    assert.ok(captured.has(7)); assert.equal(renderer!.root.findAllByProps({ className: "artifact-floating-shield" }).length, 1);
    await act(() => move().props.onPointerMove({ ...event, clientX: 100, clientY: 75 }));
    assert.equal(floating().props.style.left, Math.min(before.left + 90, 1440 - before.width - 8));
    await act(() => move().props.onPointerCancel(event));
    assert.equal(captured.size, 0); assert.equal(renderer!.root.findAllByProps({ className: "artifact-floating-shield" }).length, 0);
    Object.assign(window, { innerWidth: 320, innerHeight: 480 });
    await act(() => { for (const listener of listeners.get("resize") ?? []) listener(); });
    const box = floating().props.style;
    assert.ok(box.left >= 8 && box.top >= 8); assert.ok(box.left + box.width <= 312); assert.ok(box.top + box.height <= 472);
    assert.equal(posts().length, 1);
  });

  it("shifts wide reading content only while a bubble is on the right and restores center when closed", async () => {
    await mount({ createNodeMock(element) { return element.props && typeof element.props === "object" && "className" in element.props && element.props.className === "conversation-workspace" ? { getBoundingClientRect: () => ({ left: 252, width: 1188 }) } : null; } });
    const layout = () => renderer!.root.findByProps({ className: "conversation-workspace" }).props.style["--artifact-reading-shift"];
    assert.equal(layout(), "0px"); await openList(); assert.equal(layout(), "120px");
    await selectFloating(); assert.equal(layout(), "120px");
    await act(() => key(move(), "ArrowLeft", true)); assert.equal(layout(), "120px", "small movement on the right keeps the requested shift");
    await act(() => { for (let step = 0; step < 11; step++) key(move(), "ArrowLeft", true); });
    assert.equal(layout(), "0px", "do not shift content left into a left-positioned bubble");
    await act(() => key(move(), "Home")); assert.equal(layout(), "120px");
    await act(() => control("关闭气泡预览").props.onClick({})); assert.equal(layout(), "0px");
  });

  it("fits initial and resized geometry within narrow viewports without forcing a desktop minimum", () => {
    for (const size of [{ width: 320, height: 480 }, { width: 390, height: 300 }, { width: 1440, height: 900 }]) {
      for (const box of [initialFloatingArtifact(size), clampFloatingArtifact({ x: -500, y: 5000, width: 5000, height: 5000 }, size)]) {
        assert.ok(box.x >= 8 && box.y >= 8); assert.ok(box.x + box.width <= size.width - 8); assert.ok(box.y + box.height <= size.height - 8);
      }
    }
  });

  it("replaces one floating file and revokes its previous lease without changing the default modal action", async () => {
    responseList = list({ artifacts: [artifact, { ...artifact, id: "other", path: "other.html", name: "other.html" }] });
    await mount(); await openList(); await selectFloating(); await openList();
    await act(async () => { control("气泡预览 other.html").props.onClick(); await settle(); });
    assert.equal(renderer!.root.findAllByType("iframe").length, 1); assert.equal(posts().length, 2);
    assert.ok(requests.some((request) => request.method === "DELETE" && request.url.endsWith("lease-1")));
    await openList(); await act(async () => { control("预览 outputs/demo.html").props.onClick({ currentTarget: null }); await settle(); });
    assert.equal(renderer!.root.findAllByType("iframe").length, 2, "default modal and independent floating window coexist");
    await act(() => control("关闭文件预览").props.onClick({})); assert.equal(renderer!.root.findAllByType("iframe").length, 1);
  });

  it("refreshes modal metadata after completion while the file-list bubble is closed without restarting HTML", async () => {
    await mount(); await openList();
    await act(async () => { control("预览 outputs/demo.html").props.onClick({ currentTarget: null }); await settle(); });
    await act(() => control("收起会话输出").props.onClick({}));
    assert.equal(control("打开会话输出").props["aria-expanded"], false);
    const frame = renderer!.root.findByType("iframe");
    const initialReads = requests.filter((request) => request.method === "GET").length;
    responseList = list({ artifacts: [{ ...artifact, version: "v2" }], revision: "r2" });
    await act(() => renderer!.update(createElement(SessionArtifacts, { scope, refreshKey: "done", onSource() {} })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 210)); await settle(); });
    assert.equal(requests.filter((request) => request.method === "GET").length, initialReads + 1);
    assert.match(text(renderer!.root), /文件已更新/);
    assert.equal(renderer!.root.findByType("iframe"), frame);
    assert.equal(posts().length, 1, "metadata refresh preserves the interactive document's lease");
    await act(() => control("关闭文件预览").props.onClick({}));
    const closedReads = requests.filter((request) => request.method === "GET").length;
    await act(() => renderer!.update(createElement(SessionArtifacts, { scope, refreshKey: "done-again", onSource() {} })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 210)); await settle(); });
    assert.equal(requests.filter((request) => request.method === "GET").length, closedReads, "no reads once all previews and the list are closed");
  });

  it("rejects mismatched list identities and performs no hidden completion scans", async () => {
    responseList = list({ sessionId: "two" }); await mount(); await openList();
    assert.match(text(renderer!.root), /输出列表所属会话或返回格式不匹配/); assert.equal(control("预览 outputs/demo.html"), undefined);
    await act(() => control("收起会话输出").props.onClick({})); const count = requests.length;
    await act(() => renderer!.update(createElement(SessionArtifacts, { scope, refreshKey: "done", onSource() {} })));
    assert.equal(requests.length, count); assert.equal(posts().length, 0);
  });

  it("revokes a late lease after its preview was closed", async () => {
    const held = deferred<Response>(); custom = async (url, method) => method === "POST" && url.endsWith("/preview") ? held.promise : undefined;
    await act(async () => { renderer = create(createElement(ArtifactPreview, { scope, artifact })); await settle(); });
    await act(() => renderer!.unmount()); renderer = undefined;
    await act(async () => { held.resolve(Response.json(lease("late"))); await settle(); });
    assert.ok(requests.some((request) => request.method === "DELETE" && request.url.endsWith("/late")));
  });

  it("keeps HTML running across file updates and source viewing until explicit refresh", async () => {
    await act(async () => { renderer = create(createElement(ArtifactPreview, { scope, artifact })); await settle(); });
    const original = renderer!.root.findByType("iframe").props.src;
    await act(() => renderer!.update(createElement(ArtifactPreview, { scope, artifact: { ...artifact, version: "v2" } })));
    assert.match(text(renderer!.root), /文件已更新/); assert.equal(posts().length, 1);
    const source = renderer!.root.findAllByType("button").find((node) => text(node).includes("源码"))!;
    await act(async () => { source.props.onClick(); await settle(); });
    assert.equal(renderer!.root.findByType("pre").children[0], '<script>alert("escaped")</script>');
    assert.equal(renderer!.root.findByType("iframe").props.src, original); assert.equal(posts().length, 1);
    await act(async () => { control("刷新预览").props.onClick(); await settle(); });
    assert.equal(posts().length, 2); assert.doesNotMatch(text(renderer!.root), /文件已更新/);
  });

});
