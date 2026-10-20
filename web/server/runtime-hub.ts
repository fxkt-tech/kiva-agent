import type { CommandResult, RuntimeCommand, RuntimeEvent, RuntimeSnapshot } from "../shared/runtime-types";

export interface RuntimeAdapterState {
  isStreaming: boolean;
  messageCount: number;
  sessionId: string;
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
    const state = await adapter.getState();

    return {
      status: state.isStreaming ? "running" : "idle",
      session: {
        id: state.sessionId,
        name: state.sessionName,
        messageCount: state.messageCount,
      },
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
    } else {
      await adapter.switchSession(command.sessionPath);
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
