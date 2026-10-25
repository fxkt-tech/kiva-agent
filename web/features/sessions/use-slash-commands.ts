"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent, type RefObject, type SyntheticEvent } from "react";
import type { RuntimeSlashCommand } from "@/shared/runtime-types";
import { completeSlashCommand, insertSlashCommand, matchingSlashCommands, slashCommandToken } from "./slash-commands";

const EMPTY_COMMANDS: RuntimeSlashCommand[] = [];
const commandKey = (command: RuntimeSlashCommand) => `${command.source}:${command.name}`;

/** The native textarea owns focus and selection; the menu only completes text. */
export function useSlashCommands({ scope, draft, onChange, commands = EMPTY_COMMANDS, input, composing }: {
  scope: string;
  draft: string;
  onChange(text: string): void;
  commands?: RuntimeSlashCommand[];
  input: RefObject<HTMLTextAreaElement | null>;
  composing: RefObject<boolean>;
}) {
  const id = useId();
  const [selection, setSelection] = useState({ start: draft.length, end: draft.length });
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [inComposition, setInComposition] = useState(false);
  const [activeKey, setActiveKey] = useState<string>();
  const [highlight, setHighlight] = useState<{ top: number; height: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const loadAction = useRef<HTMLButtonElement>(null);
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingSelection = useRef<{ text: string; caret: number } | null>(null);
  const token = useMemo(() => slashCommandToken(draft, selection.start, selection.end), [draft, selection]);
  const visibleCommands = useMemo(() => matchingSlashCommands(commands, token?.query ?? ""), [commands, token?.query]);
  const open = focused && !dismissed && !inComposition && token !== null && (!token.query.includes("/") || visibleCommands.length > 0);
  const activeIndex = Math.max(0, visibleCommands.findIndex((command) => commandKey(command) === activeKey));
  const active = visibleCommands[activeIndex];
  const optionId = (index: number) => `${id}-command-${index}`;

  function readSelection(target: HTMLTextAreaElement, fallback = draft.length) {
    return { start: target.selectionStart ?? fallback, end: target.selectionEnd ?? fallback };
  }
  const dismiss = useCallback(() => { setDismissed(true); }, []);
  useEffect(() => {
    setFocused(false); setDismissed(false); setActiveKey(undefined); setInComposition(false);
    pendingSelection.current = null;
  }, [scope]);
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    if (pending?.text !== draft || !input.current) return;
    input.current.focus({ preventScroll: true });
    input.current.setSelectionRange(pending.caret, pending.caret);
    pendingSelection.current = null;
  }, [draft, input, selection]);
  useLayoutEffect(() => {
    const popup = menu.current;
    const control = anchor.current;
    if (!open || !popup || !control) return;
    const visualViewport = window.visualViewport;
    let previousSpace: number | undefined;
    const measure = () => {
      // The menu grows upward: reserve its8px gap and8px visible viewport inset.
      const space = Math.max(0, Math.floor(control.getBoundingClientRect().top - (visualViewport?.offsetTop ?? 0) - 16));
      if (space === previousSpace) return;
      previousSpace = space;
      popup.style.setProperty("--command-menu-space", `${space}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    visualViewport?.addEventListener("resize", measure);
    visualViewport?.addEventListener("scroll", measure);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(control);
    if (input.current) observer?.observe(input.current);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      visualViewport?.removeEventListener("resize", measure);
      visualViewport?.removeEventListener("scroll", measure);
    };
  }, [draft, input, open]);
  useLayoutEffect(() => {
    const row = rows.current[activeIndex];
    const viewport = list.current;
    if (!open || !row || !viewport) { setHighlight(null); return; }
    const measure = () => {
      const top = row.offsetTop;
      const height = row.offsetHeight;
      setHighlight((previous) => previous?.top === top && previous.height === height ? previous : { top, height });
      if (top < viewport.scrollTop) viewport.scrollTop = top;
      else if (top + height > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = top + height - viewport.clientHeight;
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport); observer.observe(row);
    return () => observer.disconnect();
  }, [activeIndex, open, visibleCommands]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && event.target !== input.current) dismiss();
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [dismiss, input, open]);

  function updateText(next: { text: string; caret: number }) {
    pendingSelection.current = next;
    setSelection({ start: next.caret, end: next.caret });
    onChange(next.text);
  }
  const openCommands = useCallback(() => {
    const selected = input.current ? readSelection(input.current) : selection;
    if (!slashCommandToken(draft, selected.start, selected.end)) updateText(insertSlashCommand(draft, selected.start, selected.end));
    else setSelection(selected);
    setFocused(true); setDismissed(false); setActiveKey(undefined);
    input.current?.focus({ preventScroll: true });
  }, [draft, input, selection, onChange]);
  function choose(command: RuntimeSlashCommand) {
    if (!token) return;
    updateText(completeSlashCommand(draft, token, command.name));
    setDismissed(true); setActiveKey(undefined);
    input.current?.focus({ preventScroll: true });
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !open) return false;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); return true; }
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && visibleCommands.length) {
      event.preventDefault();
      const next = (activeIndex + (event.key === "ArrowDown" ? 1 : visibleCommands.length - 1)) % visibleCommands.length;
      setActiveKey(commandKey(visibleCommands[next]));
      return true;
    }
    if (!event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat && active) choose(active);
      return true;
    }
    if (!event.shiftKey && event.key === "Tab") {
      if (active) {
        event.preventDefault();
        if (!event.repeat) choose(active);
        return true;
      }
      if (loadAction.current && !loadAction.current.disabled) {
        event.preventDefault(); loadAction.current.focus(); return true;
      }
    }
    if (event.key === "Tab") dismiss();
    return false;
  }
  function change(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setSelection(readSelection(event.target, value.length));
    setFocused(true); setDismissed(false); setActiveKey(undefined);
    onChange(value);
  }
  function select(event: SyntheticEvent<HTMLTextAreaElement>) { setSelection(readSelection(event.currentTarget)); }
  function focus(event: FocusEvent<HTMLTextAreaElement>) { setFocused(true); select(event); }
  function blur(event: FocusEvent<HTMLTextAreaElement>) {
    if (event.relatedTarget instanceof Node && menu.current?.contains(event.relatedTarget)) return;
    setFocused(false);
  }
  function compositionStart() { composing.current = true; setInComposition(true); }
  function compositionEnd() { composing.current = false; setInComposition(false); }

  return { open, query: token?.query ?? "", visibleCommands, activeIndex, highlight, menu, anchor, list, loadAction, rows, optionId,
    listId: `${id}-commands`, activeId: open && active ? optionId(activeIndex) : undefined,
    choose, dismiss, openCommands, handleKeyDown, change, select, focus, blur, compositionStart, compositionEnd,
    activate(index: number) { const command = visibleCommands[index]; if (command) setActiveKey(commandKey(command)); },
  };
}
