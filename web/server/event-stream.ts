import { randomUUID } from "node:crypto";
import type { RuntimeEvent, RuntimeScope, RuntimeWireEvent } from "../shared/runtime-types";

export interface RuntimeCursor {
  streamId?: string;
  since?: number;
}

export class RuntimeEventStream {
  private sequence = 0;
  private history: RuntimeWireEvent[] = [];
  private listeners = new Set<(event: RuntimeWireEvent) => void>();

  constructor(
    private readonly historyLimit = 2_048,
    public streamId: string = randomUUID(),
    readonly scope: RuntimeScope = { projectId: "", sessionId: "" },
  ) {}

  publish(event: RuntimeEvent) {
    const wireEvent = { protocol: 1, ...this.scope, streamId: this.streamId, seq: ++this.sequence, event } satisfies RuntimeWireEvent;
    this.history.push(wireEvent);
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    for (const listener of this.listeners) listener(wireEvent);
    return wireEvent;
  }

  needsResync(cursor: RuntimeCursor) {
    if (cursor.streamId && cursor.streamId !== this.streamId) return true;
    if (!Number.isSafeInteger(cursor.since) || this.history.length === 0) return false;
    if ((cursor.since ?? 0) > this.sequence) return true;
    return (cursor.since ?? 0) < this.history[0].seq - 1;
  }

  resyncEvent(): RuntimeWireEvent {
    return { protocol: 1, ...this.scope, streamId: this.streamId, seq: this.sequence, event: { type: "runtime_reset" }, resync: true };
  }

  rotate() {
    this.streamId = randomUUID();
    this.sequence = 0;
    this.history = [];
  }

  subscribe(listener: (event: RuntimeWireEvent) => void, cursor: RuntimeCursor = {}) {
    let replaying = true;
    const pending: RuntimeWireEvent[] = [];
    const receive = (event: RuntimeWireEvent) => replaying ? pending.push(event) : listener(event);
    this.listeners.add(receive);
    if (cursor.streamId === this.streamId && Number.isSafeInteger(cursor.since)) {
      for (const event of [...this.history]) {
        if (event.seq > (cursor.since ?? 0)) listener(event);
      }
    }
    while (pending.length) listener(pending.shift()!);
    replaying = false;
    return () => this.listeners.delete(receive);
  }
}
