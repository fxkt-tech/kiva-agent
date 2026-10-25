import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useMessageScroll } from "../features/sessions/use-message-scroll";

class Viewport extends EventTarget {
  scrollTop = 0;
  scrollHeight = 2_000;
  clientHeight = 400;
  focused = false;
  focus() { this.focused = true; }
  getBoundingClientRect() { return { top: 40 }; }
  moveTo(top: number) { this.scrollTop = top; this.dispatchEvent(new Event("scroll")); }
  input(type: string, fields: object) { this.dispatchEvent(Object.assign(new Event(type), fields)); }
}

describe("conversation scroll following", () => {
  const globals = ["window", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "IS_REACT_ACT_ENVIRONMENT"];
  let descriptors: (PropertyDescriptor | undefined)[];
  let renderer: ReactTestRenderer | undefined;
  let viewport: Viewport;
  let controls: ReturnType<typeof useMessageScroll>;
  let frames: Map<number, FrameRequestCallback>;
  let resize: () => void;
  let disconnected: boolean;
  let reducedMotion: boolean;
  let time: number;
  let nextFrame: number;

  function Harness() {
    controls = useMessageScroll();
    return createElement("div", { ref: controls.setViewport, "data-viewport": true }, createElement("div", { ref: controls.setContent }));
  }
  async function mount() {
    await act(() => { renderer = create(createElement(Harness), { createNodeMock: (node) => node.props && typeof node.props === "object" && "data-viewport" in node.props ? viewport : {} }); });
  }
  async function tick() {
    await act(() => {
      time += 16;
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(time);
      viewport.dispatchEvent(new Event("scroll"));
    });
  }
  async function settle() {
    for (let i = 0; frames.size && i < 200; i++) await tick();
    assert.equal(frames.size, 0, "follow animation must settle instead of polling forever");
  }
  beforeEach(() => {
    descriptors = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    viewport = new Viewport(); frames = new Map(); time = 0; nextFrame = 0; reducedMotion = false; disconnected = false;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => ({ get matches() { return reducedMotion; } }) } });
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; } });
    Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: (id: number) => frames.delete(id) });
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    } });
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount());
    renderer = undefined;
    globals.forEach((name, index) => { const descriptor = descriptors[index]; if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  });

  it("opens at the latest message, batches streaming resizes, and eases toward a moving bottom", async () => {
    await mount();
    assert.equal(viewport.scrollTop, 1_600);
    assert.equal(controls.awayFromBottom, false);
    viewport.scrollHeight += 600;
    await act(() => { for (let i = 0; i < 20; i++) resize(); });
    assert.equal(frames.size, 1, "streaming updates share one animation");
    await tick();
    assert.ok(viewport.scrollTop > 1_600 && viewport.scrollTop < 2_200);
    viewport.scrollHeight += 300;
    await act(() => resize());
    assert.equal(frames.size, 1);
    await settle();
    assert.equal(viewport.scrollTop, 2_500);
    assert.equal(controls.awayFromBottom, false);
  });

  it("preserves the reading position through streaming and viewport/content resizes after scrolling up", async () => {
    await mount();
    await act(() => { viewport.input("wheel", { deltaY: -600 }); viewport.moveTo(1_000); });
    assert.equal(controls.awayFromBottom, true);
    for (let i = 0; i < 12; i++) { viewport.scrollHeight += 60; await act(() => resize()); }
    viewport.clientHeight = 320;
    await act(() => resize()); await settle();
    assert.equal(viewport.scrollTop, 1_000);
    assert.equal(controls.awayFromBottom, true);
  });

  it("cancels a pending follow frame immediately for upward wheel, touch and keyboard input", async () => {
    await mount();
    for (const input of [
      () => viewport.input("wheel", { deltaY: -1 }),
      () => viewport.input("keydown", { key: "PageUp" }),
      () => { viewport.input("touchstart", { touches: [{ clientY: 100 }] }); viewport.input("touchmove", { touches: [{ clientY: 120 }] }); },
    ]) {
      await act(() => controls.scrollToBottom()); await settle();
      const before = viewport.scrollTop;
      viewport.scrollHeight += 200;
      await act(() => { resize(); input(); });
      assert.equal(frames.size, 0);
      await act(() => resize()); await settle();
      assert.equal(viewport.scrollTop, before, "new updates must not restart an interrupted animation");
      assert.equal(controls.awayFromBottom, true);
    }
  });

  it("resumes following after the button or a manual scroll back to the bottom", async () => {
    await mount();
    await act(() => viewport.moveTo(800));
    assert.equal(controls.awayFromBottom, true);
    await act(() => controls.scrollToBottom()); await settle();
    assert.equal(viewport.scrollTop, 1_600); assert.equal(viewport.focused, true);
    assert.equal(controls.awayFromBottom, false);
    await act(() => viewport.moveTo(1_000));
    await act(() => viewport.moveTo(1_590)); await settle();
    assert.equal(controls.awayFromBottom, false);
    viewport.scrollHeight += 300; await act(() => resize()); await settle();
    assert.equal(viewport.scrollTop, 1_900);
  });

  it("honors reduced motion and leaves non-overflowing conversations still", async () => {
    viewport.scrollHeight = 200; reducedMotion = true;
    await mount();
    assert.equal(viewport.scrollTop, 0); assert.equal(controls.awayFromBottom, false);
    viewport.scrollHeight = 2_000; await act(() => resize()); await tick();
    assert.equal(viewport.scrollTop, 1_600); assert.equal(frames.size, 0);
  });

  it("keeps following when a layout shrink clamps the viewport to its new bottom", async () => {
    await mount();
    viewport.scrollHeight = 1_600;
    await act(() => { viewport.moveTo(1_200); resize(); });
    await settle();
    viewport.scrollHeight += 300; await act(() => resize()); await settle();
    assert.equal(viewport.scrollTop, 1_500, "tool collapse or viewport resize must not silently detach following");
    assert.equal(controls.awayFromBottom, false);
  });

  function messageAt(top: number): HTMLElement {
    return { getBoundingClientRect: () => ({ top: 40 + top - viewport.scrollTop }) } as HTMLElement;
  }

  it("cancels pending follow immediately when seeking an old message and stays detached on streaming", async () => {
    await mount();
    viewport.scrollHeight += 500;
    await act(() => resize());
    assert.equal(frames.size, 1);
    await act(() => controls.scrollToMessage(messageAt(500)));
    assert.equal(frames.size, 1, "seek replaces the pending follow frame");
    await tick();
    assert.ok(viewport.scrollTop < 1_600, "the first frame moves toward the old message");
    viewport.scrollHeight += 300;
    await act(() => resize());
    await settle();
    assert.equal(viewport.scrollTop, 484);
    assert.equal(controls.awayFromBottom, true);
    viewport.scrollHeight += 400;
    await act(() => resize()); await settle();
    assert.equal(viewport.scrollTop, 484, "stream output cannot restart bottom following");
    await act(() => controls.scrollToBottom()); await settle();
    assert.equal(viewport.scrollTop, 2_800);
    assert.equal(controls.awayFromBottom, false);
    viewport.scrollHeight += 100;
    await act(() => resize()); await settle();
    assert.equal(viewport.scrollTop, 2_900, "return-to-bottom resumes ongoing follow");
  });

  it("interrupts seeks in either direction with wheel, touch or keyboard input", async () => {
    await mount();
    for (const input of [
      () => viewport.input("wheel", { deltaY: 100 }),
      () => viewport.input("keydown", { key: "PageDown" }),
      () => { viewport.input("touchstart", { touches: [{ clientY: 100 }] }); viewport.input("touchmove", { touches: [{ clientY: 80 }] }); },
    ]) {
      await act(() => controls.scrollToBottom()); await settle();
      await act(() => controls.scrollToMessage(messageAt(500)));
      await tick();
      const before = viewport.scrollTop;
      await act(() => input());
      assert.equal(frames.size, 0);
      viewport.scrollHeight += 100;
      await act(() => resize()); await settle();
      assert.equal(viewport.scrollTop, before);
    }
  });

  it("cancels a seek immediately when the scrollbar moves manually", async () => {
    await mount();
    await act(() => controls.scrollToMessage(messageAt(500)));
    await tick();
    await act(() => viewport.moveTo(900));
    assert.equal(frames.size, 0);
    viewport.scrollHeight += 100;
    await act(() => resize()); await settle();
    assert.equal(viewport.scrollTop, 900);
    assert.equal(controls.awayFromBottom, true);
  });

  it("settles a seek when layout changes move the target beyond the new bottom", async () => {
    await mount();
    await act(() => viewport.moveTo(0));
    await act(() => controls.scrollToMessage(messageAt(1_500)));
    await tick();
    viewport.scrollHeight = 800;
    await act(() => resize()); await settle();
    assert.equal(viewport.scrollTop, 400);
    assert.equal(frames.size, 0);
    viewport.scrollHeight += 100;
    await act(() => resize()); await settle();
    assert.equal(viewport.scrollTop, 400, "layout clamp does not implicitly resume follow");
  });

  it("clamps seeks, honors reduced motion, and cancels a seek on disposal", async () => {
    reducedMotion = true;
    await mount();
    await act(() => controls.scrollToMessage(messageAt(-100))); await tick();
    assert.equal(viewport.scrollTop, 0);
    await act(() => controls.scrollToMessage(messageAt(99_000))); await tick();
    assert.equal(viewport.scrollTop, 1_600);
    reducedMotion = false;
    await act(() => controls.scrollToMessage(messageAt(200)));
    assert.equal(frames.size, 1);
    await act(() => renderer!.unmount()); renderer = undefined;
    assert.equal(frames.size, 0);
    controls.scrollToMessage(messageAt(400));
    assert.equal(frames.size, 0);
  });

  it("disconnects observers, listeners and frames on unmount", async () => {
    await mount();
    viewport.scrollHeight += 300; await act(() => resize());
    assert.equal(frames.size, 1);
    await act(() => renderer!.unmount()); renderer = undefined;
    assert.equal(disconnected, true); assert.equal(frames.size, 0);
    const before = viewport.scrollTop;
    viewport.input("wheel", { deltaY: -100 }); controls.scrollToBottom();
    assert.equal(viewport.scrollTop, before); assert.equal(frames.size, 0);
  });
});
