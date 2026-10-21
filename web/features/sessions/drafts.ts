import type { RuntimeAttachment } from "@/shared/runtime-types";

export interface SessionDraft { text: string; attachments: RuntimeAttachment[] }
const empty: SessionDraft = { text: "", attachments: [] };

/** Created once by the persistent shell; nothing is persisted or shared between tabs. */
export class DraftStore {
  private values = new Map<string, SessionDraft>();
  private listeners = new Set<() => void>();
  key(projectId: string, sessionId?: string) { return `${projectId}/${sessionId ?? "entry"}`; }
  read = (key: string) => this.values.get(key) ?? empty;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  update(key: string, change: Partial<SessionDraft> | ((draft: SessionDraft) => SessionDraft)) {
    this.values.set(key, typeof change === "function" ? change(this.read(key)) : { ...this.read(key), ...change });
    this.listeners.forEach((listener) => listener());
  }
  restore(key: string, captured: SessionDraft) {
    const current = this.read(key);
    this.update(key, { text: current.text ? `${captured.text}\n${current.text}` : captured.text, attachments: [...captured.attachments, ...current.attachments].slice(0, 5) });
  }
}
