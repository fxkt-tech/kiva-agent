/** Pi message timestamps are epoch milliseconds, not JSONL entry date strings. */
export function normalizeMessageTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? value : undefined;
}

export function formatMessageTime(value: number | undefined): string {
  const timestamp = normalizeMessageTimestamp(value);
  if (timestamp === undefined) return "时间未知";
  const date = new Date(timestamp);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
