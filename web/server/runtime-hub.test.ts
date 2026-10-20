import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuntimeHub, type RuntimeAdapter } from "./runtime-hub";

function createAdapter() {
  let starts = 0;
  const prompts: string[] = [];
  const promptImages: unknown[][] = [];
  let aborts = 0;
  const switchedSessions: string[] = [];
  const names: string[] = [];
  const steers: string[] = [];
  const followUps: string[] = [];
  const models: string[] = [];
  const thinkingLevels: string[] = [];
  let newSessions = 0;
  let compactions = 0;
  let queueClears = 0;
  let eventListener: ((event: unknown) => void) | undefined;
  const uiResponses: unknown[] = [];
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
    async prompt(message, images) { prompts.push(message); promptImages.push(images ?? []); return "started"; },
    async abort() { aborts += 1; },
    async switchSession(path) { switchedSessions.push(path); },
    async newSession() { newSessions += 1; },
    async setSessionName(name) { names.push(name); },
    async getMessages() { return []; },
    async getAvailableModels() { return [{ provider: "openai", id: "gpt-test", contextWindow: 100_000, reasoning: true }]; },
    async getAvailableThinkingLevels() { return ["low", "medium", "high"]; },
    async getSessionStats() { return { tokens: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0, total: 17 }, cost: 0.01, contextUsage: { tokens: 1_000, contextWindow: 100_000, percent: 1 } }; },
    async getCommands() { return [{ name: "review", description: "Review changes", source: "skill" }]; },
    async setModel(provider, id) { models.push(`${provider}/${id}`); },
    async setThinkingLevel(level) { thinkingLevels.push(level); },
    async steer(message) { steers.push(message); },
    async followUp(message) { followUps.push(message); },
    async respondToUI(response) { uiResponses.push(response); },
    async clearQueue() { queueClears += 1; return { steering: [], followUp: [] }; },
    async compact() { compactions += 1; },
  };
  return {
    adapter,
    starts: () => starts,
    prompts,
    promptImages,
    aborts: () => aborts,
    emit: (event: unknown) => eventListener?.(event),
    switchedSessions,
    names,
    newSessions: () => newSessions,
    steers,
    followUps,
    models,
    thinkingLevels,
    compactions: () => compactions,
    queueClears: () => queueClears,
    uiResponses,
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
    assert.equal(first.models[0].id, "gpt-test");
    assert.equal(first.context?.percent, 1);
    assert.deepEqual(first.commands, [{ name: "review", description: "Review changes", source: "skill" }]);
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

  it("sends image attachments and responds to extension UI requests", async () => {
    const fake = createAdapter();
    const hub = new RuntimeHub(() => fake.adapter);
    const image = { name: "screen.png", mimeType: "image/png", data: "cG5n" };

    await hub.execute({ type: "prompt", message: "", images: [image] });
    await hub.execute({ type: "extension_ui_response", id: "ui-1", confirmed: true });

    assert.equal(fake.prompts[0], "请查看附件。");
    assert.deepEqual(fake.promptImages, [[image]]);
    assert.deepEqual(fake.uiResponses, [{ type: "extension_ui_response", id: "ui-1", confirmed: true }]);
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

  it("controls models, thinking, compaction, and running message queues", async () => {
    const fake = createAdapter();
    const hub = new RuntimeHub(() => fake.adapter);

    await hub.execute({ type: "set_model", provider: "openai", modelId: "gpt-test" });
    await hub.execute({ type: "set_thinking", level: "high" });
    await hub.execute({ type: "steer", message: "  focus on tests  " });
    await hub.execute({ type: "follow_up", message: "  summarize afterwards  " });
    fake.emit({ type: "queue_update", steering: ["focus on tests"], followUp: ["summarize afterwards"] });
    const queued = await hub.snapshot();
    await hub.execute({ type: "clear_queue" });
    await hub.execute({ type: "compact" });

    assert.deepEqual(fake.models, ["openai/gpt-test"]);
    assert.deepEqual(fake.thinkingLevels, ["high"]);
    assert.deepEqual(fake.steers, ["focus on tests"]);
    assert.deepEqual(fake.followUps, ["summarize afterwards"]);
    assert.deepEqual(queued.queue, { steering: ["focus on tests"], followUp: ["summarize afterwards"] });
    assert.equal(fake.queueClears(), 1);
    assert.equal(fake.compactions(), 1);
  });

  it("restarts a failed Pi child before serving a safe snapshot", async () => {
    const broken = createAdapter();
    let stops = 0;
    broken.adapter.stop = async () => { stops += 1; };
    broken.adapter.getState = async () => { throw new Error("RPC process exited unexpectedly"); };
    const healthy = createAdapter();
    let factories = 0;
    const hub = new RuntimeHub(() => factories++ === 0 ? broken.adapter : healthy.adapter);

    const snapshot = await hub.snapshot();

    assert.equal(snapshot.session.id, "session-1");
    assert.equal(factories, 2);
    assert.equal(stops, 1);
  });

  it("proactively replaces an exited Pi child and accepts the next command", async () => {
    const broken = createAdapter();
    let exited = false;
    const originalGetState = broken.adapter.getState;
    broken.adapter.getState = async () => {
      if (exited) throw new Error("Agent process exited unexpectedly");
      return originalGetState();
    };
    const healthy = createAdapter();
    let factories = 0;
    const hub = new RuntimeHub(() => factories++ === 0 ? broken.adapter : healthy.adapter, 5);
    const events: string[] = [];
    hub.subscribe((event) => events.push(event.type));

    await hub.snapshot();
    broken.emit({ type: "queue_update", steering: ["preserve this correction"], followUp: ["then summarize"] });
    exited = true;
    await waitFor(() => factories === 2);
    await hub.execute({ type: "prompt", message: "continue safely" });
    await hub.stop();

    assert.deepEqual(healthy.prompts, ["continue safely"]);
    assert.deepEqual(healthy.switchedSessions, ["/repo/session.jsonl"]);
    assert.deepEqual(healthy.steers, ["preserve this correction"]);
    assert.deepEqual(healthy.followUps, ["then summarize"]);
    assert.ok(events.includes("runtime_reset"));
    assert.ok(events.includes("snapshot"));
  });

  it("holds commands until an in-progress recovery restores the active session", async () => {
    const broken = createAdapter();
    const healthy = createAdapter();
    const operations: string[] = [];
    let releaseStop!: () => void;
    const stopGate = new Promise<void>((resolve) => { releaseStop = resolve; });
    let stopStarted = false;
    broken.adapter.stop = async () => {
      stopStarted = true;
      await stopGate;
    };
    let exited = false;
    const originalGetState = broken.adapter.getState;
    broken.adapter.getState = async () => {
      if (exited) throw new Error("Agent process exited unexpectedly");
      return originalGetState();
    };
    healthy.adapter.switchSession = async (path) => {
      operations.push(`switch:${path}`);
      healthy.switchedSessions.push(path);
    };
    healthy.adapter.prompt = async (message) => {
      operations.push(`prompt:${message}`);
      healthy.prompts.push(message);
      return "started";
    };
    let factories = 0;
    const hub = new RuntimeHub(() => factories++ === 0 ? broken.adapter : healthy.adapter);

    await hub.snapshot();
    exited = true;
    const recovery = hub.snapshot();
    await waitFor(() => stopStarted);
    const command = hub.execute({ type: "prompt", message: "after recovery" });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(factories, 1);
    assert.deepEqual(healthy.prompts, []);
    releaseStop();
    await Promise.all([recovery, command]);
    await hub.stop();

    assert.deepEqual(operations, ["switch:/repo/session.jsonl", "prompt:after recovery"]);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
