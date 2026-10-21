import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Toast } from "../components/ui/toast";

describe("transient success Toast", () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
  afterEach(async () => { if (renderer) await act(() => renderer!.unmount()); renderer = undefined; });

  it("announces one concise message politely and offers labelled dismissal without moving focus", async () => {
    let dismissed = 0;
    await act(() => { renderer = create(createElement(Toast, { message: "模型设置已保存", onDismiss() { dismissed++; } })); });
    const toast = renderer!.root.findByProps({ "data-slot": "toast" });
    assert.equal(toast.props.role, "status");
    assert.equal(toast.props["aria-live"], "polite");
    assert.equal(toast.props["aria-atomic"], "true");
    assert.equal(renderer!.root.findByProps({ className: "toast-message" }).children.join(""), "模型设置已保存");
    assert.equal(renderer!.root.findByProps({ className: "toast-icon" }).props["aria-hidden"], "true");
    assert.equal(renderer!.root.findAll((node) => node.props.autoFocus).length, 0);
    await act(() => renderer!.root.findByProps({ "aria-label": "关闭提示：模型设置已保存" }).props.onClick());
    assert.equal(dismissed, 1);
  });

  it("expires after four seconds despite parent rerenders and uses the latest dismissal callback", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    let original = 0, latest = 0;
    await act(() => { renderer = create(createElement(Toast, { message: "已保存", onDismiss() { original++; } })); });
    await act(() => context.mock.timers.tick(2_000));
    await act(() => renderer!.update(createElement(Toast, { message: "已保存", onDismiss() { latest++; } })));
    await act(() => context.mock.timers.tick(1_999));
    assert.equal(latest, 0);
    await act(() => context.mock.timers.tick(1));
    assert.equal(original, 0); assert.equal(latest, 1);
  });

  it("pauses for either hover or keyboard focus and resumes only when both leave", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    let dismissed = 0;
    await act(() => { renderer = create(createElement(Toast, { message: "已保存", onDismiss() { dismissed++; } })); });
    const toast = renderer!.root.findByProps({ "data-slot": "toast" });
    await act(() => context.mock.timers.tick(2_000));
    await act(() => toast.props.onMouseEnter());
    await act(() => context.mock.timers.tick(10_000));
    await act(() => toast.props.onFocus());
    await act(() => toast.props.onMouseLeave());
    await act(() => context.mock.timers.tick(10_000));
    assert.equal(dismissed, 0);
    await act(() => toast.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null }));
    await act(() => context.mock.timers.tick(1_999));
    assert.equal(dismissed, 0);
    await act(() => context.mock.timers.tick(1));
    assert.equal(dismissed, 1);
  });

  it("restarts for a newly confirmed save and clears its timer on unmount", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    let dismissed = 0;
    const onDismiss = () => { dismissed++; };
    await act(() => { renderer = create(createElement(Toast, { key: 1, message: "已保存", onDismiss })); });
    await act(() => context.mock.timers.tick(3_000));
    await act(() => renderer!.update(createElement(Toast, { key: 2, message: "已保存", onDismiss })));
    await act(() => context.mock.timers.tick(3_000));
    assert.equal(dismissed, 0);
    await act(() => renderer!.unmount()); renderer = undefined;
    await act(() => context.mock.timers.tick(10_000));
    assert.equal(dismissed, 0);
  });
});
