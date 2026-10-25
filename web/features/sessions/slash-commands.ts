import type { RuntimeSlashCommand, RuntimeSnapshot } from "@/shared/runtime-types";

export interface SlashCommandToken {
  start: number;
  end: number;
  query: string;
}

/** Inspect the word at the caret, never URL separators or a selected range. */
export function slashCommandToken(text: string, start: number, end = start): SlashCommandToken | null {
  if (start !== end || start < 0 || start > text.length) return null;
  const match = /(?:^|\s)\/([^\s]*)$/u.exec(text.slice(0, start));
  if (!match || match[1].startsWith("/")) return null;
  const tokenStart = start - match[1].length - 1;
  const suffix = /^[^\s]*/u.exec(text.slice(start))![0];
  return { start: tokenStart, end: start + suffix.length, query: match[1] };
}

export function matchingSlashCommands(commands: readonly RuntimeSlashCommand[], query: string): RuntimeSlashCommand[] {
  const needle = query.toLowerCase();
  const rank = (command: RuntimeSlashCommand) => {
    const name = command.name.toLowerCase();
    if (name.startsWith(needle)) return 0;
    if (needle.includes("/")) return -1;
    if (name.includes(needle)) return 1;
    return command.description?.toLowerCase().includes(needle) ? 2 : -1;
  };
  return commands.map((command, index) => ({ command, index, rank: rank(command) }))
    .filter((item) => item.rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((item) => item.command);
}

/** A loaded runtime may truthfully have no models or commands. */
export function slashCommandsLoaded(snapshot?: Pick<RuntimeSnapshot, "provenance" | "lifecycle" | "models">): boolean {
  if (!snapshot) return false;
  if (snapshot.provenance !== undefined) return snapshot.provenance !== "persisted";
  if (snapshot.lifecycle !== undefined) return snapshot.lifecycle !== "dormant" && snapshot.lifecycle !== "starting";
  return snapshot.models.length > 0;
}

export function completeSlashCommand(text: string, token: SlashCommandToken, name: string): { text: string; caret: number } {
  const suffix = text.slice(token.end);
  const command = `/${name}`;
  const separator = /^\s/u.test(suffix) ? "" : " ";
  return {
    text: text.slice(0, token.start) + command + separator + suffix,
    caret: token.start + command.length + (separator.length || (suffix.startsWith(" ") ? 1 : 0)),
  };
}

/** Cmd/Ctrl+K starts a query at the native selection without losing nearby text. */
export function insertSlashCommand(text: string, start: number, end = start): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const trigger = `${before && !/\s$/u.test(before) ? " " : ""}/`;
  return {
    text: before + trigger + (after && !/^\s/u.test(after) ? " " : "") + after,
    caret: before.length + trigger.length,
  };
}
