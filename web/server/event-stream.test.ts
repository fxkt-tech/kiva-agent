import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuntimeEventStream } from "./event-stream";

describe("RuntimeEventStream", () => {
  it("sequences events and replays only events after a matching cursor", () => {
    const stream = new RuntimeEventStream(3, "stream-a");
    stream.publish({ type: "error", message: "one" });
    stream.publish({ type: "error", message: "two" });
    const received: number[] = [];

    const unsubscribe = stream.subscribe((event) => received.push(event.seq), { streamId: "stream-a", since: 1 });
    stream.publish({ type: "error", message: "three" });
    unsubscribe();
    stream.publish({ type: "error", message: "four" });

    assert.deepEqual(received, [2, 3]);
  });

  it("does not replay a cursor from a previous server process", () => {
    const stream = new RuntimeEventStream(3, "stream-new");
    stream.publish({ type: "error", message: "fresh" });
    const received: number[] = [];

    stream.subscribe((event) => received.push(event.seq), { streamId: "stream-old", since: 99 });

    assert.deepEqual(received, []);
  });
});
