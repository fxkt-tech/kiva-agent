import { randomUUID } from "node:crypto";
import type { RuntimeEvent, RuntimeWireEvent } from "../shared/runtime-types";

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
    readonly streamId: string = randomUUID(),
  ) {}

  publish(event: RuntimeEvent) {
    const wireEvent = { streamId: this.streamId, seq: ++this.sequence, event } satisfies RuntimeWireEvent;
    this.history.push(wireEvent);
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    for (const listener of this.listeners) listener(wireEvent);
    return wireEvent;
  }

  needsResync(cursor: RuntimeCursor) {
    if (cursor.streamId !== this.streamId || !Number.isSafeInteger(cursor.since) || this.history.length === 0) return false;
    return (cursor.since ?? 0) < this.history[0].seq - 1;
  }

  resyncEvent(): RuntimeWireEvent {
    return { streamId: this.streamId, seq: this.sequence, event: { type: "runtime_reset" }, resync: true };
  }

  subscribe(listener: (event: RuntimeWireEvent) => void, cursor: RuntimeCursor = {}) {
    if (cursor.streamId === this.streamId && Number.isSafeInteger(cursor.since)) {
      for (const event of this.history) {
        if (event.seq > (cursor.since ?? 0)) listener(event);
      }
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
