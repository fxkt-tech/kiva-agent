export type RuntimeStatus = "connecting" | "idle" | "running" | "error";

export interface RuntimeTool {
  id: string;
  name: string;
  args?: unknown;
  result?: string;
  status: "running" | "done" | "error";
}

export interface RuntimeMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking: string;
  tools: RuntimeTool[];
}

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  session: { id: string; name?: string; path?: string; messageCount: number };
  messages: RuntimeMessage[];
  thinkingLevel: string;
  model?: { provider: string; id: string };
  error?: string;
}

export type RuntimeCommand =
  | { type: "prompt"; message: string }
  | { type: "abort" }
  | { type: "switch_session"; sessionPath: string }
  | { type: "new_session" }
  | { type: "rename_session"; name: string };

export interface CommandResult {
  accepted: true;
}

export type RuntimeEvent =
  | { type: "snapshot"; snapshot: RuntimeSnapshot }
  | { type: "pi_event"; event: unknown }
  | { type: "error"; message: string };
