import { basename, relative } from "node:path";
import type { SessionSummary } from "../shared/types";

/** Shared by legacy catalog reads and streaming list reads; later matching records win. */
export class SessionSummaryAccumulator {
  private id: string;
  private name = "未命名会话";
  private preview = "尚无消息预览";
  constructor(private readonly path: string, private readonly root: string) { this.id = basename(path, ".jsonl"); }

  consume(line: string) {
    if (!line) return;
    try {
      const entry: unknown = JSON.parse(line);
      if (!entry || typeof entry !== "object") return;
      if ("type" in entry && entry.type === "session" && "id" in entry && typeof entry.id === "string") this.id = entry.id;
      if ("type" in entry && entry.type === "session_info" && "name" in entry && typeof entry.name === "string") this.name = entry.name;
      const message = "message" in entry ? entry.message : undefined;
      if (message && typeof message === "object" && "role" in message && message.role === "user") {
        const text = messageText("content" in message ? message.content : undefined);
        if (text) {
          this.preview = text.replace(/\s+/g, " ").slice(0, 90);
          if (this.name === "未命名会话") this.name = this.preview.slice(0, 28);
        }
      }
    } catch { /* Preserve malformed/partially-written record tolerance. */ }
  }

  finish(updatedAt: string): SessionSummary {
    return { id: this.id, path: relative(this.root, this.path), name: this.name, preview: this.preview, updatedAt };
  }
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((item) => typeof item === "object" && item !== null && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string" ? [item.text] : []).join("");
}
