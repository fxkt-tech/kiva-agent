import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuntimeHub, type RuntimeAdapter } from "./runtime-hub";

function createAdapter() {
  let starts = 0;
  const prompts: string[] = [];
  let aborts = 0;
  let eventListener: ((event: unknown) => void) | undefined;
  const adapter: RuntimeAdapter = {
    async start() { starts += 1; },
    async stop() {},
    onEvent(listener) { eventListener = listener; return () => { eventListener = undefined; }; },
    async getState() {
      return {
        isStreaming: false,
        messageCount: 0,
        sessionId: "session-1",
        thinkingLevel: "medium",
      };
    },
    async prompt(message) { prompts.push(message); return "started"; },
    async abort() { aborts += 1; },
  };
  return {
    adapter,
    starts: () => starts,
    prompts,
    aborts: () => aborts,
    emit: (event: unknown) => eventListener?.(event),
  };
}

describe("RuntimeHub", () => {
  it("starts its adapter once and returns a normalized snapshot", async () => {
    const fake = createAdapter();
    const hub = new RuntimeHub(() => fake.adapter);

    const first = await hub.snapshot();
    const second = await hub.snapshot();

    assert.equal(fake.starts(), 1);
    assert.equal(first.status, "idle");
    assert.equal(first.session.id, "session-1");
    assert.equal(first.thinkingLevel, "medium");
    assert.deepEqual(second, first);
  });

  it("trims prompts, rejects empty input, and aborts the current run", async () => {
    const fake = createAdapter();
    const hub = new RuntimeHub(() => fake.adapter);

    await assert.rejects(() => hub.execute({ type: "prompt", message: "   " }), /empty/i);
    assert.deepEqual(await hub.execute({ type: "prompt", message: "  ship it  " }), { accepted: true });
    assert.deepEqual(fake.prompts, ["ship it"]);

    assert.deepEqual(await hub.execute({ type: "abort" }), { accepted: true });
    assert.equal(fake.aborts(), 1);
  });

  it("forwards Pi events and publishes fresh state when the agent settles", async () => {
    const fake = createAdapter();
    const hub = new RuntimeHub(() => fake.adapter);
    const events: unknown[] = [];
    hub.subscribe((event) => events.push(event));

    await hub.snapshot();
    fake.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hi" } });
    fake.emit({ type: "agent_settled", aborted: false });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(events[0], {
      type: "pi_event",
      event: { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hi" } },
    });
    assert.equal((events[1] as { type: string }).type, "pi_event");
    assert.equal((events[2] as { type: string }).type, "snapshot");
  });
});
