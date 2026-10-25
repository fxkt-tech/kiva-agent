import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { installMotionMocks } from "./helpers/mock-motion";

const motionOptions = { reducedMotion: false };
installMotionMocks(motionOptions);
const { PreviewRail } = await import("../components/motion/preview-rail");
type Props = Parameters<typeof PreviewRail>[0];

const items = Array.from({ length: 5 }, (_, index) => ({
  id: `message-${index}`, label: `Message ${index + 1}`,
  ariaLabel: `Go to message ${index + 1}`, description: `<script>${index}</script>`,
}));
const pointer = (pointerType = "mouse", buttons = 0, pointerId = 1) => ({ pointerType, buttons, pointerId });

describe("official standalone PreviewRail", () => {
  let renderer: ReactTestRenderer | undefined;
  let listeners: Map<string, Set<EventListenerOrEventListenerObject>>;
  let originalWindow: PropertyDescriptor | undefined;
  const rootNode = { contains: (target: unknown) => target === rootNode };
  const ticks = () => renderer!.root.findAllByProps({ "data-slot": "preview-rail-item" });
  const cards = () => renderer!.root.findAllByProps({ "data-slot": "preview-rail-card" });
  const root = () => renderer!.root.findAll((node) => node.type === "div" && node.props.onBlur)[0];
  const nav = () => renderer!.root.findByType("nav");
  const fireWindow = (type: string, target: unknown = {}, key?: string) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { target: { value: target }, key: { value: key } });
    for (const listener of [...(listeners.get(type) ?? [])]) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
    return event;
  };
  const mount = async (props: Partial<Props> = {}) => {
    await act(() => {
      renderer = create(createElement(PreviewRail, { items, ...props }), {
        createNodeMock: () => rootNode,
      });
    });
  };
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    listeners = new Map();
    motionOptions.reducedMotion = false;
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners.get(type)?.delete(listener);
      },
    } });
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount());
    renderer = undefined;
    assert.equal([...listeners.values()].reduce((sum, set) => sum + set.size, 0), 0, "dismiss listeners cleaned up");
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  it("retains default geometry, native controls, accessible labels and an initially hidden preview", async () => {
    await mount();
    assert.equal(nav().props["aria-label"], "Section navigation");
    assert.equal(nav().props.style.gridTemplateRows, "repeat(5, 24px)");
    assert.equal(ticks()[0].props["aria-current"], "location");
    assert.equal(ticks()[0].props.type, "button");
    assert.equal(ticks()[0].props["aria-label"], "Go to message 1");
    assert.equal(cards().length, 0);
    const scales = renderer!.root.findAll((node) => node.type === "span" && node.props["data-slot"] === "preview-rail-tick");
    assert.ok(scales.every((tick) => JSON.parse(tick.props["data-motion-animate"]).scaleX === 0.25));
  });

  it("forms the official hover pyramid without selecting and clears after a pressed mouse leaves", async () => {
    let selected = 0;
    await mount({ onItemSelect: () => selected++ });
    await act(() => ticks()[2].props.onPointerEnter(pointer()));
    assert.equal(selected, 0);
    assert.equal(cards().length, 1);
    assert.equal(renderer!.root.findByProps({ "data-slot": "preview-rail-description" }).children.join(""), "<script>2</script>");
    const scales = renderer!.root.findAll((node) => node.type === "span" && node.props["data-slot"] === "preview-rail-tick")
      .map((tick) => JSON.parse(tick.props["data-motion-animate"]).scaleX);
    assert.deepEqual(scales, [0.44, 0.68, 1, 0.68, 0.44]);
    await act(() => nav().props.onPointerLeave(pointer("mouse", 1)));
    assert.equal(cards().length, 0);
  });

  it("previews keyboard focus, selects on native activation, and respects controlled activeId", async () => {
    const changes: string[] = [], selected: string[] = [];
    const props = { items, activeId: items[0].id, onActiveChange: (id: string) => changes.push(id), onItemSelect: (item: { id: string }) => selected.push(item.id) };
    await mount(props);
    await act(() => ticks()[3].props.onFocus({ currentTarget: { matches: (selector: string) => selector === ":focus-visible" } }));
    assert.equal(cards().length, 1);
    assert.deepEqual(changes, []);
    await act(() => { ticks()[3].props.onKeyDown(); ticks()[3].props.onClick({ preventDefault() {} }); });
    assert.deepEqual(changes, [items[3].id]);
    assert.deepEqual(selected, [items[3].id]);
    assert.equal(ticks()[0].props["aria-current"], "location");
    await act(() => renderer!.update(createElement(PreviewRail, { ...props, activeId: items[3].id })));
    assert.equal(ticks()[3].props["aria-current"], "location");
    await act(() => root().props.onBlur({ currentTarget: rootNode, relatedTarget: {} }));
    assert.equal(cards().length, 0);
  });

  it("pins touch selection through pointerleave, ignores inside taps, and passes an outside tap through", async () => {
    await mount();
    await act(() => {
      ticks()[1].props.onPointerEnter(pointer("touch", 1));
      ticks()[1].props.onPointerDown(pointer("touch", 1));
      ticks()[1].props.onClick({ preventDefault() {} });
    });
    assert.equal(ticks()[1].props["aria-current"], "location");
    assert.equal(cards().length, 1);
    await act(() => nav().props.onPointerLeave(pointer("touch")));
    assert.equal(cards().length, 1);
    await act(() => { fireWindow("pointerdown", rootNode); });
    assert.equal(cards().length, 1);
    let outside: Event;
    await act(() => { outside = fireWindow("pointerdown"); });
    assert.equal(outside!.defaultPrevented, false);
    assert.equal(cards().length, 0);
  });

  it("uses two taps for links, secures new tabs, and drops canceled or keyboard-replaced gestures", async () => {
    let selected = 0, prevented = 0;
    await mount({ items: [{ ...items[0], href: "/destination", target: "_blank" }], onItemSelect: () => selected++ });
    assert.equal(ticks()[0].type, "a");
    assert.equal(ticks()[0].props.rel, "noreferrer noopener");
    assert.equal(ticks()[0].props["aria-current"], "page");
    const tap = async () => act(() => {
      ticks()[0].props.onPointerDown(pointer("pen", 1));
      ticks()[0].props.onClick({ preventDefault() { prevented++; } });
    });
    await tap();
    assert.equal(prevented, 1); assert.equal(selected, 0);
    await tap();
    assert.equal(prevented, 1); assert.equal(selected, 1);
    await act(() => { fireWindow("keydown", {}, "Escape"); });
    assert.equal(cards().length, 0);
    for (const cancel of ["onPointerCancel", "onKeyDown"]) {
      await act(() => {
        ticks()[0].props.onPointerDown(pointer("touch", 1));
        ticks()[0].props[cancel]();
        ticks()[0].props.onClick({ preventDefault() { prevented++; } });
      });
      assert.equal(cards().length, 0);
    }
    assert.equal(prevented, 1); assert.equal(selected, 3);
  });

  it("honors reduced motion, active highlighting and optional horizontal/preview settings", async () => {
    motionOptions.reducedMotion = true;
    await mount({ highlightActive: true, defaultActiveId: items[2].id, orientation: "horizontal", itemSize: 30 });
    assert.equal(nav().props.style.gridTemplateColumns, "repeat(5, 30px)");
    const tick = renderer!.root.findAll((node) => node.type === "span" && node.props["data-slot"] === "preview-rail-tick")[2];
    assert.deepEqual(JSON.parse(tick.props["data-motion-animate"]), { scaleY: 1 });
    assert.deepEqual(JSON.parse(tick.props["data-motion-transition"]), { duration: 0 });
    assert.equal(cards().length, 0, "active highlighting alone does not open a preview");
    await act(() => ticks()[2].props.onPointerEnter(pointer()));
    assert.equal(cards().length, 1);
    const preview = renderer!.root.findAll((node) => node.type === "div" && node.props["data-motion-initial"])[0];
    assert.deepEqual(JSON.parse(preview.props["data-motion-initial"]), { opacity: 0 });
    assert.equal(JSON.parse(preview.props["data-motion-transition"]).duration, 0);
    await act(() => renderer!.update(createElement(PreviewRail, { items, showPreview: false })));
    assert.equal(cards().length, 0);
    assert.equal(ticks().length, 5);
  });

  it("does not interpret pen contact as hover and releases open dismissal scopes on unmount", async () => {
    await mount();
    await act(() => ticks()[2].props.onPointerEnter(pointer("pen", 1)));
    assert.equal(cards().length, 0);
    await act(() => {
      ticks()[2].props.onPointerDown(pointer("pen", 1));
      ticks()[2].props.onClick({ preventDefault() {} });
    });
    await act(() => nav().props.onPointerLeave(pointer("pen")));
    assert.equal(cards().length, 1);
    assert.equal(listeners.get("pointerdown")?.size, 1);
    await act(() => renderer!.unmount()); renderer = undefined;
    assert.equal(listeners.get("pointerdown")?.size, 0);
    assert.equal(listeners.get("keydown")?.size, 0);
  });
});
