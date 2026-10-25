import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { installMotionMocks } from "./helpers/mock-motion";
import type { ChatMessage } from "../lib/use-runtime";

installMotionMocks();
const { ConversationPreviewRail, messageRailItems } = await import("../features/sessions/conversation-preview-rail");

function message(index: number): ChatMessage {
  return { id: `stable-${index}`, role: index % 2 ? "assistant" : "user", text: `Real message ${index}`, thinking: "", tools: [] };
}
class Viewport extends EventTarget {
  scrollTop = 0;
  scrollHeight = 2_000;
  clientHeight = 400;
  gutter = false;
  getBoundingClientRect() { return { top: 40 }; }
  closest() { return { classList: { toggle: (_: string, value: boolean) => { this.gutter = value; }, remove: () => { this.gutter = false; } } }; }
}

describe("conversation preview navigation", () => {
  let renderer: ReactTestRenderer | undefined;
  let viewport: Viewport;
  let messages: ChatMessage[];
  let rows: Array<{ dataset: { messageId: string }; getBoundingClientRect(): { top: number } }>;
  let selected: string[];
  let observers: Array<{ callback: () => void; disconnected: boolean }>;
  let descriptors: Array<PropertyDescriptor | undefined>;
  let hostHeight: number;
  const globals = ["ResizeObserver", "window", "IS_REACT_ACT_ENVIRONMENT"];
  const ticks = () => renderer!.root.findAllByProps({ "data-slot": "preview-rail-item" });
  const cards = () => renderer!.root.findAllByProps({ "data-slot": "preview-rail-card" });
  const content = { querySelectorAll: (selector: string) => {
    assert.equal(selector, "article.user-message[data-message-id]");
    return rows.filter((row) => messages.some((item) => item.id === row.dataset.messageId && item.role === "user"));
  } };
  const props = () => ({ messages, viewport: viewport as unknown as HTMLDivElement, content: content as unknown as HTMLDivElement,
    onSelect: (row: HTMLElement) => { selected.push(row.dataset.messageId!); } });
  const mount = async () => act(() => { renderer = create(createElement(ConversationPreviewRail, props()), {
    createNodeMock: () => ({ get clientHeight() { return hostHeight; }, contains: () => false, querySelector: () => null }),
  }); });
  const resize = async () => act(() => { for (const observer of observers) if (!observer.disconnected) observer.callback(); });
  beforeEach(() => {
    descriptors = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    observers = []; viewport = new Viewport(); selected = []; hostHeight = 300;
    messages = Array.from({ length: 6 }, (_, index) => message(index));
    rows = messages.map((item, index) => ({ dataset: { messageId: item.id }, getBoundingClientRect: () => ({ top: 40 + index * 300 - viewport.scrollTop }) }));
    Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
      record: { callback: () => void; disconnected: boolean };
      constructor(callback: () => void) { this.record = { callback, disconnected: false }; observers.push(this.record); }
      observe() {}
      disconnect() { this.record.disconnected = true; }
    } });
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount()); renderer = undefined;
    assert.ok(observers.every((observer) => observer.disconnected));
    globals.forEach((name, index) => { const descriptor = descriptors[index]; if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  });

  it("maps stable IDs and bounded real excerpts without parsing source or inventing content", () => {
    messages[0].text = "  <script>alert(1)</script>\n ```source```  ";
    messages[2].text = "x".repeat(2_000);
    messages[1].text = "Excluded assistant text";
    messages[4].text = " ";
    const items = messageRailItems(messages);
    assert.equal(items[0].id, "stable-0");
    assert.equal(items[0].description, "<script>alert(1)</script> ```source```");
    assert.equal(items[1].description, "x".repeat(280));
    assert.equal(items[2].description, "");
    assert.equal(items[0].label, "你 · 1");
    assert.match(items[1].ariaLabel!, /你，第 2 条输入/);
    assert.deepEqual(items.map((item) => item.id), ["stable-0", "stable-2", "stable-4"]);
    assert.equal(items[2].label, "你 · 3");
  });

  it("shows only overflowing multi-message history and releases the gutter on disposal", async () => {
    viewport.scrollHeight = 200;
    await mount();
    assert.equal(ticks().length, 0); assert.equal(viewport.gutter, false);
    viewport.scrollHeight = 2_000; await resize();
    assert.equal(ticks().length, 3); assert.equal(viewport.gutter, true);
    await act(() => renderer!.unmount()); renderer = undefined;
    assert.equal(viewport.gutter, false);
    messages = [message(0), message(1), message(3)]; rows = rows.slice(0, 3); await mount();
    assert.equal(ticks().length, 0);
    messages = [message(1), message(3)];
    await act(() => renderer!.update(createElement(ConversationPreviewRail, props())));
    assert.equal(renderer!.root.findAllByType("nav").length, 0);
  });

  it("uses real source hover/focus without navigating and selects exact rows without treating the last user input as the live bottom", async () => {
    await mount();
    assert.equal(renderer!.root.findByType("nav").props["aria-label"], "输入导航");
    await act(() => ticks()[1].props.onPointerEnter({ pointerType: "mouse", buttons: 0 }));
    assert.deepEqual(selected, []); assert.equal(cards().length, 1);
    assert.equal(cards()[0].findByType("p").children.join(""), "Real message 2");
    await act(() => ticks()[2].props.onFocus({ currentTarget: { matches: () => true } }));
    assert.deepEqual(selected, []);
    await act(() => ticks()[1].props.onClick({ preventDefault() {} }));
    await act(() => ticks()[2].props.onClick({ preventDefault() {} }));
    assert.deepEqual(selected, ["stable-2", "stable-4"]);
  });

  it("tracks the real viewport, including bottom resizes, and removes route listeners", async () => {
    await mount();
    assert.equal(ticks()[0].props["aria-current"], "location");
    await act(() => { viewport.scrollTop = 610; viewport.dispatchEvent(new Event("scroll")); });
    assert.equal(ticks()[1].props["aria-current"], "location");
    // Reading the assistant after an input keeps that preceding input active.
    await act(() => { viewport.scrollTop = 910; viewport.dispatchEvent(new Event("scroll")); });
    assert.equal(ticks()[1].props["aria-current"], "location");
    await act(() => { viewport.scrollTop = 1_600; viewport.dispatchEvent(new Event("scroll")); });
    assert.equal(ticks()[2].props["aria-current"], "location");
    await act(() => renderer!.unmount()); renderer = undefined;
    viewport.dispatchEvent(new Event("scroll"));
    assert.ok(observers.every((observer) => observer.disconnected));
  });

  it("removes navigation and stale targets when the conversation becomes empty", async () => {
    await mount();
    assert.equal(ticks().length, 3);
    // Radix removes its viewport before the rail's effect cleanup runs.
    Object.defineProperty(viewport, "closest", { value: () => null });
    await act(() => renderer!.update(createElement(ConversationPreviewRail, { ...props(), messages: [], viewport: null, content: null })));
    assert.equal(renderer!.root.findAllByType("nav").length, 0);
    assert.equal(viewport.gutter, false);
    assert.ok(observers.every((observer) => observer.disconnected));
    viewport.dispatchEvent(new Event("scroll"));
    assert.deepEqual(selected, []);
  });

  it("keeps every message reachable for long histories and refreshes scoped row identity", async () => {
    messages = Array.from({ length: 200 }, (_, index) => message(index));
    rows = messages.map((item) => ({ dataset: { messageId: item.id }, getBoundingClientRect: () => ({ top: 40 }) }));
    await mount();
    assert.equal(ticks().length, 100);
    await act(() => ticks()[0].props.onClick({ preventDefault() {} }));
    await act(() => ticks()[99].props.onClick({ preventDefault() {} }));
    assert.deepEqual(selected, ["stable-0", "stable-198"]);
    messages = [message(400), message(401), message(402)];
    rows = messages.map((item) => ({ dataset: { messageId: item.id }, getBoundingClientRect: () => ({ top: 40 }) }));
    await act(() => renderer!.update(createElement(ConversationPreviewRail, props())));
    assert.equal(ticks().length, 2);
    await act(() => ticks()[0].props.onClick({ preventDefault() {} }));
    assert.deepEqual(selected.at(-1), "stable-400");
    assert.ok(observers.some((observer) => observer.disconnected), "old scope observers disconnected");
  });

  it("bounds row measurements and reuses excerpts while scrolling long history", async () => {
    let textReads = 0, rowReads = 0;
    messages = Array.from({ length: 1_000 }, (_, index) => ({ ...message(index), get text() { textReads++; return `Real message ${index}`; } }));
    rows = messages.map((item, index) => ({ dataset: { messageId: item.id }, getBoundingClientRect: () => {
      rowReads++;
      return { top: 40 + index * 300 - viewport.scrollTop };
    } }));
    viewport.scrollHeight = 300_000;
    await mount();
    const initialTextReads = textReads;
    rowReads = 0;
    await act(() => { viewport.scrollTop = 210_010; viewport.dispatchEvent(new Event("scroll")); });
    assert.equal(ticks()[350].props["aria-current"], "location");
    assert.ok(rowReads <= 11, `expected bounded measurements, read ${rowReads} rows`);
    assert.equal(textReads, initialTextReads, "scroll state must not normalize historical text again");
    messages = messages.map((item, index) => index === 700 ? { ...item, text: "New streamed text" } : item);
    await act(() => renderer!.update(createElement(ConversationPreviewRail, props())));
    await act(() => ticks()[350].props.onPointerEnter({ pointerType: "mouse", buttons: 0 }));
    assert.equal(cards()[0].findByType("p").children.join(""), "New streamed text");
  });

  it("reserves readable preview space for two inputs and clamps both ends after resizing", async () => {
    messages = messages.slice(0, 4);
    rows = rows.slice(0, 4);
    await mount();
    const host = () => renderer!.root.findByProps({ className: "conversation-preview-rail-host" });
    for (const available of [148, 100]) {
      if (available === 100) { hostHeight = 100; await resize(); }
      const padding = Number.parseFloat(host().props.style["--preview-rail-padding"]);
      assert.equal(padding, (available - 36) / 2);
      for (const index of [0, 1]) {
        await act(() => ticks()[index].props.onPointerEnter({ pointerType: "mouse", buttons: 0 }));
        const card = cards()[0];
        const height = Number.parseFloat(card.props.style["--preview-height"]);
        const offset = Number.parseFloat(card.props.style["--preview-offset"]);
        const center = padding + index * 18 + 9;
        assert.equal(height, available, "preview must not be clipped to the 36px tick stack");
        assert.ok(center - height / 2 + offset >= 0, "preview stays above the lower boundary");
        assert.ok(center + height / 2 + offset <= available, "preview stays below the upper boundary");
        assert.equal(card.findByType("p").children.join(""), `Real message ${index * 2}`);
      }
    }
  });
});
