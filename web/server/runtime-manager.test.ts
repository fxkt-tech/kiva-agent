import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RuntimeManager, type RuntimeRepository } from "./runtime-manager";
import { createDeterministicAdapter } from "./fixtures/deterministic-adapter";
import type { ExecutionDescriptor, SessionResource } from "../shared/workspace-contract";
import type { RuntimeScope, RuntimeWireEvent } from "../shared/runtime-types";

function fixture(capacity = 4) {
  const adapters = new Map<string, ReturnType<typeof createDeterministicAdapter>>();
  const records = new Map<string, SessionResource>();
  const repository: RuntimeRepository = {
    read(projectId, sessionId) {
      const id = `${projectId}/${sessionId}`;
      if (!records.has(id)) records.set(id, { id: sessionId, projectId, name: sessionId, path: "", preview: "", updatedAt: "2026-01-01", createdAt: "2026-01-01", collection: "active", legacy: false, executable: true });
      return { session: records.get(id)!, messages: [] };
    },
    resolveExecution(projectId, sessionId) { return { projectId, sessionId, installationRoot: "/fixtures/installation", historyRoot: `/fixtures/${projectId}/history`, executionRoot: `/fixtures/${projectId}/${sessionId}` }; },
    rename(projectId, sessionId, name) { records.get(`${projectId}/${sessionId}`)!.name = name; },
    updateControls(projectId, sessionId, controls) { records.get(`${projectId}/${sessionId}`)!.controls = controls; },
  };
  const manager = new RuntimeManager(repository, (descriptor) => {
    const adapter = createDeterministicAdapter(descriptor); adapters.set(`${descriptor.projectId}/${descriptor.sessionId}`, adapter); return adapter.adapter;
  }, capacity, 60_000);
  return { manager, adapters, records, repository };
}
const a = { projectId: "project", sessionId: "session-a" }, b = { projectId: "project", sessionId: "session-b" };
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("RuntimeManager scoped ownership", () => {
  it("keeps cold reads and multiple subscriptions passive, then shares one owner across tabs", async () => {
    const f = fixture();
    const one: RuntimeWireEvent[] = [], two: RuntimeWireEvent[] = [];
    const first = await f.manager.read(a);
    const unsubscribe = await f.manager.subscribe(a, (event) => one.push(event));
    const unsubscribeTwo = await f.manager.subscribe(a, (event) => two.push(event));
    assert.equal(first.lifecycle, "dormant"); assert.equal(first.snapshot.provenance, "persisted"); assert.equal(f.adapters.size, 0);
    await Promise.all([f.manager.command(a, { type: "initialize" }), f.manager.command(a, { type: "initialize" })]);
    assert.equal(f.adapters.get("project/session-a")?.starts(), 1);
    assert.ok(one.every((event) => event.projectId === a.projectId && event.sessionId === a.sessionId && event.protocol === 1));
    unsubscribe(); unsubscribeTwo();
    await f.manager.command(a, { type: "prompt", message: "keep running after unsubscribe" });
    assert.equal((await f.manager.read(a)).lifecycle, "running");
    await f.manager.stop();
  });

  it("executes same-project and cross-project sessions independently and refuses busy capacity", async () => {
    const f = fixture(3), c = { projectId: "another-project", sessionId: "session-c" };
    await Promise.all([a, b, c].map((scope) => f.manager.command(scope, { type: "prompt", message: scope.sessionId })));
    assert.equal(f.adapters.size, 3);
    await assert.rejects(f.manager.command({ ...a, sessionId: "session-d" }, { type: "initialize" }), (error: unknown) => (error as { code: string }).code === "runtime_capacity");
    assert.equal((await f.manager.read(b)).lifecycle, "running");
    await f.manager.command(a, { type: "abort" });
    await turn();
    assert.equal((await f.manager.read(b)).lifecycle, "running");
    await f.manager.command({ ...a, sessionId: "session-d" }, { type: "initialize" });
    assert.equal(f.adapters.get("project/session-a")?.stops(), 1);
    await f.manager.stop();
  });

  it("releases acceptance exclusion while an RPC is pending so abort and steer remain deliverable", async () => {
    const f = fixture();
    const run = f.manager.command(a, { type: "prompt", message: "hold-rpc" });
    await turn(); await turn();
    await f.manager.command(a, { type: "steer", message: "scoped correction" });
    await assert.rejects(f.manager.withIdle(a, async () => "unsafe deletion"), /Finish or stop/);
    await f.manager.command(a, { type: "abort" });
    await run; await turn();
    assert.equal(await f.manager.withIdle(a, async () => "quiesced"), "quiesced");
    assert.equal(f.adapters.get("project/session-a")?.stops(), 1);
    await f.manager.stop();
  });

  it("rejects identity-changing commands and stale/active controls while retaining scoped empty preferences", async () => {
    const f = fixture();
    await assert.rejects(f.manager.command(a, { type: "new_session" }), /resource/);
    await f.manager.command(a, { type: "rename_session", name: "Empty renamed" });
    assert.equal(f.adapters.size, 0);
    await f.manager.command(a, { type: "set_thinking", level: "high" });
    assert.equal(f.records.get("project/session-a")?.controls?.thinkingLevel, "high");
    await assert.rejects(f.manager.command(a, { type: "set_model", provider: "foreign", modelId: "unknown" }), /unavailable/);
    await f.manager.command(a, { type: "prompt", message: "running" });
    await assert.rejects(f.manager.command(a, { type: "set_thinking", level: "low" }), /finish/);
    await f.manager.stop();
  });

  it("applies model/thinking as one guarded command, persists both, and restores a failed pair", async () => {
    const f = fixture();
    try {
      await f.manager.command(a, { type: "initialize" });
      const adapter = f.adapters.get("project/session-a")!.adapter;
      const previous = await adapter.getState();
      const setThinking = adapter.setThinkingLevel;
      adapter.setThinkingLevel = async (level) => { if (level === "high") throw new Error("controlled thinking failure"); await setThinking(level); };
      await assert.rejects(f.manager.command(a, { type: "set_configuration", provider: "fixture", modelId: "alternate", thinkingLevel: "high" }), /controlled thinking failure/);
      assert.deepEqual((await adapter.getState()).model, previous.model);
      assert.equal((await adapter.getState()).thinkingLevel, previous.thinkingLevel);
      assert.equal(f.records.get("project/session-a")?.controls, undefined);
      adapter.setThinkingLevel = setThinking;
      let release!: () => void, entered!: () => void;
      const waiting = new Promise<void>((resolve) => { release = resolve; });
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const setModel = adapter.setModel;
      adapter.setModel = async (provider, id) => { await setModel(provider, id); entered(); await waiting; };
      const applying = f.manager.command(a, { type: "set_configuration", provider: "fixture", modelId: "alternate", thinkingLevel: "high" });
      await started;
      await assert.rejects(f.manager.command(a, { type: "prompt", message: "must not use an intermediate pair" }), /设置正在保存/);
      release(); await applying;
      assert.deepEqual(f.records.get("project/session-a")?.controls, { model: { provider: "fixture", id: "alternate" }, thinkingLevel: "high" });
      const current = await f.manager.read(a);
      assert.equal(current.snapshot.thinkingLevel, "high"); assert.equal(current.snapshot.model?.id, "alternate");
      await f.manager.command(a, { type: "prompt", message: "now both are ready" });
      await assert.rejects(f.manager.command(a, { type: "set_configuration", provider: "fixture", modelId: "controlled", thinkingLevel: "medium" }), /finish/);
    } finally { await f.manager.stop(); }
  });

  it("protects unvalidated extension events and restores a pending scoped dialog on subscribe", async () => {
    const f = fixture();
    await f.manager.command(a, { type: "initialize" });
    const adapter = f.adapters.get("project/session-a")!;
    adapter.emit({ type: "extension_ui_request", id: "request-a", method: "confirm", title: "Scoped dialog" });
    await assert.rejects(f.manager.withIdle(a, async () => "unsafe"), /Finish or stop/);
    await turn();
    const events: RuntimeWireEvent[] = [];
    const unsubscribe = await f.manager.subscribe(a, (event) => events.push(event));
    const snapshot = events.at(-1)?.event;
    assert.equal(snapshot?.type === "snapshot" && snapshot.snapshot.uiRequest?.id, "request-a");
    await assert.rejects(f.manager.command(b, { type: "extension_ui_response", id: "request-a", confirmed: true }), /no longer pending/);
    await f.manager.command(a, { type: "extension_ui_response", id: "request-a", confirmed: true });
    unsubscribe(); await f.manager.stop();
  });
});
