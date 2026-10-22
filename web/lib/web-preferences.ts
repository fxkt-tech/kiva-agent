"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_WEB_PREFERENCES, WEB_PREFERENCES_KEY, decodeWebPreferences, normalizeVisualStylePreference, parseWebPreferences, type PreferenceGroup, type PreferencePatch, type WebPreferences } from "../shared/web-preferences";

export interface WebPreferencesSnapshot {
  readonly preferences: WebPreferences;
  readonly persistenceError: string | null;
}

export interface WebPreferencesEnvironment {
  read(): string | null;
  write(value: string): void;
  subscribe(listener: (value: string | null) => void): () => void;
  applyAppearance(appearance: WebPreferences["appearance"]): void;
}

const STORAGE_WARNING = "浏览器未能保存设置；当前选择仅在此页面生效。";
const serverSnapshot: WebPreferencesSnapshot = Object.freeze({ preferences: DEFAULT_WEB_PREFERENCES, persistenceError: null });

export function applyAppearancePreference(root: Pick<HTMLElement, "setAttribute" | "removeAttribute">, { theme, visualStyle }: Pick<WebPreferences["appearance"], "theme" | "visualStyle">) {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  const style = normalizeVisualStylePreference(visualStyle);
  if (style === "flat") root.removeAttribute("data-visual-style");
  else root.setAttribute("data-visual-style", style);
}

/** One store owns both persisted and session-local choices, never drafts or server settings. */
export function createWebPreferencesStore(resolveEnvironment: (() => WebPreferencesEnvironment | undefined) | WebPreferencesEnvironment) {
  const listeners = new Set<() => void>();
  let snapshot = serverSnapshot;
  let environment: WebPreferencesEnvironment | undefined;
  let unsubscribeStorage: (() => void) | undefined;
  let initialized = false;

  const notify = () => { for (const listener of listeners) listener(); };
  const replace = (preferences: WebPreferences, persistenceError: string | null) => {
    if (JSON.stringify(preferences) === JSON.stringify(snapshot.preferences) && persistenceError === snapshot.persistenceError) return false;
    snapshot = Object.freeze({ preferences, persistenceError });
    return true;
  };
  const initialize = () => {
    if (initialized) return;
    environment = typeof resolveEnvironment === "function" ? resolveEnvironment() : resolveEnvironment;
    // Server rendering must not permanently initialize the browser singleton.
    if (!environment) return;
    initialized = true;
    try { replace(parseWebPreferences(environment.read()), null); }
    catch { replace(snapshot.preferences, STORAGE_WARNING); }
    environment.applyAppearance(snapshot.preferences.appearance);
    unsubscribeStorage = environment.subscribe((value) => {
      const changed = replace(parseWebPreferences(value), null);
      environment?.applyAppearance(snapshot.preferences.appearance);
      if (changed) notify();
    });
  };
  const persist = (candidate: unknown) => {
    initialize();
    const preferences = decodeWebPreferences(candidate);
    let persistenceError: string | null = null;
    try {
      if (!environment) throw new Error("Browser unavailable");
      environment.write(JSON.stringify(preferences));
    } catch { persistenceError = STORAGE_WARNING; }
    const changed = replace(preferences, persistenceError);
    environment?.applyAppearance(preferences.appearance);
    if (changed) notify();
  };
  return {
    getSnapshot: () => { initialize(); return snapshot; },
    getServerSnapshot: () => serverSnapshot,
    subscribe: (listener: () => void) => {
      initialize();
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update: <G extends PreferenceGroup>(group: G, patch: PreferencePatch<G>) => {
      initialize();
      const current = snapshot.preferences;
      const groupValue = group === "shortcuts"
        ? { ...current.shortcuts, ...patch, bindings: { ...current.shortcuts.bindings, ...(patch as PreferencePatch<"shortcuts">).bindings } }
        : { ...current[group], ...patch };
      persist({ ...current, [group]: groupValue });
    },
    resetGroup: (group: PreferenceGroup) => {
      initialize();
      persist({ ...snapshot.preferences, [group]: DEFAULT_WEB_PREFERENCES[group] });
    },
    destroy: () => {
      unsubscribeStorage?.();
      unsubscribeStorage = undefined;
      initialized = false;
      environment = undefined;
      listeners.clear();
    },
  };
}

function browserEnvironment(): WebPreferencesEnvironment | undefined {
  if (typeof window === "undefined") return undefined;
  return {
    read: () => window.localStorage.getItem(WEB_PREFERENCES_KEY),
    write: (value) => window.localStorage.setItem(WEB_PREFERENCES_KEY, value),
    subscribe: (listener) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== WEB_PREFERENCES_KEY && event.key !== null) return;
        try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
        listener(event.newValue);
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    applyAppearance: (appearance) => { if (typeof document !== "undefined") applyAppearancePreference(document.documentElement, appearance); },
  };
}

export const webPreferences = createWebPreferencesStore(browserEnvironment);
export function useWebPreferences(): WebPreferencesSnapshot {
  return useSyncExternalStore(webPreferences.subscribe, webPreferences.getSnapshot, webPreferences.getServerSnapshot);
}
