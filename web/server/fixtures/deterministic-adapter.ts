import type { ExecutionDescriptor } from "../../shared/workspace-contract";
import type { RuntimeAdapter, RuntimeAdapterState } from "../runtime-hub";
import type { RuntimeQueue } from "../../shared/runtime-types";

/** Test-only dependency injection, never selected by production server settings. */
export function createDeterministicAdapter(descriptor: ExecutionDescriptor) {
  let started = 0, stopped = 0, listener: ((event: unknown) => void) | undefined;
  let state: RuntimeAdapterState = { isStreaming: false, messageCount: 0, sessionId: descriptor.sessionId, sessionFile: descriptor.sessionFile, thinkingLevel: "medium", model: { provider: "fixture", id: "controlled" }, cwd: descriptor.executionRoot };
  const messages: unknown[] = [];
  let queue: RuntimeQueue = { steering: [], followUp: [] };
  let pendingPrompt: (() => void) | undefined;
  const emit = (event: unknown) => listener?.(event);
  const settle = () => { state.isStreaming = false; queue = { steering: [], followUp: [] }; emit({ type: "queue_update", ...queue }); emit({ type: "agent_settled", aborted: true }); pendingPrompt?.(); pendingPrompt = undefined; };
  const adapter: RuntimeAdapter = {
    async start() { started += 1; }, async stop() { stopped += 1; },
    onEvent(callback) { listener = callback; return () => { listener = undefined; }; },
    async getState() { return { ...state }; }, async getMessages() { return [...messages]; },
    async getAvailableModels() { return [{ provider: "fixture", id: "controlled", contextWindow: 100_000, reasoning: true }, { provider: "fixture", id: "alternate", contextWindow: 100_000, reasoning: true }]; },
    async getAvailableThinkingLevels() { return ["low", "medium", "high"]; },
    async getSessionStats() { return { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0, contextUsage: { tokens: 10, contextWindow: 100_000, percent: 0.01 } }; },
    async getCommands() { return [{ name: "fixture-ui", source: "extension", description: "Controlled fixture dialog" }]; },
    async prompt(message) {
      state.isStreaming = true;
      const value = { role: "user", content: message, timestamp: Date.now() };
      messages.push(value); state.messageCount = messages.length;
      emit({ type: "agent_start" }); emit({ type: "message_start", message: value });
      if (message === "/fixture-ui") emit({ type: "extension_ui_request", id: "fixture-confirm", method: "confirm", title: "Fixture confirmation", message: "Scoped extension dialog" });
      if (message === "hold-rpc") await new Promise<void>((resolve) => { pendingPrompt = resolve; });
      return { disposition: "started" };
    },
    async abort() { settle(); }, async compact() {},
    async steer(message) { queue.steering.push(message); emit({ type: "queue_update", ...queue }); },
    async followUp(message) { queue.followUp.push(message); emit({ type: "queue_update", ...queue }); },
    async clearQueue() { queue = { steering: [], followUp: [] }; emit({ type: "queue_update", ...queue }); return queue; },
    async setSessionName(name) { state.sessionName = name; },
    async setModel(provider, id) { state.model = { provider, id }; }, async setThinkingLevel(level) { state.thinkingLevel = level; },
    async newSession() { state = { ...state, sessionId: "unexpected-session" }; }, async switchSession() {},
    async respondToUI() { settle(); },
  };
  return { adapter, emit, settle, state, starts: () => started, stops: () => stopped };
}
