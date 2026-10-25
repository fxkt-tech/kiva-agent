import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer, type TestRendererOptions } from "react-test-renderer";
import { installMotionMocks } from "./helpers/mock-motion";
import { webPreferences } from "../lib/web-preferences";
import type { ChatMessage } from "../lib/use-runtime";

installMotionMocks();
const { MessageContent } = await import("../components/message-content");

const empty: ChatMessage = { id: "assistant-1", role: "assistant", text: "", thinking: "", tools: [], streaming: true };
const tool = { id: "tool-1", name: "bash", args: { command: "printf '中文\\n'", timeout: 120 }, result: "  中文\nraw <output>\n", status: "running" as const };
const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
const host = (node: ReactTestInstance, className: string) => node.findAll((item) => typeof item.type === "string" && item.props.className?.split(/\s+/).includes(className))[0]!;

describe("real agent feedback in messages", () => {
  let renderer: ReactTestRenderer | undefined;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const root = () => renderer!.root;
  const waiting = () => root().findAll((node) => node.type === "span" && node.props.role === "status" && node.props.className?.includes("agent-waiting"));
  const thinkingButton = () => root().findAll((node) => node.type === "button" && node.props["aria-controls"] && text(node).includes("思考过程"))[0]!;
  async function mount(message = empty, options?: TestRendererOptions) { await act(() => { renderer = create(createElement(MessageContent, { message }), options); }); }
  async function update(message: ChatMessage) { await act(() => renderer!.update(createElement(MessageContent, { message }))); }

  beforeEach(() => {
    for (const key of ["window", "requestAnimationFrame", "navigator", "IS_REACT_ACT_ENVIRONMENT"]) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      addEventListener() {}, removeEventListener() {},
      setInterval(callback: () => void, delay: number) { return globalThis.setInterval(callback, delay); },
      clearInterval(timer: ReturnType<typeof setInterval>) { globalThis.clearInterval(timer); },
    } });
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => { callback(0); return 1; } });
    webPreferences.destroy(); webPreferences.resetGroup("conversation");
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount());
    renderer = undefined;
    webPreferences.destroy(); webPreferences.resetGroup("conversation");
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    saved.clear();
  });

  it("cycles truthful Swap phrases with a fixed accessible label and releases both animation intervals", async (context) => {
    context.mock.timers.enable({ apis: ["setInterval"] });
    const intervals = context.mock.method(globalThis, "setInterval");
    const cleared = context.mock.method(globalThis, "clearInterval");
    await mount();
    assert.equal(intervals.mock.callCount(), 2, "The actual phrase and ASCII loader effects both run");
    const status = waiting()[0];
    const label = () => root().findAll((node) => node.type === "span" && node.props.id === status.props["aria-labelledby"])[0]!;
    const phrase = () => status.findAll((node) => node.type === "span" && node.props["data-motion-initial"] === '{"opacity":0,"y":3}')[0]!;
    assert.equal(text(phrase()), "正在思考…");
    assert.equal(phrase().props["data-motion-exit"], '{"opacity":0,"y":-3}');
    assert.equal(text(label()), "正在处理请求，请稍候");
    assert.ok(status.findAll((node) => node.props.className?.includes("invisible") && text(node) === "正在处理请求…").length, "The longest phrase reserves stable width");
    await act(() => context.mock.timers.tick(1_800));
    assert.equal(text(phrase()), "正在处理请求…");
    assert.equal(text(label()), "正在处理请求，请稍候");
    await act(() => context.mock.timers.tick(1_800));
    assert.equal(text(phrase()), "请稍候…");
    await act(() => renderer!.unmount()); renderer = undefined;
    assert.equal(cleared.mock.callCount(), 2, "Unmount stops phrase rotation and the ASCII loader");
  });

  it("yields immediately to real reasoning, tools or output and stops waiting on completion or abort", async (context) => {
    context.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
    const cleared = context.mock.method(globalThis, "clearInterval");
    await mount();
    for (const content of [{ thinking: "真实推理" }, { tools: [tool] }, { text: "真实回答" }, { streaming: false }]) {
      await update(empty);
      const before = cleared.mock.callCount();
      assert.equal(waiting().length, 1);
      await update({ ...empty, ...content });
      assert.equal(waiting().length, 0);
      assert.equal(cleared.mock.callCount(), before + 2);
    }
    await act(() => context.mock.timers.tick(10_000));
    assert.equal(renderer!.toJSON(), null, "An ended empty message has no residual waiting UI");
    await update({ ...empty, role: "user" });
    assert.equal(renderer!.toJSON(), null, "Waiting feedback belongs only to streaming assistant messages");
  });

  it("honors initialized reasoning preferences and manual disclosure across stream updates and completion", async () => {
    webPreferences.update("conversation", { thinkingExpanded: true });
    const message = { ...empty, thinking: "Reasoning" };
    await mount(message);
    const button = thinkingButton();
    assert.equal(button.props["aria-expanded"], true);
    const region = root().findAll((node) => node.type === "div" && node.props.id === button.props["aria-controls"])[0]!;
    assert.equal(region.props["aria-hidden"], false);
    await act(() => button.props.onClick());
    await update({ ...message, thinking: "Reasoning continues" });
    await act(() => webPreferences.update("conversation", { thinkingExpanded: true }));
    assert.equal(thinkingButton(), button);
    assert.equal(button.props["aria-expanded"], false);
    assert.equal(region.props.inert, true);
    await update({ ...message, streaming: false, thinking: "Final reasoning" });
    assert.equal(button.props["aria-expanded"], false, "Completion preserves the reader's choice");
    await act(() => button.props.onClick());
    assert.equal(button.props["aria-expanded"], true);
    assert.match(text(region), /Final reasoning/);
    assert.doesNotMatch(text(root()), /Thought for|\d+s|Searching|Searched/);
  });

  it("retains reasoning and answer code nodes while batching and completing the original Markdown", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const message = { ...empty, thinking: "```ts\nconst reason = 1;\n```", text: "```ts\nconst answer = 2;\n```" };
    await mount(message);
    const [reasonCode, answerCode] = root().findAllByType("pre");
    await update({ ...message, thinking: `${message.thinking}\n\nMore reasoning`, text: `${message.text}\n\nMore answer` });
    assert.doesNotMatch(text(host(root(), "thinking-copy")), /More reasoning/);
    await act(() => context.mock.timers.tick(80));
    assert.match(text(host(root(), "thinking-copy")), /More reasoning/);
    assert.deepEqual(root().findAllByType("pre"), [reasonCode, answerCode]);
    await update({ ...message, streaming: false, thinking: `${message.thinking}\n\nFinal reason`, text: `${message.text}\n\nFinal answer` });
    assert.deepEqual(root().findAllByType("pre"), [reasonCode, answerCode]);
    assert.match(text(root()), /Final answer/);
  });

  it("keeps late tool runs active, real failures accessible and native tool state and raw copy intact", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const copied: string[] = [];
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { async writeText(value: string) { copied.push(value); } } } });
    webPreferences.update("conversation", { toolsExpanded: true });
    const message = { ...empty, streaming: false, tools: [tool] };
    await mount(message);
    const activity = host(root(), "agent-tools");
    const card = root().findByType("details");
    assert.equal(activity.props["aria-busy"], true, "Tool execution can outlive the assistant text stream");
    assert.equal(card.props.open, true);
    for (const button of card.findAllByType("button")) await act(async () => button.props.onClick());
    assert.deepEqual(copied, [JSON.stringify(tool.args, null, 2), tool.result]);
    await act(() => card.props.onToggle({ currentTarget: { open: false } }));
    await update({ ...message, tools: [{ ...tool, status: "error" }] });
    assert.equal(root().findByType("details"), card);
    assert.equal(card.props.open, false);
    assert.equal(activity.props["aria-busy"], false);
    assert.match(text(activity), /工具记录 · 1 项 · 1 项失败/);
    assert.equal(card.findByProps({ role: "img" }).props["aria-label"], "失败");
    await act(() => webPreferences.update("conversation", { toolsExpanded: true }));
    await update({ ...message, tools: [{ ...tool, status: "error" }, { ...tool, id: "tool-2", name: "read" }] });
    assert.equal(root().findAllByType("details")[0], card);
    assert.equal(card.props.open, false);
    assert.match(text(activity), /工具运行中 · 1 项 · 1 项失败/);
    assert.equal(waiting().length, 0);
  });

  it("leaves an interactive capped tool feed scrollable and stationary while new tool output arrives", async () => {
    let scrollCalls = 0;
    const viewport = { scrollTop: 140, scrollTo() { scrollCalls++; } };
    await mount({ ...empty, tools: [tool] }, { createNodeMock(element) {
      const props = element.props as { role?: string; className?: string };
      if (props.role === "list") return { offsetHeight: 600 };
      if (props.className?.includes("scrollbar-hide")) return viewport;
      return null;
    } });
    const activity = host(root(), "agent-tools");
    const feed = host(activity, "scrollbar-hide");
    assert.match(feed.props.className, /overflow-y-auto/);
    assert.equal(feed.props.style.height, 208);
    assert.equal(activity.findAll((node) => node.type === "div" && node.props.role === "list")[0].props["data-motion-animate"], '{"y":0}');
    await update({ ...empty, streaming: false, tools: [{ ...tool, result: `${tool.result}new output` }, { ...tool, id: "tool-2" }] });
    assert.equal(viewport.scrollTop, 140);
    assert.equal(scrollCalls, 0, "The adapter must not follow or reset a tool reader's internal scroll position");
    assert.match(feed.props.className, /overflow-y-auto/);
  });
});
