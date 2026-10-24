import { DEFAULT_SESSION_WORKSPACE_MODE, isSessionWorkspaceMode, type SessionWorkspaceMode } from "./workspace-contract";

export const WEB_PREFERENCES_KEY = "kiva:web-preferences:v1";
export const WEB_PREFERENCES_MAX_LENGTH = 16_384;
export const SHORTCUT_ACTIONS = ["newSession", "openCommands", "focusComposer", "openSettings"] as const;
export type ShortcutAction = typeof SHORTCUT_ACTIONS[number];
export type ShortcutBinding = Readonly<{ key: string; mod: boolean; alt: boolean; shift: boolean }>;
export type ThemePreference = "system" | "light" | "dark";
export const VISUAL_STYLES = Object.freeze(["flat", "neumorphic", "swiss"] as const);
export type VisualStylePreference = typeof VISUAL_STYLES[number];
export type SendMode = "enter" | "mod-enter";

export function isVisualStylePreference(value: unknown): value is VisualStylePreference {
  return typeof value === "string" && VISUAL_STYLES.some((style) => style === value);
}

export function normalizeVisualStylePreference(value: unknown): VisualStylePreference {
  return isVisualStylePreference(value) ? value : "flat";
}

export interface WebPreferences {
  readonly version: 1;
  readonly appearance: Readonly<{ theme: ThemePreference; visualStyle: VisualStylePreference; conversationFontSize: 14 | 16 | 18; wrapCode: boolean; sidebarCollapsed: boolean }>;
  readonly conversation: Readonly<{ thinkingExpanded: boolean; toolsExpanded: boolean; queueMode: "steer" | "follow_up"; workspaceMode: SessionWorkspaceMode }>;
  readonly shortcuts: Readonly<{ sendMode: SendMode; bindings: Readonly<Record<ShortcutAction, ShortcutBinding | null>> }>;
}
export type PreferenceGroup = "appearance" | "conversation" | "shortcuts";
export type PreferencePatch<G extends PreferenceGroup> = G extends "shortcuts"
  ? { sendMode?: SendMode; bindings?: Partial<Record<ShortcutAction, ShortcutBinding | null>> }
  : Partial<WebPreferences[G]>;

const binding = (key: string): ShortcutBinding => Object.freeze({ key, mod: true, alt: false, shift: false });
export const DEFAULT_WEB_PREFERENCES: WebPreferences = Object.freeze({
  version: 1,
  appearance: Object.freeze({ theme: "system", visualStyle: "flat", conversationFontSize: 14, wrapCode: false, sidebarCollapsed: false }),
  conversation: Object.freeze({ thinkingExpanded: false, toolsExpanded: false, queueMode: "steer", workspaceMode: DEFAULT_SESSION_WORKSPACE_MODE }),
  shortcuts: Object.freeze({ sendMode: "enter", bindings: Object.freeze({ newSession: binding("n"), openCommands: binding("k"), focusComposer: null, openSettings: binding(",") }) }),
});

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeShortcutKey(value: string): string | null {
  const key = value.toLowerCase();
  if (/^[a-z0-9,./;'\[\]\\=\-]$/.test(key) || /^f([1-9]|1[0-2])$/.test(key)) return key;
  return null;
}

export function decodeShortcutBinding(value: unknown): ShortcutBinding | null {
  const candidate = record(value);
  const key = typeof candidate.key === "string" ? normalizeShortcutKey(candidate.key) : null;
  if (!key || typeof candidate.mod !== "boolean" || typeof candidate.alt !== "boolean" || typeof candidate.shift !== "boolean") return null;
  if (!candidate.mod && !candidate.alt) return null;
  return Object.freeze({ key, mod: candidate.mod, alt: candidate.alt, shift: candidate.shift });
}

export function shortcutSignature(value: ShortcutBinding): string {
  return `${value.mod ? "mod+" : ""}${value.alt ? "alt+" : ""}${value.shift ? "shift+" : ""}${value.key}`;
}

export function isProtectedShortcut(value: ShortcutBinding): boolean {
  // Mod+N/K are intentional existing application bindings. Do not reserve them.
  if (value.alt && !value.mod && ["f4", "f2"].includes(value.key)) return true;
  if (value.mod && !value.alt && ["f4", "f5", "f6"].includes(value.key)) return true;
  if (value.mod && value.alt && ["i", "j", "c", "d", "h", "m", "l"].includes(value.key)) return true;
  if (value.mod && !value.alt && ["t", "w", "r", "l", "p", "f", "o", "q", "h", "j", "d", "b", "s", "u", "a", "c", "v", "x", "z", "y", "e", "m", "=", "-", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "/"].includes(value.key)) return true;
  return value.mod && value.shift && ["n", "i", "c", "v"].includes(value.key);
}

export function validateShortcutBinding(action: ShortcutAction, value: ShortcutBinding | null, shortcuts: WebPreferences["shortcuts"]): string | null {
  if (value === null) return null;
  const normalized = decodeShortcutBinding(value);
  if (!normalized) return "请使用包含 Command/Ctrl 或 Alt 的单个组合键。";
  if (isProtectedShortcut(normalized)) return "这个组合键由浏览器或系统保留，请选择其他组合。";
  for (const other of SHORTCUT_ACTIONS) {
    const existing = shortcuts.bindings[other];
    if (other !== action && existing && shortcutSignature(existing) === shortcutSignature(normalized)) return "这个组合键已被其他操作使用。";
  }
  return null;
}

/** Field-wise allowlist: storage never retains unknown fields, drafts or credentials. */
export function decodeWebPreferences(value: unknown): WebPreferences {
  const source = record(value);
  if (source.version !== 1) return DEFAULT_WEB_PREFERENCES;
  const appearance = record(source.appearance), conversation = record(source.conversation), shortcuts = record(source.shortcuts);
  const rawBindings = record(shortcuts.bindings);
  const bindings: Record<ShortcutAction, ShortcutBinding | null> = { ...DEFAULT_WEB_PREFERENCES.shortcuts.bindings };
  for (const action of SHORTCUT_ACTIONS) {
    if (rawBindings[action] === null) bindings[action] = null;
    else {
      const candidate = decodeShortcutBinding(rawBindings[action]);
      if (candidate && !isProtectedShortcut(candidate)) bindings[action] = candidate;
    }
  }
  // Invalid duplicates fall back by field, while legitimate distinct swaps remain valid.
  // Repeat because a fallback can expose a collision with another remapped action.
  for (let pass = 0; pass < SHORTCUT_ACTIONS.length; pass += 1) {
    const signatures = new Map<string, ShortcutAction[]>();
    for (const action of SHORTCUT_ACTIONS) {
      const candidate = bindings[action];
      if (!candidate) continue;
      const signature = shortcutSignature(candidate);
      signatures.set(signature, [...(signatures.get(signature) ?? []), action]);
    }
    let collision = false;
    for (const actions of signatures.values()) {
      if (actions.length < 2) continue;
      collision = true;
      for (const action of actions) bindings[action] = DEFAULT_WEB_PREFERENCES.shortcuts.bindings[action];
    }
    if (!collision) break;
  }
  return Object.freeze({
    version: 1,
    appearance: Object.freeze({
      theme: appearance.theme === "light" || appearance.theme === "dark" ? appearance.theme : "system",
      visualStyle: normalizeVisualStylePreference(appearance.visualStyle),
      conversationFontSize: appearance.conversationFontSize === 16 || appearance.conversationFontSize === 18 ? appearance.conversationFontSize : 14,
      wrapCode: typeof appearance.wrapCode === "boolean" ? appearance.wrapCode : false,
      sidebarCollapsed: appearance.sidebarCollapsed === true,
    }),
    conversation: Object.freeze({
      thinkingExpanded: typeof conversation.thinkingExpanded === "boolean" ? conversation.thinkingExpanded : false,
      toolsExpanded: typeof conversation.toolsExpanded === "boolean" ? conversation.toolsExpanded : false,
      queueMode: conversation.queueMode === "follow_up" ? "follow_up" : "steer",
      workspaceMode: isSessionWorkspaceMode(conversation.workspaceMode) ? conversation.workspaceMode : DEFAULT_SESSION_WORKSPACE_MODE,
    }),
    shortcuts: Object.freeze({ sendMode: shortcuts.sendMode === "mod-enter" ? "mod-enter" : "enter", bindings: Object.freeze(bindings) }),
  });
}

export function parseWebPreferences(value: string | null): WebPreferences {
  if (value === null || value.length > WEB_PREFERENCES_MAX_LENGTH) return DEFAULT_WEB_PREFERENCES;
  try { return decodeWebPreferences(JSON.parse(value)); } catch { return DEFAULT_WEB_PREFERENCES; }
}
