import type { CommandResult, RuntimeCommand, RuntimeEvent, RuntimeMessage, RuntimeSnapshot, RuntimeTool } from "../shared/runtime-types";

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
  prompt(message: string): Promise<unknown>;
  abort(): Promise<void>;
  switchSession(path: string): Promise<unknown>;
  newSession(): Promise<unknown>;
  setSessionName(name: string): Promise<void>;
  getMessages(): Promise<unknown[]>;
}

export type RuntimeAdapterFactory = () => RuntimeAdapter;
export type RuntimeListener = (event: RuntimeEvent) => void;

export class RuntimeHub {
  private adapter?: RuntimeAdapter;
  private starting?: Promise<RuntimeAdapter>;
  private listeners = new Set<RuntimeListener>();

  constructor(private readonly createAdapter: RuntimeAdapterFactory) {}

  async snapshot(): Promise<RuntimeSnapshot> {
    const adapter = await this.ensureStarted();
    const [state, messages] = await Promise.all([adapter.getState(), adapter.getMessages()]);

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
      model: state.model?.id
        ? { provider: state.model.provider ?? "unknown", id: state.model.id }
        : undefined,
    };
  }

  async execute(command: RuntimeCommand): Promise<CommandResult> {
    const adapter = await this.ensureStarted();
    if (command.type === "prompt") {
      const message = command.message.trim();
      if (!message) throw new Error("Prompt cannot be empty");
      await adapter.prompt(message);
    } else if (command.type === "abort") {
      await adapter.abort();
    } else if (command.type === "switch_session") {
      await adapter.switchSession(command.sessionPath);
    } else if (command.type === "new_session") {
      await adapter.newSession();
    } else {
      const name = command.name.trim();
      if (!name) throw new Error("Session name cannot be empty");
      await adapter.setSessionName(name);
    }
    await this.publishSnapshot();
    return { accepted: true };
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async stop(): Promise<void> {
    if (this.adapter) await this.adapter.stop();
  }

  private async ensureStarted(): Promise<RuntimeAdapter> {
    if (this.adapter) return this.adapter;
    if (!this.starting) {
      this.starting = (async () => {
        const adapter = this.createAdapter();
        await adapter.start();
        adapter.onEvent((event) => this.handleAdapterEvent(event));
        this.adapter = adapter;
        return adapter;
      })();
    }
    return this.starting;
  }

  private handleAdapterEvent(event: unknown) {
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
}

function isEventType(event: unknown, type: string): event is { type: string } {
  return typeof event === "object" && event !== null && "type" in event && event.type === type;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeMessages(values: unknown[]): RuntimeMessage[] {
  const messages: RuntimeMessage[] = [];
  values.forEach((value, index) => {
    const message = record(value);
    if (message?.role === "user") {
      messages.push({ id: `history-${index}`, role: "user", text: contentText(message.content), thinking: "", tools: [] });
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
