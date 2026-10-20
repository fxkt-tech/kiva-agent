export type RuntimeStatus = "connecting" | "idle" | "running" | "error";

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  session: { id: string; name?: string; messageCount: number };
  thinkingLevel: string;
  model?: { provider: string; id: string };
  error?: string;
}

export type RuntimeCommand =
  | { type: "prompt"; message: string }
  | { type: "abort" };

export interface CommandResult {
  accepted: true;
}

export type RuntimeEvent =
  | { type: "snapshot"; snapshot: RuntimeSnapshot }
  | { type: "pi_event"; event: unknown }
  | { type: "error"; message: string };
