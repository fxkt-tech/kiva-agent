import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createShortcutRegistry, formatShortcutBinding, getSendShortcutHint, shortcutBindingFromEvent, shouldSendFromKeydown, validateShortcutBinding, type ShortcutKeyboardEvent } from "../lib/shortcuts";
import { DEFAULT_WEB_PREFERENCES, type ShortcutBinding } from "../shared/web-preferences";

function event(patch: Partial<ShortcutKeyboardEvent> = {}) {
  let prevented = false;
  return { key: "n", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...patch, preventDefault: () => { prevented = true; }, prevented: () => prevented };
}
const binding = (key: string, patch: Partial<ShortcutBinding> = {}): ShortcutBinding => ({ key, mod: true, alt: false, shift: false, ...patch });

describe("portable shortcut matching and validation", () => {
  it("normalizes case and platform modifiers, ignoring pure modifiers/opposite platform/IME", () => {
    assert.deepEqual(shortcutBindingFromEvent(event({ key: "K" }), "Windows"), binding("k"));
    assert.deepEqual(shortcutBindingFromEvent(event({ key: ",", ctrlKey: false, metaKey: true }), "MacIntel"), binding(","));
    assert.equal(shortcutBindingFromEvent(event({ key: "Control" }), "Windows"), null);
    assert.equal(shortcutBindingFromEvent(event({ key: "k", ctrlKey: false, metaKey: true }), "Windows"), null);
    assert.equal(shortcutBindingFromEvent(event({ key: "k", metaKey: true }), "MacIntel"), null);
    assert.equal(shortcutBindingFromEvent(event({ key: "k", isComposing: true }), "Windows"), null);
    assert.equal(shortcutBindingFromEvent(event({ key: "k", nativeEvent: { keyCode: 229 } }), "Windows"), null);
    assert.equal(shortcutBindingFromEvent(event({ key: "k", ctrlKey: false }), "Windows"), null);
  });

  it("formats actual platform labels without storing platform-specific keys", () => {
    assert.equal(formatShortcutBinding(binding("k"), "MacIntel"), "Command+K");
    assert.equal(formatShortcutBinding(binding("g", { alt: true, shift: true }), "Windows"), "Ctrl+Alt+Shift+G");
    assert.equal(formatShortcutBinding(binding(","), "MacIntel"), "Command+,");
    assert.equal(formatShortcutBinding(null, "Windows"), "未设置");
  });

  it("matches shifted punctuation and macOS Option characters through their physical key", () => {
    assert.deepEqual(shortcutBindingFromEvent(event({ key: "<", code: "Comma", shiftKey: true }), "Windows"), binding(",", { shift: true }));
    assert.deepEqual(shortcutBindingFromEvent(event({ key: "˚", code: "KeyK", ctrlKey: false, metaKey: true, altKey: true }), "MacIntel"), binding("k", { alt: true }));
    assert.deepEqual(shortcutBindingFromEvent(event({ key: "¡", code: "Digit1", ctrlKey: false, altKey: true }), "MacIntel"), binding("1", { mod: false, alt: true }));
    assert.equal(shortcutBindingFromEvent(event({ key: "Dead", code: "KeyE", ctrlKey: false, altKey: true }), "MacIntel"), null);
    assert.equal(shortcutBindingFromEvent(event({ key: "Enter", code: "Enter", altKey: true }), "Windows"), null);
    assert.equal(shortcutBindingFromEvent(event({ key: "˚", code: "KeyK", ctrlKey: false, metaKey: true, altKey: true, isComposing: true }), "MacIntel"), null);
    const registry = createShortcutRegistry({ getBindings: () => ({ ...DEFAULT_WEB_PREFERENCES.shortcuts.bindings, openSettings: binding(",", { shift: true }) }), platform: "Windows" });
    let runs = 0;
    registry.register("openSettings", { run: () => { runs += 1; } });
    assert.equal(registry.dispatch(event({ key: "<", code: "Comma", shiftKey: true })), true);
    assert.equal(runs, 1);
  });

  it("rejects protected/browser/OS and duplicate combinations while allowing clear/default/reset", () => {
    const shortcuts = DEFAULT_WEB_PREFERENCES.shortcuts;
    assert.equal(validateShortcutBinding("newSession", binding("n"), shortcuts), null);
    assert.equal(validateShortcutBinding("openCommands", binding("k"), shortcuts), null);
    assert.equal(validateShortcutBinding("focusComposer", null, shortcuts), null);
    assert.match(validateShortcutBinding("focusComposer", binding("n"), shortcuts) ?? "", /其他操作/);
    for (const key of ["r", "w", "t", "l", "q", "c", "v", "1"]) assert.match(validateShortcutBinding("focusComposer", binding(key), shortcuts) ?? "", /保留/);
    for (const key of ["f4", "f5", "f6"]) assert.match(validateShortcutBinding("focusComposer", binding(key), shortcuts) ?? "", /保留/);
    for (const key of ["i", "j", "c", "d", "h", "m", "l"]) assert.match(validateShortcutBinding("focusComposer", binding(key, { alt: true }), shortcuts) ?? "", /保留/);
    assert.match(validateShortcutBinding("focusComposer", binding("f4", { mod: false, alt: true }), shortcuts) ?? "", /保留/);
    assert.match(validateShortcutBinding("focusComposer", binding("n", { shift: true }), shortcuts) ?? "", /保留/);
    assert.match(validateShortcutBinding("focusComposer", binding("g", { mod: false }), shortcuts) ?? "", /单个组合键/);
    assert.match(validateShortcutBinding("focusComposer", binding("Escape"), shortcuts) ?? "", /单个组合键/);
    assert.equal(validateShortcutBinding("focusComposer", binding("g", { alt: true }), shortcuts), null);
  });

  it("supports both native textarea send modes and leaves newline/IME/repeat/other modifiers untouched", () => {
    const enter = event({ key: "Enter", ctrlKey: false });
    assert.equal(shouldSendFromKeydown(enter, "enter", false, "Windows"), true);
    assert.equal(shouldSendFromKeydown(enter, "mod-enter", false, "Windows"), false);
    assert.equal(shouldSendFromKeydown(event({ key: "Enter" }), "mod-enter", false, "Windows"), true);
    assert.equal(shouldSendFromKeydown(event({ key: "Enter", ctrlKey: false, metaKey: true }), "mod-enter", false, "MacIntel"), true);
    for (const patch of [{ shiftKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { nativeEvent: { isComposing: true } }, { nativeEvent: { keyCode: 229 } }, { defaultPrevented: true }]) {
      assert.equal(shouldSendFromKeydown(event({ key: "Enter", ctrlKey: false, ...patch }), "enter", false, "Windows"), false);
      assert.equal(shouldSendFromKeydown(event({ key: "Enter", ...patch }), "mod-enter", false, "Windows"), false);
    }
    assert.equal(shouldSendFromKeydown(enter, "enter", true), false);
    assert.equal(shouldSendFromKeydown(event({ key: "Enter", metaKey: true }), "mod-enter", false, "Windows"), false);
    assert.equal(shouldSendFromKeydown(event({ key: "Enter" }), "enter", false, "Windows"), false);
    assert.equal(getSendShortcutHint("enter", "Windows"), "Enter 发送 · Shift+Enter 换行");
    assert.equal(getSendShortcutHint("mod-enter", "MacIntel"), "Command+Enter 发送 · Enter 换行");
  });
});

describe("single scoped shortcut dispatcher", () => {
  it("reads current bindings and availability without recreating the dispatcher", () => {
    let bindings = DEFAULT_WEB_PREFERENCES.shortcuts.bindings;
    let available = false, runs = 0;
    const registry = createShortcutRegistry({ getBindings: () => bindings, platform: "Windows" });
    const cleanup = registry.register("newSession", { run: () => { runs += 1; }, available: () => available });
    assert.equal(registry.dispatch(event()), false);
    assert.equal(runs, 0);
    available = true;
    const original = event();
    assert.equal(registry.dispatch(original), true);
    assert.equal(original.prevented(), true);
    bindings = { ...bindings, newSession: binding("g", { alt: true }) };
    assert.equal(registry.dispatch(event()), false);
    assert.equal(registry.dispatch(event({ key: "g", altKey: true })), true);
    cleanup();
    assert.equal(registry.dispatch(event({ key: "g", altKey: true })), false);
    assert.equal(runs, 2);
  });

  it("gives modal/recording scopes priority and never executes repeated/composing/handled input", () => {
    let modal = false, runs = 0;
    const registry = createShortcutRegistry({ getBindings: () => DEFAULT_WEB_PREFERENCES.shortcuts.bindings, platform: "Windows", isModalOpen: () => modal });
    registry.register("newSession", { run: () => { runs += 1; } });
    const stopSettings = registry.block("settings"), stopRecorder = registry.block("recording");
    assert.equal(registry.dispatch(event()), false);
    stopSettings();
    assert.equal(registry.dispatch(event()), false);
    stopRecorder();
    modal = true;
    assert.equal(registry.dispatch(event()), false);
    modal = false;
    for (const patch of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { nativeEvent: { isComposing: true } }, { defaultPrevented: true }, { key: "Escape" }]) assert.equal(registry.dispatch(event(patch)), false);
    assert.equal(registry.dispatch(event()), true);
    assert.equal(runs, 1);
  });

  it("uses the newest scoped action registration and cleanup never removes another owner", () => {
    const calls: string[] = [];
    const registry = createShortcutRegistry({ getBindings: () => DEFAULT_WEB_PREFERENCES.shortcuts.bindings, platform: "Windows" });
    const oldCleanup = registry.register("newSession", { run: () => { calls.push("old"); } });
    const newCleanup = registry.register("newSession", { run: () => { calls.push("new"); } });
    registry.dispatch(event());
    oldCleanup();
    registry.dispatch(event());
    newCleanup();
    assert.equal(registry.dispatch(event()), false);
    assert.deepEqual(calls, ["new", "new"]);
    const finalCleanup = registry.register("newSession", { run: () => { calls.push("final"); } });
    oldCleanup(); newCleanup();
    assert.equal(registry.dispatch(event()), true);
    assert.equal(calls.at(-1), "final");
    finalCleanup();
  });

  it("detects actual modal/recorder DOM ownership before dispatching app actions", () => {
    let runs = 0;
    const registry = createShortcutRegistry({ getBindings: () => DEFAULT_WEB_PREFERENCES.shortcuts.bindings, platform: "Windows" });
    registry.register("newSession", { run: () => { runs += 1; } });
    const recorder = Object.assign(new EventTarget(), { closest: (selector: string) => { assert.equal(selector, "[data-shortcut-recorder]"); return {}; } });
    assert.equal(registry.dispatch(event({ target: recorder })), false);
    const modal = Object.assign(new EventTarget(), { ownerDocument: { querySelector: (selector: string) => { assert.equal(selector, '[role="dialog"][aria-modal="true"]'); return {}; } } });
    assert.equal(registry.dispatch(event({ target: modal })), false);
    assert.equal(runs, 0);
    assert.equal(registry.dispatch(event()), true);
  });

  it("attaches only one listener per target and supports idempotent scoped teardown", () => {
    const registry = createShortcutRegistry({ getBindings: () => DEFAULT_WEB_PREFERENCES.shortcuts.bindings });
    let added = 0, removed = 0;
    const target = { addEventListener: () => { added += 1; }, removeEventListener: () => { removed += 1; } };
    const first = registry.attach(target), second = registry.attach(target);
    assert.equal(added, 1);
    first(); first();
    assert.equal(removed, 0);
    second();
    assert.equal(removed, 1);
  });
});
