"use client";

import { SHORTCUT_ACTIONS, normalizeShortcutKey, shortcutSignature, type SendMode, type ShortcutAction, type ShortcutBinding, type WebPreferences } from "../shared/web-preferences";
import { webPreferences } from "./web-preferences";

export { validateShortcutBinding } from "../shared/web-preferences";
export type { ShortcutAction, ShortcutBinding } from "../shared/web-preferences";

export interface ShortcutKeyboardEvent {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
  defaultPrevented?: boolean;
  target?: EventTarget | null;
}
type DispatchEvent = ShortcutKeyboardEvent & { preventDefault(): void };

export function isMacPlatform(platform?: string): boolean {
  const source = platform ?? (typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent);
  return /mac|iphone|ipad|ipod/i.test(source);
}

function composing(event: ShortcutKeyboardEvent): boolean {
  return !!(event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229 || event.nativeEvent?.keyCode === 229);
}

const PUNCTUATION_CODES: Readonly<Record<string, string>> = Object.freeze({ Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Equal: "=", Minus: "-" });

function shortcutEventKey(event: ShortcutKeyboardEvent): string | null {
  const key = normalizeShortcutKey(event.key);
  if (key || (!event.altKey && !event.shiftKey) || event.key.length !== 1) return key;
  // Shift punctuation and macOS Option can change `key` into symbols. Fall back
  // only for those modified printable events, never dead keys or IME input.
  const code = event.code ?? "";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return PUNCTUATION_CODES[code] ?? null;
}

/** Normalize one physical event into the portable Mod/Alt/Shift representation. */
export function shortcutBindingFromEvent(event: ShortcutKeyboardEvent, platform?: string): ShortcutBinding | null {
  if (composing(event)) return null;
  const key = shortcutEventKey(event);
  if (!key || (event.metaKey && event.ctrlKey)) return null;
  const mac = isMacPlatform(platform);
  if ((mac && event.ctrlKey) || (!mac && event.metaKey)) return null;
  const mod = mac ? event.metaKey : event.ctrlKey;
  if (!mod && !event.altKey) return null;
  return Object.freeze({ key, mod, alt: event.altKey, shift: event.shiftKey });
}

export function formatShortcutBinding(binding: ShortcutBinding | null, platform?: string): string {
  if (!binding) return "未设置";
  const mac = isMacPlatform(platform);
  const keys = [binding.mod ? mac ? "Command" : "Ctrl" : "", binding.alt ? mac ? "Option" : "Alt" : "", binding.shift ? "Shift" : "", binding.key.toUpperCase()];
  return keys.filter(Boolean).join("+");
}

export function shouldSendFromKeydown(event: ShortcutKeyboardEvent, mode: SendMode, compositionActive = false, platform?: string): boolean {
  if (event.key !== "Enter" || event.repeat || compositionActive || composing(event) || event.defaultPrevented || event.shiftKey || event.altKey) return false;
  if (mode === "enter") return !event.metaKey && !event.ctrlKey;
  return isMacPlatform(platform) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function getSendShortcutHint(mode: SendMode, platform?: string): string {
  return mode === "enter" ? "Enter 发送 · Shift+Enter 换行" : `${isMacPlatform(platform) ? "Command" : "Ctrl"}+Enter 发送 · Enter 换行`;
}

interface ShortcutRegistration { run(): void; available?(): boolean }
interface ShortcutRegistryOptions {
  getBindings(): WebPreferences["shortcuts"]["bindings"];
  platform?: string;
  isModalOpen?(): boolean;
}

function hasModalOrRecorder(event: ShortcutKeyboardEvent): boolean {
  const target = event.target as (EventTarget & { closest?: (selector: string) => Element | null; ownerDocument?: Document }) | null | undefined;
  if (target?.closest?.("[data-shortcut-recorder]")) return true;
  const owner = target?.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
  return !!owner?.querySelector('[role="dialog"][aria-modal="true"]');
}

/** One matching/availability owner. Registrations and blockers are scoped by cleanup tokens. */
export function createShortcutRegistry(options: ShortcutRegistryOptions) {
  const registrations = new Map<ShortcutAction, Map<symbol, ShortcutRegistration>>();
  const blockers = new Set<symbol>();
  const attachments = new Map<Pick<Window, "addEventListener" | "removeEventListener">, { count: number; listener: (event: KeyboardEvent) => void }>();
  const dispatch = (event: DispatchEvent): boolean => {
    if (event.defaultPrevented || event.repeat || composing(event) || event.key === "Escape" || blockers.size || options.isModalOpen?.() || hasModalOrRecorder(event)) return false;
    const candidate = shortcutBindingFromEvent(event, options.platform);
    if (!candidate) return false;
    const signature = shortcutSignature(candidate), bindings = options.getBindings();
    for (const action of SHORTCUT_ACTIONS) {
      const binding = bindings[action];
      if (!binding || shortcutSignature(binding) !== signature) continue;
      const entries = registrations.get(action);
      const registration = entries ? [...entries.values()].at(-1) : undefined;
      if (!registration || registration.available?.() === false) return false;
      event.preventDefault();
      registration.run();
      return true;
    }
    return false;
  };
  return {
    dispatch,
    register: (action: ShortcutAction, registration: ShortcutRegistration) => {
      const token = Symbol(action), entries = registrations.get(action) ?? new Map<symbol, ShortcutRegistration>();
      registrations.set(action, entries);
      entries.set(token, registration);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        entries.delete(token);
        if (!entries.size && registrations.get(action) === entries) registrations.delete(action);
      };
    },
    block: (reason: string) => {
      const token = Symbol(reason);
      blockers.add(token);
      return () => { blockers.delete(token); };
    },
    attach: (target: Pick<Window, "addEventListener" | "removeEventListener">) => {
      const current = attachments.get(target);
      if (current) current.count += 1;
      else {
        const listener = (event: KeyboardEvent) => { dispatch(event); };
        attachments.set(target, { count: 1, listener });
        target.addEventListener("keydown", listener);
      }
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        const attached = attachments.get(target);
        if (!attached || --attached.count > 0) return;
        target.removeEventListener("keydown", attached.listener);
        attachments.delete(target);
      };
    },
  };
}

export const shortcutRegistry = createShortcutRegistry({ getBindings: () => webPreferences.getSnapshot().preferences.shortcuts.bindings });
