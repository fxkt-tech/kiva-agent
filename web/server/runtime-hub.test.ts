import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuntimeHub, type RuntimeAdapter } from "./runtime-hub";

function createAdapter() {
  let starts = 0;
  const prompts: string[] = [];
  let aborts = 0;
  const switchedSessions: string[] = [];
  const names: string[] = [];
  let newSessions = 0;
  let eventListener: ((event: unknown) => void) | undefined;
  const adapter: RuntimeAdapter = {
    async start() { starts += 1; },
    async stop() {},
    onEvent(listener) { eventListener = listener; return () => { eventListener = undefined; }; },
    async getState() {
      return {
        isStreaming: false,
        messageCount: 0,
        sessionFile: "/repo/session.jsonl",
        sessionId: "session-1",
        thinkingLevel: "medium",
      };
    },
    async prompt(message) { prompts.push(message); return "started"; },
    async abort() { aborts += 1; },
    async switchSession(path) { switchedSessions.push(path); },
    async newSession() { newSessions += 1; },
    async setSessionName(name) { names.push(name); },
    async getMessages() { return []; },
  };
  return {
    adapter,
    starts: () => starts,
    prompts,
    aborts: () => aborts,
    emit: (event: unknown) => eventListener?.(event),
    switchedSessions,
    names,
    newSessions: () => newSessions,
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

  it("switches the active Pi session through the same runtime boundary", async () => {
    const fake = createAdapter();
    const hub = new RuntimeHub(() => fake.adapter);

    assert.deepEqual(await hub.execute({ type: "switch_session", sessionPath: "/repo/session.jsonl" }), { accepted: true });
    assert.deepEqual(fake.switchedSessions, ["/repo/session.jsonl"]);
  });

  it("creates and renames sessions", async () => {
    const fake = createAdapter();
    const hub = new RuntimeHub(() => fake.adapter);

    await hub.execute({ type: "new_session" });
    await hub.execute({ type: "rename_session", name: "  Release work  " });

    assert.equal(fake.newSessions(), 1);
    assert.deepEqual(fake.names, ["Release work"]);
    await assert.rejects(() => hub.execute({ type: "rename_session", name: "   " }), /empty/i);
  });

  it("hydrates user, assistant, thinking, and tool results in snapshots", async () => {
    const fake = createAdapter();
    fake.adapter.getMessages = async () => [
      { role: "user", content: "Inspect the project" },
      { role: "assistant", content: [
        { type: "thinking", thinking: "I should inspect files." },
        { type: "text", text: "I found **two** files." },
        { type: "toolCall", id: "tool-1", name: "read", arguments: { path: "README.md" } },
      ] },
      { role: "toolResult", toolCallId: "tool-1", toolName: "read", content: [{ type: "text", text: "# Kiva" }], isError: false },
    ];
    const hub = new RuntimeHub(() => fake.adapter);

    const snapshot = await hub.snapshot();

    assert.equal(snapshot.session.path, "/repo/session.jsonl");
    assert.deepEqual(snapshot.messages, [
      { id: "history-0", role: "user", text: "Inspect the project", thinking: "", tools: [] },
      { id: "history-1", role: "assistant", text: "I found **two** files.", thinking: "I should inspect files.", tools: [
        { id: "tool-1", name: "read", args: { path: "README.md" }, result: "# Kiva", status: "done" },
      ] },
    ]);
  });
});
