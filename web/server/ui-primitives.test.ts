import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Children, createElement, createRef, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Combobox } from "../components/ui/combobox";
import { Dialog, DialogContent, DialogPortal, DialogTrigger } from "../components/ui/dialog";
import { Select } from "../components/ui/select";
import { Switch } from "../components/ui/switch";

describe("shared UI primitive contracts", () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
  afterEach(async () => { if (renderer) await act(() => renderer!.unmount()); renderer = undefined; });

  it("renders scalar labels and native form values while forwarding field identity, errors and disabled state", () => {
    const html = renderToStaticMarkup(createElement(Select<number>, {
      id: "effort", name: "effort", value: 0, options: [{ value: 0, label: "关闭 <reasoning>" }],
      onValueChange() {}, disabled: true, "aria-label": "思考强度", "aria-invalid": true, "aria-describedby": "effort-error",
    }));
    assert.match(html, /id="effort"/);
    assert.match(html, /role="combobox"/);
    assert.match(html, /aria-label="思考强度"/);
    assert.match(html, /aria-invalid="true"/);
    assert.match(html, /aria-describedby="effort-error"/);
    assert.match(html, /disabled=""/);
    assert.match(html, /关闭 &lt;reasoning&gt;/);
    assert.match(html, /name="effort" value="0"/);
    const empty = renderToStaticMarkup(createElement(Select<string>, { value: null, options: [], onValueChange() {}, placeholder: "选择模型" }));
    assert.match(empty, /选择模型/);
  });

  it("maps searchable option objects back to scalar values, including zero and explicit clearing", async () => {
    const changes: Array<number | null> = [];
    const options = [{ value: 0, label: "Zero" }, { value: 1, label: "One" }];
    await act(() => { renderer = create(createElement(Combobox<number>, { label: "模型", value: 1, options, onValueChange: (value) => changes.push(value) })); });
    const root = renderer!.root.findByType(BaseCombobox.Root);
    assert.equal(root.props.value, options[1]);
    root.props.onValueChange(options[0], {});
    root.props.onValueChange(null, {});
    assert.deepEqual(changes, [0, null]);
  });

  it("keeps a scalar selection stable across equivalent option reloads while accepting changed labels and values", async () => {
    const options: Array<{ value: number; label: string; disabled?: boolean }> = [{ value: 0, label: "Zero" }, { value: 1, label: "One" }];
    const render = (value: number | null, items: typeof options) => createElement(Combobox<number>, { label: "模型", value, options: items, onValueChange() {} });
    await act(() => { renderer = create(render(1, options)); });
    const selected = renderer!.root.findByType(BaseCombobox.Root).props.value;
    await act(() => renderer!.update(render(1, options.map((option) => ({ ...option })))));
    assert.equal(renderer!.root.findByType(BaseCombobox.Root).props.value, selected, "an unrelated parent render must not reset a search query");
    await act(() => renderer!.update(render(1, [{ value: 0, label: "Zero" }, { value: 1, label: "Renamed one" }])));
    assert.equal(renderer!.root.findByType(BaseCombobox.Root).props.value.label, "Renamed one");
    await act(() => renderer!.update(render(1, [{ value: 1, label: "Renamed one", disabled: true }])));
    assert.equal(renderer!.root.findByType(BaseCombobox.Root).props.value.disabled, true);
    await act(() => renderer!.update(render(0, options)));
    assert.equal(renderer!.root.findByType(BaseCombobox.Root).props.value.value, 0);
    await act(() => renderer!.update(render(null, options)));
    assert.equal(renderer!.root.findByType(BaseCombobox.Root).props.value, null);
  });

  it("preserves a non-clearable selection and its visible label when Escape should dismiss its owner", async () => {
    let changes = 0;
    await act(() => { renderer = create(createElement(Combobox<string>, {
      label: "模型", value: "model", options: [{ value: "model", label: "Selected model" }], clearable: false,
      onValueChange() { changes++; },
    })); });
    const root = renderer!.root.findByType(BaseCombobox.Root);
    function details() {
      return { reason: "escape-key", isCanceled: false, isPropagationAllowed: false,
        cancel() { this.isCanceled = true; }, allowPropagation() { this.isPropagationAllowed = true; } };
    }
    const inputChange = details();
    root.props.onInputValueChange("", inputChange);
    assert.equal(inputChange.isCanceled, true, "cancel before Base UI clears the input text");
    assert.equal(inputChange.isPropagationAllowed, true);
    const selectionChange = details();
    root.props.onValueChange(null, selectionChange);
    assert.equal(selectionChange.isCanceled, true);
    assert.equal(selectionChange.isPropagationAllowed, true, "the closed field must let its hosting dialog receive Escape");
    assert.equal(changes, 0);
  });

  it("forwards dialog focus/ARIA/ref props and layers a nested list above the hosting dialog", async () => {
    const initialFocus = createRef<HTMLElement>(), finalFocus = () => false, ref = createRef<HTMLDivElement>();
    await act(() => { renderer = create(createElement(Dialog, { open: false },
      createElement(DialogContent, { initialFocus, finalFocus, ref, "aria-labelledby": "custom-title", showCloseButton: false }),
      createElement(Combobox<string>, { label: "模型", value: "one", options: [{ value: "one", label: "One" }], onValueChange() {} }),
    )); });
    const dialogChildren = Children.toArray(renderer!.root.findByType(DialogPortal).props.children);
    const popup = dialogChildren.find((child) => isValidElement(child) && child.type === BaseDialog.Popup);
    assert.ok(isValidElement<Record<string, unknown>>(popup));
    assert.equal(popup.props.initialFocus, initialFocus);
    assert.equal(popup.props.finalFocus, finalFocus);
    assert.equal(popup.props.ref, ref);
    assert.equal(popup.props["aria-labelledby"], "custom-title");
    const positioner = renderer!.root.findByType(BaseCombobox.Portal).props.children;
    assert.ok(positioner.props.style.zIndex > (popup.props.style as { zIndex: number }).zIndex);
  });

  it("composes Base UI render, Button asChild and both external refs onto the final native button", async () => {
    class ButtonNode { tagName = "BUTTON"; ownerDocument = { defaultView: { HTMLElement: ButtonNode } }; }
    const previous = new Map(["document", "window", "HTMLElement"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const node = new ButtonNode();
    const triggerRef = createRef<HTMLButtonElement>(), childRef = createRef<HTMLButtonElement>();
    try {
      // Base UI intentionally omits merged refs during server rendering.
      Object.assign(globalThis, { document: {}, window: { HTMLElement: ButtonNode }, HTMLElement: ButtonNode });
      await act(() => { renderer = create(createElement(Dialog, { open: false }, createElement(DialogTrigger, {
        ref: triggerRef, render: createElement(Button, { asChild: true }, createElement("button", { ref: childRef }, "打开")),
      })), { createNodeMock: () => node }); });
      assert.equal(triggerRef.current, node);
      assert.equal(childRef.current, node);
      assert.equal(renderer!.root.findAllByType("button").length, 1);
      assert.equal(renderer!.root.findByType("button").props["aria-haspopup"], "dialog");
      await act(() => renderer!.unmount()); renderer = undefined;
      assert.equal(triggerRef.current, null);
      assert.equal(childRef.current, null);
    } finally {
      if (renderer) { await act(() => renderer!.unmount()); renderer = undefined; }
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });

  it("announces controlled switch and checkbox state with their caller's accessible labels", () => {
    const switchHtml = renderToStaticMarkup(createElement(Switch, { checked: true, "aria-label": "代码换行", disabled: true }));
    assert.match(switchHtml, /role="switch"/);
    assert.match(switchHtml, /aria-checked="true"/);
    assert.match(switchHtml, /aria-label="代码换行"/);
    const checkboxHtml = renderToStaticMarkup(createElement(Checkbox, { checked: false, "aria-label": "删除工作区" }));
    assert.match(checkboxHtml, /role="checkbox"/);
    assert.match(checkboxHtml, /aria-checked="false"/);
    assert.match(checkboxHtml, /aria-label="删除工作区"/);
  });
});
