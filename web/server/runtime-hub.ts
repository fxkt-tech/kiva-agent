import type { CommandResult, RuntimeCommand, RuntimeEvent, RuntimeImage, RuntimeLifecycle, RuntimeMessage, RuntimeModel, RuntimeQueue, RuntimeScope, RuntimeSlashCommand, RuntimeSnapshot, RuntimeTextFile, RuntimeTool, RuntimeUIRequest } from "../shared/runtime-types";
import { WorkspaceError } from "../shared/workspace-contract";
import { normalizeMessageTimestamp } from "../shared/message-time";

export interface RuntimeAdapterState {
  isStreaming: boolean;
  isCompacting?: boolean;
  pendingMessageCount?: number;
  cwd?: string;
  messageCount: number;
  sessionId: string;
  sessionFile?: string;
  sessionName?: string;
  thinkingLevel: string;
  model?: { provider?: string; id?: string };
}

export interface RuntimeAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(listener: (event: unknown) => void): () => void;
  getState(): Promise<RuntimeAdapterState>;
  prompt(message: string, images?: RuntimeImage[]): Promise<unknown>;
  abort(): Promise<void>;
  switchSession(path: string): Promise<unknown>;
  newSession(): Promise<unknown>;
  setSessionName(name: string): Promise<void>;
  getMessages(): Promise<unknown[]>;
  getAvailableModels(): Promise<RuntimeModel[]>;
  getAvailableThinkingLevels(): Promise<string[]>;
  getSessionStats(): Promise<RuntimeSessionStats>;
  getCommands(): Promise<RuntimeSlashCommand[]>;
  setModel(provider: string, modelId: string): Promise<unknown>;
  setThinkingLevel(level: string): Promise<void>;
  steer(message: string, images?: RuntimeImage[]): Promise<unknown>;
  followUp(message: string, images?: RuntimeImage[]): Promise<unknown>;
  respondToUI(response: { id: string; value?: string; confirmed?: boolean; cancelled?: true }): Promise<void>;
  clearQueue(): Promise<RuntimeQueue>;
  compact(): Promise<unknown>;
}

export interface RuntimeSessionStats {
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
}

export type RuntimeAdapterFactory = () => RuntimeAdapter;
export type RuntimeListener = (event: RuntimeEvent) => void;

export class RuntimeHub {
  private adapter?: RuntimeAdapter;
  private starting?: Promise<RuntimeAdapter>;
  private unsubscribeAdapter?: () => void;
  private listeners = new Set<RuntimeListener>();
  private queue: RuntimeQueue = { steering: [], followUp: [] };
  private healthTimer?: NodeJS.Timeout;
  private healthCheckRunning = false;
  private recovery?: Promise<RuntimeAdapter>;
  private stopping = false;
  private currentSessionPath?: string;
  private lastSnapshot?: RuntimeSnapshot;
  private rawMessages: unknown[] = [];
  /** Message events and getMessages describe the same ordinal history. */
  private messageCursor = 0;
  private activeMessageIndex?: number;
  private authoritativeMessageCount = 0;
  private toolActivities = new Map<string, { owner: number; tool: RuntimeTool }>();
  private pending = 0;
  private pendingEvents = 0;
  private streaming = false;
  private compacting = false;
  private retrying = false;
  private pendingUI = new Map<string, RuntimeUIRequest>();
  private quarantined?: string;
  private quarantineStop?: Promise<void>;
  private interrupted = false;
  private eventChain = Promise.resolve();

  constructor(
    private readonly createAdapter: RuntimeAdapterFactory,
    private readonly healthIntervalMs = 2_000,
    private readonly expected?: RuntimeScope & { executionRoot?: string; sessionFile?: string },
  ) {}

  passiveSnapshot() { return this.lastSnapshot && { ...this.lastSnapshot, lifecycle: this.lifecycle(), provenance: "cached" as const, ...(this.quarantined ? { status: "error" as const, error: this.quarantined } : {}) }; }
  lifecycle(): RuntimeLifecycle {
    if (this.quarantined) return "quarantined";
    if (this.starting && !this.adapter) return "starting";
    if (this.pendingUI.size) return "waiting";
    if (this.pending || this.pendingEvents || this.streaming || this.compacting || this.retrying || this.queue.steering.length || this.queue.followUp.length) return "running";
    if (this.interrupted) return "interrupted";
    return this.adapter ? "idle" : "dormant";
  }
  isIdle() { return this.lifecycle() === "idle" && !!this.lastSnapshot; }

  async snapshot(): Promise<RuntimeSnapshot> {
    let adapter = await this.ensureStarted();
    try {
      return await this.readSnapshot(adapter);
    } catch (error) {
      if (!isProcessFailure(error)) throw error;
      adapter = await this.recoverAdapter(adapter);
      return this.readSnapshot(adapter);
    }
  }

  private async readSnapshot(adapter: RuntimeAdapter): Promise<RuntimeSnapshot> {
    const [[state, messages], models, thinkingLevels, stats, commands] = await Promise.all([
      Promise.all([adapter.getState(), adapter.getMessages()]),
      safeCall(() => adapter.getAvailableModels(), []),
      safeCall(() => adapter.getAvailableThinkingLevels(), []),
      safeCall<RuntimeSessionStats | undefined>(() => adapter.getSessionStats(), undefined),
      safeCall(() => adapter.getCommands(), []),
    ]);
    this.assertIdentity(state);
    this.currentSessionPath = state.sessionFile;
    this.streaming = state.isStreaming || !!state.pendingMessageCount;
    this.compacting = !!state.isCompacting;
    // getMessages contains committed messages; live assistant/tool progress may
    // be ahead of it. Preserve that tail without appending the same history a
    // second time when delayed message_start events pass identity validation.
    const settled = this.pendingEvents === 0 && !state.isStreaming && !state.isCompacting && !this.retrying;
    this.rawMessages = settled ? [...messages] : [...messages, ...this.rawMessages.slice(messages.length)];
    this.authoritativeMessageCount = settled ? messages.length : Math.max(this.authoritativeMessageCount, messages.length);
    if (settled) { this.messageCursor = messages.length; this.activeMessageIndex = undefined; this.toolActivities.clear(); }

    const snapshot: RuntimeSnapshot = {
      scope: this.expected && { projectId: this.expected.projectId, sessionId: this.expected.sessionId },
      lifecycle: this.lifecycle(),
      provenance: "live",
      status: state.isStreaming ? "running" : "idle",
      session: {
        id: state.sessionId,
        name: state.sessionName,
        path: state.sessionFile,
        messageCount: state.messageCount,
      },
      messages: this.projectMessages(),
      thinkingLevel: state.thinkingLevel,
      thinkingLevels,
      model: state.model?.id
        ? { provider: state.model.provider ?? "unknown", id: state.model.id }
        : undefined,
      models,
      context: stats?.contextUsage ? {
        ...stats.contextUsage,
        input: stats.tokens.input,
        output: stats.tokens.output,
        cacheRead: stats.tokens.cacheRead,
        cacheWrite: stats.tokens.cacheWrite,
        total: stats.tokens.total,
        cost: stats.cost,
      } : undefined,
      queue: { steering: [...this.queue.steering], followUp: [...this.queue.followUp] },
      commands,
      uiRequest: this.pendingUI.values().next().value,
    };
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  async execute(command: RuntimeCommand): Promise<CommandResult> {
    if (this.quarantined) throw new WorkspaceError("identity_drift", this.quarantined, 409, this.expected);
    if (this.expected && (command.type === "switch_session" || command.type === "new_session")) {
      throw new WorkspaceError("identity_change_forbidden", "Create or continue a session through its resource endpoint", 400, this.expected);
    }
    if (this.expected && (command.type === "set_model" || command.type === "set_thinking" || command.type === "compact") && ["running", "waiting", "starting"].includes(this.lifecycle())) {
      throw new WorkspaceError("session_busy", "Wait for this task to finish before changing execution controls", 409, this.expected);
    }
    this.pending += 1;
    try {
    let adapter = await this.ensureStarted();
    try {
      this.assertIdentity(await adapter.getState());
      this.interrupted = false;
    } catch (error) {
      if (!isProcessFailure(error)) throw error;
      adapter = await this.recoverAdapter(adapter);
    }
    try {
      if (command.type === "initialize") {
        // Explicit control initialization owns startup; passive reads never do.
      } else if (command.type === "prompt") {
        const message = command.message.trim();
        if (!message && !command.images?.length && !command.files?.length) throw new Error("Prompt cannot be empty");
        await adapter.prompt(withTextFiles(message || "请查看附件。", command.files), command.images);
      } else if (command.type === "abort") {
        await adapter.abort();
      } else if (command.type === "switch_session") {
        await adapter.switchSession(command.sessionPath);
      } else if (command.type === "new_session") {
        await adapter.newSession();
        await adapter.setSessionName("新会话");
      } else if (command.type === "rename_session") {
        const name = command.name.trim();
        if (!name) throw new Error("Session name cannot be empty");
        await adapter.setSessionName(name);
      } else if (command.type === "set_model") {
        if (this.expected && !(await adapter.getAvailableModels()).some((model) => model.provider === command.provider && model.id === command.modelId)) throw new WorkspaceError("model_unavailable", "The selected model is unavailable", 409, this.expected);
        await adapter.setModel(command.provider, command.modelId);
      } else if (command.type === "set_thinking") {
        if (this.expected && !(await adapter.getAvailableThinkingLevels()).includes(command.level)) throw new WorkspaceError("thinking_unavailable", "The selected thinking level is unavailable", 409, this.expected);
        await adapter.setThinkingLevel(command.level);
      } else if (command.type === "steer" || command.type === "follow_up") {
        const message = command.message.trim();
        if (!message && !command.images?.length && !command.files?.length) throw new Error("Queued message cannot be empty");
        const prompt = withTextFiles(message || "请查看附件。", command.files);
        if (command.type === "steer") await adapter.steer(prompt, command.images);
        else await adapter.followUp(prompt, command.images);
      } else if (command.type === "extension_ui_response") {
        if (this.expected && !this.pendingUI.has(command.id)) throw new WorkspaceError("unknown_ui_request", "This extension request is no longer pending", 409, this.expected);
        await adapter.respondToUI(command);
        this.pendingUI.delete(command.id);
      } else if (command.type === "clear_queue") {
        await adapter.clearQueue();
        this.queue = { steering: [], followUp: [] };
      } else {
        await adapter.compact();
      }
    } catch (error) {
      if (isProcessFailure(error)) {
        const replacement = await this.recoverAdapter(adapter);
        this.publish({ type: "snapshot", snapshot: await this.readSnapshot(replacement) });
      }
      throw error;
    }
    await this.publishSnapshot();
    return { accepted: true };
    } finally { this.pending -= 1; }
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.starting?.catch(() => {});
    await this.recovery?.catch(() => {});
    await this.quarantineStop;
    await this.resetAdapter();
  }

  private async ensureStarted(): Promise<RuntimeAdapter> {
    if (this.quarantined) throw new WorkspaceError("identity_drift", this.quarantined, 409, this.expected);
    if (this.recovery) return this.recovery;
    return this.startAdapter();
  }

  private async startAdapter(): Promise<RuntimeAdapter> {
    if (this.stopping) throw new Error("Runtime is stopping");
    if (this.adapter) return this.adapter;
    if (!this.starting) {
      this.starting = (async () => {
        const adapter = this.createAdapter();
        try {
          await adapter.start();
          if (this.stopping) throw new Error("Runtime is stopping");
          if (this.expected) this.assertIdentity(await adapter.getState());
          this.rawMessages = await adapter.getMessages();
          this.messageCursor = this.rawMessages.length;
          this.authoritativeMessageCount = this.rawMessages.length;
          this.activeMessageIndex = undefined;
          this.toolActivities.clear();
        } catch (error) {
          await adapter.stop().catch(() => {});
          throw error;
        }
        this.unsubscribeAdapter = adapter.onEvent((event) => this.handleAdapterEvent(event));
        this.adapter = adapter;
        this.startHealthMonitor(adapter);
        return adapter;
      })();
    }
    try {
      return await this.starting;
    } catch (error) {
      this.starting = undefined;
      throw error;
    }
  }

  private handleAdapterEvent(event: unknown) {
    // Validate session identity before any extension-driven event reaches its old URL.
    this.pendingEvents += 1;
    this.eventChain = this.eventChain.then(async () => {
      if (!this.adapter || this.quarantined) return;
      if (this.expected) this.assertIdentity(await this.adapter.getState());
      this.projectAdapterEvent(event);
    }).catch((error: unknown) => {
      this.publish({ type: "error", message: errorMessage(error) });
    }).finally(() => { this.pendingEvents -= 1; });
  }

  private projectAdapterEvent(event: unknown) {
    const value = record(event);
    let includedBySnapshot = false;
    if (value?.type === "queue_update") {
      this.queue = {
        steering: stringArray(value.steering),
        followUp: stringArray(value.followUp),
      };
    }
    if (value?.type === "agent_start") { this.streaming = true; this.interrupted = false; }
    if (value?.type === "auto_retry_start") this.retrying = true;
    if (value?.type === "auto_retry_end") this.retrying = false;
    if (value?.type === "auto_compaction_start") this.compacting = true;
    if (value?.type === "auto_compaction_end") this.compacting = false;
    if (value?.type === "extension_ui_request" && typeof value.id === "string" && ["select", "confirm", "input", "editor"].includes(String(value.method))) {
      this.pendingUI.set(value.id, value as unknown as RuntimeUIRequest);
    }
    if (value?.type === "agent_settled") { this.streaming = false; this.pendingUI.clear(); }
    if (value?.type === "message_start" || value?.type === "message_update" || value?.type === "message_end") {
      const message = record(value.message);
      if (message) {
        if (value.type === "message_start") this.activeMessageIndex = this.messageCursor++;
        const index = this.activeMessageIndex;
        if (index !== undefined) {
          includedBySnapshot = index < this.authoritativeMessageCount;
          if (!includedBySnapshot) this.rawMessages[index] = message;
        }
      }
    }
    if (value?.type === "tool_execution_start" || value?.type === "tool_execution_update" || value?.type === "tool_execution_end") {
      const id = String(value.toolCallId ?? "");
      includedBySnapshot = this.rawMessages.slice(0, this.authoritativeMessageCount).some((message) => record(message)?.role === "toolResult" && record(message)?.toolCallId === id);
      if (!includedBySnapshot) {
        let owner = this.toolActivities.get(id)?.owner;
        if (owner === undefined) {
          for (let index = this.rawMessages.length - 1; index >= 0; index -= 1) if (record(this.rawMessages[index])?.role === "assistant") { owner = index; break; }
        }
        if (owner !== undefined) {
          const previous = this.toolActivities.get(id)?.tool;
          const result = record(value.result ?? value.partialResult);
          this.toolActivities.set(id, { owner, tool: {
            id, name: typeof value.toolName === "string" ? value.toolName : previous?.name ?? "工具",
            args: value.args ?? previous?.args,
            status: value.type === "tool_execution_end" ? value.isError ? "error" : "done" : "running",
            result: result ? contentText(result.content) : previous?.result,
          } });
        }
      }
    }
    if (this.lastSnapshot) {
      this.lastSnapshot = { ...this.lastSnapshot, messages: this.projectMessages(), status: this.streaming ? "running" : "idle", lifecycle: this.lifecycle(), queue: { steering: [...this.queue.steering], followUp: [...this.queue.followUp] }, uiRequest: this.pendingUI.values().next().value };
    }
    if (!includedBySnapshot) this.publish({ type: "pi_event", event });
    if (isEventType(event, "agent_settled")) {
      void this.publishSnapshot();
    }
  }

  private async publishSnapshot() {
    try {
      const snapshot = await this.snapshot();
      // A later event can project while the RPC snapshot promise resolves. Its
      // projection is the current boundary and must not be replaced by an older
      // returned value just before publishing.
      this.publish({ type: "snapshot", snapshot: this.lastSnapshot ?? snapshot });
    } catch (error) {
      this.publish({ type: "error", message: errorMessage(error) });
    }
  }

  private projectMessages() {
    const messages = normalizeMessages(this.rawMessages);
    for (const { owner, tool } of this.toolActivities.values()) {
      const message = messages.find((entry) => entry.id === `history-${owner}`);
      if (!message) continue;
      const index = message.tools.findIndex((entry) => entry.id === tool.id);
      if (index < 0) message.tools.push({ ...tool });
      else if (message.tools[index].status === "running") message.tools[index] = { ...message.tools[index], ...tool };
    }
    return messages;
  }

  private publish(event: RuntimeEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private startHealthMonitor(adapter: RuntimeAdapter) {
    clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => void this.checkHealth(adapter), this.healthIntervalMs);
    this.healthTimer.unref();
  }

  private async checkHealth(adapter: RuntimeAdapter) {
    if (this.healthCheckRunning || this.stopping || this.adapter !== adapter) return;
    this.healthCheckRunning = true;
    try {
      const state = await adapter.getState();
      this.assertIdentity(state);
      this.streaming = state.isStreaming || !!state.pendingMessageCount;
      this.compacting = !!state.isCompacting;
    } catch (error) {
      if (isProcessFailure(error) && this.adapter === adapter) {
        try {
          const replacement = await this.recoverAdapter(adapter);
          this.publish({ type: "snapshot", snapshot: await this.readSnapshot(replacement) });
        } catch (recoveryError) {
          this.publish({ type: "error", message: errorMessage(recoveryError) });
        }
      }
    } finally {
      this.healthCheckRunning = false;
    }
  }

  private async recoverAdapter(failedAdapter: RuntimeAdapter): Promise<RuntimeAdapter> {
    if (this.adapter !== failedAdapter) return this.ensureStarted();
    if (!this.recovery) {
      this.recovery = Promise.resolve().then(async () => {
        const sessionPath = this.currentSessionPath;
        const queued = { steering: [...this.queue.steering], followUp: [...this.queue.followUp] };
        await this.resetAdapter(failedAdapter, true);
        if (this.stopping) throw new Error("Runtime is stopping");
        const replacement = await this.startAdapter();
        if (!this.expected) {
          if (sessionPath) await replacement.switchSession(sessionPath);
          for (const message of queued.steering) await replacement.steer(message);
          for (const message of queued.followUp) await replacement.followUp(message);
          this.queue = queued;
        } else {
          this.queue = { steering: [], followUp: [] };
          this.pendingUI.clear();
          this.streaming = false;
          this.retrying = false;
          this.compacting = false;
          this.interrupted = true;
        }
        this.publish({ type: "runtime_reset" });
        return replacement;
      }).finally(() => { this.recovery = undefined; });
    }
    return this.recovery;
  }

  private assertIdentity(state: RuntimeAdapterState) {
    if (!this.expected) return;
    if (state.sessionId === this.expected.sessionId
      && (!this.expected.executionRoot || !state.cwd || state.cwd === this.expected.executionRoot)
      && (!this.expected.sessionFile || state.sessionFile === this.expected.sessionFile)) return;
    this.quarantined = `Session identity changed unexpectedly (expected ${this.expected.sessionId}, received ${state.sessionId}); execution is quarantined`;
    const adapter = this.adapter;
    if (adapter) {
      this.adapter = undefined;
      this.starting = undefined;
      clearInterval(this.healthTimer);
      this.unsubscribeAdapter?.();
      this.unsubscribeAdapter = undefined;
      this.quarantineStop = adapter.stop().catch(() => {});
    }
    throw new WorkspaceError("identity_drift", this.quarantined, 409, this.expected);
  }

  private async resetAdapter(expectedAdapter?: RuntimeAdapter, preserveState = false) {
    if (expectedAdapter && this.adapter !== expectedAdapter) return;
    const adapter = this.adapter;
    this.adapter = undefined;
    this.starting = undefined;
    clearInterval(this.healthTimer);
    this.healthTimer = undefined;
    this.unsubscribeAdapter?.();
    this.unsubscribeAdapter = undefined;
    if (!preserveState) {
      this.queue = { steering: [], followUp: [] };
      this.currentSessionPath = undefined;
    }
    if (adapter) {
      try { await adapter.stop(); } catch { /* The process may already be gone. */ }
    }
  }
}

function isEventType(event: unknown, type: string): event is { type: string } {
  return typeof event === "object" && event !== null && "type" in event && event.type === type;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isProcessFailure(error: unknown) {
  return /process.*(exit|closed)|not running|EPIPE|stdin|RPC client/i.test(errorMessage(error));
}

async function safeCall<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try { return await operation(); } catch { return fallback; }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function withTextFiles(message: string, files?: RuntimeTextFile[]) {
  if (!files?.length) return message;
  const blocks = files.map((file) => `<attached_file name="${file.name.replaceAll('"', "&quot;")}">\n${file.data.replaceAll("</attached_file>", "<\\/attached_file>")}\n</attached_file>`);
  return `${message}\n\n${blocks.join("\n\n")}`;
}

function displayPrompt(message: string) {
  return message.replace(/<attached_file name="([^"]+)">[\s\S]*?<\/attached_file>/g, "[附件: $1]").trim();
}

export function normalizeMessages(values: unknown[]): RuntimeMessage[] {
  const messages: RuntimeMessage[] = [];
  values.forEach((value, index) => {
    const message = record(value);
    const timestamp = normalizeMessageTimestamp(message?.timestamp);
    const metadata = timestamp === undefined ? {} : { timestamp };
    if (message?.role === "user") {
      messages.push({ id: `history-${index}`, ...metadata, role: "user", text: displayPrompt(contentText(message.content)), thinking: "", tools: [] });
      return;
    }
    if (message?.role === "assistant") {
      const content = Array.isArray(message.content) ? message.content.map(record).filter(Boolean) : [];
      const tools: RuntimeTool[] = content.flatMap((item) => item?.type === "toolCall" && typeof item.id === "string"
        ? [{ id: item.id, name: typeof item.name === "string" ? item.name : "工具", args: item.arguments, status: "running" as const }]
        : []);
      messages.push({
        id: `history-${index}`,
        ...metadata,
        role: "assistant",
        text: content.filter((item) => item?.type === "text").map((item) => stringValue(item?.text)).join(""),
        thinking: content.filter((item) => item?.type === "thinking").map((item) => stringValue(item?.thinking)).join("\n"),
        tools,
      });
      return;
    }
    if (message?.role === "toolResult" && typeof message.toolCallId === "string") {
      for (let target = messages.length - 1; target >= 0; target -= 1) {
        const tool = messages[target].tools.find((item) => item.id === message.toolCallId);
        if (tool) {
          tool.result = contentText(message.content);
          tool.status = message.isError ? "error" : "done";
          break;
        }
      }
    }
  });
  return messages;
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(record).filter(Boolean).map((item) => item?.type === "text" ? stringValue(item.text) : "").join("");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
