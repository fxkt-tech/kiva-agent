import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { installMotionMocks } from "./helpers/mock-motion";
import type { AgentActivityProps } from "../components/agents/agent-activity/types";

const motionOptions = { reducedMotion: false };
installMotionMocks(motionOptions);
const { AgentActivity } = await import("../components/agents/agent-activity");
const { ReasoningText } = await import("../components/agents/loading-states/reasoning-text");
const items: AgentActivityProps["items"] = [{ id: "real-entry", type: "text", content: "Actual streamed content" }];

describe("beUI activity integration controls", () => {
  let renderer: ReactTestRenderer | undefined;
  let contentHeight = 40;
  let resize: (() => void) | undefined;
  let disconnected = false;
  let scrollCalls: unknown[];
  const globals = ["IS_REACT_ACT_ENVIRONMENT", "ResizeObserver", "requestAnimationFrame"] as const;
  let previous: Map<string, PropertyDescriptor | undefined>;

  beforeEach(() => {
    previous = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    } });
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (callback: (time: number) => void) => { callback(0); return 1; } });
    contentHeight = 40;
    disconnected = false;
    resize = undefined;
    scrollCalls = [];
    motionOptions.reducedMotion = false;
  });

  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount());
    renderer = undefined;
    for (const name of globals) {
      const descriptor = previous.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  async function mount(props: Omit<AgentActivityProps, "items"> = {}) {
    await act(() => {
      renderer = create(createElement(AgentActivity, { items, ...props }), {
        createNodeMock(element) {
          const props = element.props;
          if (props && typeof props === "object" && "role" in props && props.role === "list") {
            return { get offsetHeight() { return contentHeight; } };
          }
          return { scrollTo: (options: unknown) => scrollCalls.push(options) };
        },
      });
    });
  }

  const region = () => renderer!.root.findAll((node) => node.type === "div" && node.props.role === "region")[0];
  const viewport = () => renderer!.root.findAll((node) => node.type === "div" && node.props.className?.includes("scrollbar-hide"))[0];
  const content = () => renderer!.root.findAll((node) => node.type === "div" && node.props.role === "list")[0];

  it("retains upstream active expansion, reserved height and completion defaults", async () => {
    await mount({ open: false });
    assert.equal(region().props["aria-hidden"], false);
    assert.equal(region().props.style.height, 208);
    assert.equal(renderer!.root.findAllByType("button").length, 0);
    await act(() => renderer!.update(createElement(AgentActivity, { items, status: "complete" })));
    assert.equal(region().props["aria-hidden"], true);
    assert.equal(renderer!.root.findByType("button").props["aria-expanded"], false);
    await act(() => renderer!.unmount());
    renderer = undefined;
    assert.equal(disconnected, true, "The source measurement observer must disconnect on disposal");
  });

  it("uses the working label and honors controlled disclosure through completion", async () => {
    const changes: boolean[] = [];
    const props = {
      items, open: false, expandWhileWorking: false, collapseOnComplete: false,
      activeLabel: "正在整理真实推理", summary: "推理记录",
      onOpenChange: (next: boolean) => changes.push(next),
    };
    await mount(props);
    const trigger = renderer!.root.findByType("button");
    assert.equal(trigger.props["aria-expanded"], false);
    assert.equal(region().props.inert, true);
    assert.ok(trigger.findAll((node) => node.children.includes("正在整理真实推理")).length > 0);
    await act(() => trigger.props.onClick());
    assert.deepEqual(changes, [true]);
    assert.equal(region().props["aria-hidden"], true, "Controlled state waits for its owner");
    await act(() => renderer!.update(createElement(AgentActivity, { ...props, open: true })));
    assert.equal(region().props["aria-hidden"], false);
    assert.deepEqual(scrollCalls, [{ top: 0 }]);
    await act(() => renderer!.update(createElement(AgentActivity, { ...props, open: true, status: "complete" })));
    assert.deepEqual(changes, [true], "Completion must not overwrite the user's disclosure preference");
    assert.equal(region().props["aria-hidden"], false);
    await act(() => renderer!.root.findByType("button").props.onClick());
    assert.deepEqual(changes, [true, false]);
  });

  it("preserves a manually closed run while retaining default forced-open completion", async () => {
    const props = { items, expandWhileWorking: false, collapseOnComplete: false, defaultOpen: true };
    await mount(props);
    await act(() => renderer!.root.findByType("button").props.onClick());
    assert.equal(region().props["aria-hidden"], true);
    await act(() => renderer!.update(createElement(AgentActivity, { ...props, status: "complete" })));
    assert.equal(region().props["aria-hidden"], true);
    await act(() => renderer!.unmount());
    renderer = undefined;
    await mount({ collapseOnComplete: false });
    await act(() => renderer!.update(createElement(AgentActivity, { items, collapseOnComplete: false, status: "complete" })));
    assert.equal(region().props["aria-hidden"], false, "Omitting the new controls preserves upstream completion behavior");
  });

  it("measures compact content and leaves an interactive running feed scrollable", async () => {
    await mount({ reserveWorkingHeight: false, followWhileWorking: false });
    assert.equal(region().props.style.height, 40, "Short content must not reserve an empty 208px viewport");
    assert.deepEqual(JSON.parse(content().props["data-motion-animate"]), { y: 0 });
    contentHeight = 380;
    await act(() => resize?.());
    assert.equal(region().props.style.height, 208);
    assert.match(viewport().props.className, /overflow-y-auto/);
    assert.deepEqual(JSON.parse(content().props["data-motion-animate"]), { y: 0 });
    await act(() => renderer!.update(createElement(AgentActivity, { items })));
    assert.match(viewport().props.className, /overflow-y-hidden/);
    assert.deepEqual(JSON.parse(content().props["data-motion-animate"]), { y: -172 }, "Gliding remains the default");
  });

  it("calms Swap and disclosure transforms under reduced motion", async () => {
    motionOptions.reducedMotion = true;
    await act(() => {
      renderer = create(createElement(ReasoningText, {
        variant: "swap", phrases: ["正在处理请求"], statusLabel: "正在处理请求",
        indicator: createElement("span", null, "•"),
      }));
    });
    const swap = renderer!.root.findAll((node) => node.type === "span" && node.props["data-motion-tag"])[0];
    assert.deepEqual(JSON.parse(swap.props["data-motion-initial"]), { opacity: 0 });
    assert.deepEqual(JSON.parse(swap.props["data-motion-animate"]), { opacity: 1 });
    assert.deepEqual(JSON.parse(swap.props["data-motion-exit"]), { opacity: 0 });
    assert.equal(JSON.parse(swap.props["data-motion-transition"]).duration, 0.12);
    assert.ok(renderer!.root.findAllByType("style").some((node) => node.children.some((child) => typeof child === "string" && child.includes("prefers-reduced-motion: reduce"))));
    await act(() => renderer!.unmount());
    renderer = undefined;
    await mount({ expandWhileWorking: false, defaultOpen: true });
    assert.deepEqual(JSON.parse(region().props["data-motion-animate"]), { opacity: 1 });
    assert.equal(JSON.parse(region().props["data-motion-transition"]).duration, 0);
    assert.deepEqual(JSON.parse(content().props["data-motion-transition"]), { duration: 0 });
  });
});
