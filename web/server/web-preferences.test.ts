import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWebPreferencesStore, webPreferences, type WebPreferencesEnvironment } from "../lib/web-preferences";
import { DEFAULT_WEB_PREFERENCES, WEB_PREFERENCES_KEY, decodeWebPreferences, parseWebPreferences } from "../shared/web-preferences";

function fixture(value: string | null = null) {
  const writes: string[] = [], themes: string[] = [];
  let storageListener: ((value: string | null) => void) | undefined;
  let denied = false, removed = 0;
  const environment: WebPreferencesEnvironment = {
    read: () => value,
    write: (next) => { if (denied) throw new Error("SECRET_STORAGE_FAILURE"); value = next; writes.push(next); },
    subscribe: (listener) => { storageListener = listener; return () => { removed += 1; storageListener = undefined; }; },
    applyTheme: (theme) => themes.push(theme),
  };
  const store = createWebPreferencesStore(environment);
  return { store, writes, themes, deny: () => { denied = true; }, allow: () => { denied = false; }, external: (next: string | null) => { value = next; storageListener?.(next); }, removed: () => removed };
}

describe("browser preference allowlist", () => {
  it("has one versioned namespaced key and field-wise compatibility defaults", () => {
    assert.equal(WEB_PREFERENCES_KEY, "kiva:web-preferences:v1");
    const decoded = decodeWebPreferences({
      version: 1,
      appearance: { theme: "dark", conversationFontSize: "18", wrapCode: true },
      conversation: { thinkingExpanded: true, toolsExpanded: "true", queueMode: "follow_up" },
      shortcuts: { sendMode: "invalid" },
    });
    assert.deepEqual(decoded.appearance, { theme: "dark", conversationFontSize: 14, wrapCode: true });
    assert.deepEqual(decoded.conversation, { thinkingExpanded: true, toolsExpanded: false, queueMode: "follow_up" });
    assert.deepEqual(decoded.shortcuts, DEFAULT_WEB_PREFERENCES.shortcuts);
  });

  it("recovers malformed/oversized/unknown-version input without changing valid neighbouring fields", () => {
    for (const value of [null, "", "{", "null", "[]", JSON.stringify({ version: 2, appearance: { theme: "dark" } }), " ".repeat(16_385)]) assert.equal(parseWebPreferences(value), DEFAULT_WEB_PREFERENCES);
    const decoded = parseWebPreferences(JSON.stringify({ version: 1, appearance: { theme: "<script>", conversationFontSize: 18 } }));
    assert.equal(decoded.appearance.theme, "system");
    assert.equal(decoded.appearance.conversationFontSize, 18);
  });

  it("drops all unknown fields and never persists secret/draft/server configuration fields", () => {
    const decoded = decodeWebPreferences({ ...DEFAULT_WEB_PREFERENCES,
      apiKey: "SECRET_KEY", draft: "SECRET_DRAFT", provider: { headers: "SECRET_HEADER" },
      appearance: { ...DEFAULT_WEB_PREFERENCES.appearance, password: "SECRET_PASSWORD" },
      shortcuts: { ...DEFAULT_WEB_PREFERENCES.shortcuts, bindings: { ...DEFAULT_WEB_PREFERENCES.shortcuts.bindings, evil: "SECRET_BINDING" } },
    });
    assert.doesNotMatch(JSON.stringify(decoded), /SECRET|apiKey|password|headers|draft|provider|evil/);
    assert.ok(Object.isFrozen(decoded));
    assert.ok(Object.isFrozen(decoded.appearance));
    assert.ok(Object.isFrozen(decoded.shortcuts.bindings.newSession));
  });

  it("falls back conflicted/protected binding fields without losing other preferences or valid swaps", () => {
    const decoded = decodeWebPreferences({ ...DEFAULT_WEB_PREFERENCES,
      shortcuts: { sendMode: "mod-enter", bindings: { newSession: { key: "k", mod: true, shift: false, alt: false }, openSettings: { key: "r", mod: true, shift: false, alt: false }, focusComposer: null } },
    });
    assert.equal(decoded.shortcuts.sendMode, "mod-enter");
    assert.deepEqual(decoded.shortcuts.bindings, DEFAULT_WEB_PREFERENCES.shortcuts.bindings);
    const swapped = decodeWebPreferences({ ...DEFAULT_WEB_PREFERENCES, shortcuts: { bindings: { newSession: DEFAULT_WEB_PREFERENCES.shortcuts.bindings.openCommands, openCommands: DEFAULT_WEB_PREFERENCES.shortcuts.bindings.newSession } } });
    assert.equal(swapped.shortcuts.bindings.newSession?.key, "k");
    assert.equal(swapped.shortcuts.bindings.openCommands?.key, "n");
  });
});

describe("browser preference store", () => {
  it("initializes exactly once without writing, provides immutable stable snapshots and shares subscribers", () => {
    const current = fixture(JSON.stringify({ ...DEFAULT_WEB_PREFERENCES, appearance: { theme: "light", conversationFontSize: 16, wrapCode: true } }));
    const first = current.store.getSnapshot();
    assert.equal(current.store.getSnapshot(), first);
    assert.ok(Object.isFrozen(first));
    assert.equal(first.preferences.appearance.theme, "light");
    assert.deepEqual(current.writes, []);
    assert.deepEqual(current.themes, ["light"]);
    let notifications = 0;
    const unsubscribe = current.store.subscribe(() => { notifications += 1; });
    current.store.update("appearance", { theme: "dark" });
    assert.equal(notifications, 1);
    const second = current.store.getSnapshot();
    assert.notEqual(second, first);
    assert.equal(first.preferences.appearance.theme, "light");
    current.store.update("appearance", { theme: "dark" });
    assert.equal(current.store.getSnapshot(), second);
    assert.equal(notifications, 1);
    unsubscribe();
    current.store.update("appearance", { theme: "system" });
    assert.equal(notifications, 1);
    current.store.destroy();
    assert.equal(current.removed(), 1);
  });

  it("persists validated changes, merges bindings and resets only the selected group", () => {
    const { store, writes } = fixture();
    store.update("appearance", { theme: "dark", conversationFontSize: 18 });
    store.update("conversation", { toolsExpanded: true, queueMode: "follow_up" });
    store.update("shortcuts", { bindings: { focusComposer: { key: "g", mod: true, alt: true, shift: false } } });
    assert.equal(store.getSnapshot().preferences.shortcuts.bindings.newSession?.key, "n");
    store.resetGroup("appearance");
    assert.deepEqual(store.getSnapshot().preferences.appearance, DEFAULT_WEB_PREFERENCES.appearance);
    assert.equal(store.getSnapshot().preferences.conversation.toolsExpanded, true);
    assert.equal(store.getSnapshot().preferences.shortcuts.bindings.focusComposer?.key, "g");
    assert.deepEqual(JSON.parse(writes.at(-1)!), store.getSnapshot().preferences);
    store.destroy();
  });

  it("retains in-memory choices with sanitized warning on denied writes and recovers on retry", () => {
    const current = fixture();
    current.deny();
    current.store.update("appearance", { theme: "dark" });
    assert.equal(current.store.getSnapshot().preferences.appearance.theme, "dark");
    assert.match(current.store.getSnapshot().persistenceError ?? "", /未能保存/);
    assert.doesNotMatch(JSON.stringify(current.store.getSnapshot()), /SECRET_STORAGE_FAILURE/);
    assert.deepEqual(current.themes, ["system", "dark"]);
    current.allow();
    current.store.update("appearance", { theme: "dark" });
    assert.equal(current.store.getSnapshot().persistenceError, null);
    assert.equal(current.writes.length, 1);
    current.store.destroy();
  });

  it("handles denied reads without overwriting storage during initialization", () => {
    let writes = 0;
    const store = createWebPreferencesStore({ read: () => { throw new Error("SECRET_READ"); }, write: () => { writes += 1; }, subscribe: () => () => {}, applyTheme: () => {} });
    assert.equal(store.getSnapshot().preferences, DEFAULT_WEB_PREFERENCES);
    assert.match(store.getSnapshot().persistenceError ?? "", /当前选择/);
    assert.doesNotMatch(store.getSnapshot().persistenceError ?? "", /SECRET_READ/);
    assert.equal(writes, 0);
    store.destroy();
  });

  it("updates from sibling tabs/deletion without a write loop and keeps stable unchanged snapshots", () => {
    const current = fixture();
    let notifications = 0;
    current.store.subscribe(() => { notifications += 1; });
    const saved = JSON.stringify({ ...DEFAULT_WEB_PREFERENCES, appearance: { theme: "dark", conversationFontSize: 16, wrapCode: true } });
    current.external(saved);
    const snapshot = current.store.getSnapshot();
    assert.equal(snapshot.preferences.appearance.theme, "dark");
    current.external(saved);
    assert.equal(current.store.getSnapshot(), snapshot);
    assert.equal(notifications, 1);
    current.external("malformed");
    assert.deepEqual(current.store.getSnapshot().preferences, DEFAULT_WEB_PREFERENCES);
    current.external(null);
    assert.equal(notifications, 2);
    assert.deepEqual(current.writes, []);
    current.store.destroy();
  });

  it("does not initialize on the server before a browser environment becomes available", () => {
    let environment: WebPreferencesEnvironment | undefined;
    const store = createWebPreferencesStore(() => environment);
    assert.equal(store.getSnapshot(), store.getServerSnapshot());
    environment = { read: () => JSON.stringify({ ...DEFAULT_WEB_PREFERENCES, appearance: { theme: "dark" } }), write: () => {}, subscribe: () => () => {}, applyTheme: () => {} };
    assert.equal(store.getSnapshot().preferences.appearance.theme, "dark");
    assert.equal(store.getServerSnapshot().preferences.appearance.theme, "system");
    store.destroy();
  });

  it("keeps the browser singleton usable in window-only rendering environments", () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    let writes = 0, added = 0, removed = 0;
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      localStorage: { getItem: () => null, setItem: () => { writes += 1; } },
      addEventListener: () => { added += 1; }, removeEventListener: () => { removed += 1; },
    } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });
    try {
      assert.doesNotThrow(() => webPreferences.getSnapshot());
      webPreferences.update("appearance", { theme: "dark" });
      assert.equal(webPreferences.getSnapshot().preferences.appearance.theme, "dark");
      assert.equal(writes, 1);
      assert.equal(added, 1);
    } finally {
      webPreferences.destroy();
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
    }
    assert.equal(removed, 1);
  });
});
