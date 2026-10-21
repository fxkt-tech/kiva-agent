import type { SessionResource } from "./workspace-contract";

export type RuntimeStatus = "connecting" | "idle" | "running" | "error";
export interface RuntimeScope { projectId: string; sessionId: string }
export type RuntimeLifecycle = "dormant" | "starting" | "idle" | "running" | "waiting" | "interrupted" | "quarantined";

export interface RuntimeTool {
  id: string;
  name: string;
  args?: unknown;
  result?: string;
  status: "running" | "done" | "error";
}

export interface RuntimeMessage {
  id: string;
  /** Original Pi message time in epoch milliseconds; absent when unknown. */
  timestamp?: number;
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

export interface RuntimeImage {
  kind: "image";
  data: string;
  mimeType: string;
  name?: string;
}

export interface RuntimeTextFile {
  kind: "text";
  data: string;
  mimeType: string;
  name: string;
}

export type RuntimeAttachment = RuntimeImage | RuntimeTextFile;

export interface RuntimeSlashCommand {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
}

export interface RuntimeUIRequest {
  id: string;
  method: "select" | "confirm" | "input" | "editor";
  title: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  timeout?: number;
}

export interface RuntimeSnapshot {
  scope?: RuntimeScope;
  lifecycle?: RuntimeLifecycle;
  provenance?: "persisted" | "live" | "cached";
  status: RuntimeStatus;
  session: { id: string; name?: string; path?: string; messageCount: number };
  messages: RuntimeMessage[];
  thinkingLevel: string;
  thinkingLevels: string[];
  model?: { provider: string; id: string };
  models: RuntimeModel[];
  context?: RuntimeContextUsage;
  queue: RuntimeQueue;
  commands: RuntimeSlashCommand[];
  uiRequest?: RuntimeUIRequest;
  error?: string;
}

export type RuntimeCommand =
  | { type: "initialize" }
  | { type: "prompt"; message: string; images?: RuntimeImage[]; files?: RuntimeTextFile[] }
  | { type: "abort" }
  | { type: "switch_session"; sessionPath: string }
  | { type: "new_session" }
  | { type: "rename_session"; name: string }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "set_thinking"; level: string }
  | { type: "compact" }
  | { type: "steer"; message: string; images?: RuntimeImage[]; files?: RuntimeTextFile[] }
  | { type: "follow_up"; message: string; images?: RuntimeImage[]; files?: RuntimeTextFile[] }
  | { type: "extension_ui_response"; id: string; value?: string; confirmed?: boolean; cancelled?: true }
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
  protocol: 1;
  projectId: string;
  sessionId: string;
  streamId: string;
  seq: number;
  event: RuntimeEvent;
  resync?: boolean;
}

export interface SessionRuntimeRead extends RuntimeScope {
  session: SessionResource;
  snapshot: RuntimeSnapshot;
  lifecycle: RuntimeLifecycle;
  executable: boolean;
}

export interface RuntimeErrorResult {
  error: string;
  code: string;
  target?: { projectId: string; sessionId?: string };
  details?: unknown;
}

/** One decoder shared by the HTTP boundary and command callers. */
export function isRuntimeCommand(value: unknown): value is RuntimeCommand {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const command = value as Record<string, unknown>;
  switch (command.type) {
    case "initialize": case "abort": case "compact": case "clear_queue": return true;
    case "rename_session": return typeof command.name === "string" && command.name.length <= 1_000;
    case "set_model": return typeof command.provider === "string" && typeof command.modelId === "string";
    case "set_thinking": return typeof command.level === "string";
    case "extension_ui_response": return typeof command.id === "string" && (typeof command.value === "string" || typeof command.confirmed === "boolean" || command.cancelled === true);
    case "prompt": case "steer": case "follow_up":
      return typeof command.message === "string" && validAttachments(command.images, "image") && validAttachments(command.files, "text");
    default: return false;
  }
}

function validAttachments(value: unknown, kind: "image" | "text") {
  if (value === undefined) return true;
  return Array.isArray(value) && value.length <= 5 && value.every((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Record<string, unknown>;
    return item.kind === kind && typeof item.data === "string" && item.data.length <= (kind === "image" ? 14_000_000 : 1_000_000)
      && typeof item.mimeType === "string" && (kind === "image" ? item.mimeType.startsWith("image/") : typeof item.name === "string" && item.name.length <= 255);
  });
}

export function decodeRuntimeWireEvent(value: unknown, scope: RuntimeScope): RuntimeWireEvent | undefined {
  if (!value || typeof value !== "object") return;
  const event = value as Partial<RuntimeWireEvent>;
  if (event.protocol !== 1 || event.projectId !== scope.projectId || event.sessionId !== scope.sessionId
    || typeof event.streamId !== "string" || !Number.isSafeInteger(event.seq) || (event.seq ?? -1) < 0 || !event.event || typeof event.event !== "object") return;
  if (!["snapshot", "runtime_reset", "pi_event", "error"].includes(event.event.type)) return;
  if (event.event.type === "snapshot") {
    const snapshot = event.event.snapshot;
    if (!snapshot || typeof snapshot !== "object" || snapshot.session?.id !== scope.sessionId
      || (snapshot.scope && (snapshot.scope.projectId !== scope.projectId || snapshot.scope.sessionId !== scope.sessionId))
      || !Array.isArray(snapshot.messages) || !Array.isArray(snapshot.models) || !Array.isArray(snapshot.thinkingLevels)
      || !snapshot.queue || !Array.isArray(snapshot.queue.steering) || !Array.isArray(snapshot.queue.followUp)) return;
  }
  return event as RuntimeWireEvent;
}
