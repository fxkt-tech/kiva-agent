import type { CommandResult, RuntimeCommand, RuntimeEvent, RuntimeImage, RuntimeMessage, RuntimeModel, RuntimeQueue, RuntimeSlashCommand, RuntimeSnapshot, RuntimeTextFile, RuntimeTool } from "../shared/runtime-types";

export interface RuntimeAdapterState {
  isStreaming: boolean;
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

  constructor(
    private readonly createAdapter: RuntimeAdapterFactory,
    private readonly healthIntervalMs = 2_000,
  ) {}

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
    this.currentSessionPath = state.sessionFile;

    return {
      status: state.isStreaming ? "running" : "idle",
      session: {
        id: state.sessionId,
        name: state.sessionName,
        path: state.sessionFile,
        messageCount: state.messageCount,
      },
      messages: normalizeMessages(messages),
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
    };
  }

  async execute(command: RuntimeCommand): Promise<CommandResult> {
    let adapter = await this.ensureStarted();
    try {
      await adapter.getState();
    } catch (error) {
      if (!isProcessFailure(error)) throw error;
      adapter = await this.recoverAdapter(adapter);
    }
    try {
      if (command.type === "prompt") {
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
        await adapter.setModel(command.provider, command.modelId);
      } else if (command.type === "set_thinking") {
        await adapter.setThinkingLevel(command.level);
      } else if (command.type === "steer" || command.type === "follow_up") {
        const message = command.message.trim();
        if (!message && !command.images?.length && !command.files?.length) throw new Error("Queued message cannot be empty");
        const prompt = withTextFiles(message || "请查看附件。", command.files);
        if (command.type === "steer") await adapter.steer(prompt, command.images);
        else await adapter.followUp(prompt, command.images);
      } else if (command.type === "extension_ui_response") {
        await adapter.respondToUI(command);
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
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.resetAdapter();
  }

  private async ensureStarted(): Promise<RuntimeAdapter> {
    if (this.recovery) return this.recovery;
    return this.startAdapter();
  }

  private async startAdapter(): Promise<RuntimeAdapter> {
    if (this.adapter) return this.adapter;
    if (!this.starting) {
      this.starting = (async () => {
        const adapter = this.createAdapter();
        await adapter.start();
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
    const value = record(event);
    if (value?.type === "queue_update") {
      this.queue = {
        steering: stringArray(value.steering),
        followUp: stringArray(value.followUp),
      };
    }
    this.publish({ type: "pi_event", event });
    if (isEventType(event, "agent_settled")) {
      void this.publishSnapshot();
    }
  }

  private async publishSnapshot() {
    try {
      this.publish({ type: "snapshot", snapshot: await this.snapshot() });
    } catch (error) {
      this.publish({ type: "error", message: errorMessage(error) });
    }
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
      await adapter.getState();
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
        if (sessionPath) await replacement.switchSession(sessionPath);
        for (const message of queued.steering) await replacement.steer(message);
        for (const message of queued.followUp) await replacement.followUp(message);
        this.queue = queued;
        this.publish({ type: "runtime_reset" });
        return replacement;
      }).finally(() => { this.recovery = undefined; });
    }
    return this.recovery;
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
    if (message?.role === "user") {
      messages.push({ id: `history-${index}`, role: "user", text: displayPrompt(contentText(message.content)), thinking: "", tools: [] });
      return;
    }
    if (message?.role === "assistant") {
      const content = Array.isArray(message.content) ? message.content.map(record).filter(Boolean) : [];
      const tools: RuntimeTool[] = content.flatMap((item) => item?.type === "toolCall" && typeof item.id === "string"
        ? [{ id: item.id, name: typeof item.name === "string" ? item.name : "工具", args: item.arguments, status: "running" as const }]
        : []);
      messages.push({
        id: `history-${index}`,
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
