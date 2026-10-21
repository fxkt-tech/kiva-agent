import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useStreamingText } from "../lib/use-streaming-text";

describe("streaming Markdown display", () => {
  let renderer: ReactTestRenderer | undefined;
  let previous: PropertyDescriptor | undefined;
  function Harness({ text, streaming = true }: { text: string; streaming?: boolean }) {
    return createElement("span", null, useStreamingText(text, streaming));
  }
  const displayed = () => renderer!.root.findByType("span").children.join("");
  beforeEach(() => {
    previous = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount());
    renderer = undefined;
    if (previous) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previous);
    else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  });

  it("renders initial history immediately and combines continuous deltas without postponing the display deadline", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    await act(() => { renderer = create(createElement(Harness, { text: "Initial history" })); });
    assert.equal(displayed(), "Initial history");
    await act(() => renderer!.update(createElement(Harness, { text: "First delta" })));
    await act(() => context.mock.timers.tick(40));
    await act(() => renderer!.update(createElement(Harness, { text: "First delta + latest delta" })));
    assert.equal(displayed(), "Initial history");
    await act(() => context.mock.timers.tick(40));
    assert.equal(displayed(), "First delta + latest delta");
    await act(() => renderer!.update(createElement(Harness, { text: "Next batch" })));
    await act(() => context.mock.timers.tick(80));
    assert.equal(displayed(), "Next batch");
  });

  it("shows final content immediately and never replaces it with an older pending batch", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    await act(() => { renderer = create(createElement(Harness, { text: "Initial" })); });
    await act(() => renderer!.update(createElement(Harness, { text: "Pending" })));
    await act(() => renderer!.update(createElement(Harness, { text: "Complete answer", streaming: false })));
    assert.equal(displayed(), "Complete answer");
    await act(() => context.mock.timers.tick(500));
    assert.equal(displayed(), "Complete answer");
    await act(() => renderer!.update(createElement(Harness, { text: "Refreshed history", streaming: false })));
    assert.equal(displayed(), "Refreshed history");
  });

  it("drops pending display work when the message unmounts and starts a new message with its own text", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    await act(() => { renderer = create(createElement(Harness, { key: "old", text: "Old message" })); });
    await act(() => renderer!.update(createElement(Harness, { key: "old", text: "Old pending text" })));
    await act(() => renderer!.update(createElement(Harness, { key: "new", text: "New message" })));
    await act(() => context.mock.timers.tick(500));
    assert.equal(displayed(), "New message");
  });
});
