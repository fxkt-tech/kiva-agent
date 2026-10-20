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

export interface RuntimeModel {
  provider: string;
  id: string;
  contextWindow: number;
  reasoning: boolean;
}

export interface RuntimeContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
}

export interface RuntimeQueue {
  steering: string[];
  followUp: string[];
}

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  session: { id: string; name?: string; path?: string; messageCount: number };
  messages: RuntimeMessage[];
  thinkingLevel: string;
  thinkingLevels: string[];
  model?: { provider: string; id: string };
  models: RuntimeModel[];
  context?: RuntimeContextUsage;
  queue: RuntimeQueue;
  error?: string;
}

export type RuntimeCommand =
  | { type: "prompt"; message: string }
  | { type: "abort" }
  | { type: "switch_session"; sessionPath: string }
  | { type: "new_session" }
  | { type: "rename_session"; name: string }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "set_thinking"; level: string }
  | { type: "compact" }
  | { type: "steer"; message: string }
  | { type: "follow_up"; message: string }
  | { type: "clear_queue" };

export interface CommandResult {
  accepted: true;
}

export type RuntimeEvent =
  | { type: "snapshot"; snapshot: RuntimeSnapshot }
  | { type: "runtime_reset" }
  | { type: "pi_event"; event: unknown }
  | { type: "error"; message: string };

export interface RuntimeWireEvent {
  streamId: string;
  seq: number;
  event: RuntimeEvent;
  resync?: boolean;
}
