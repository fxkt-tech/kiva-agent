import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createPiAdapter } from "./pi-adapter";
import { RuntimeHub } from "./runtime-hub";
import { saveModelDefaults } from "./model-catalog";
import type { ExecutionDescriptor } from "../shared/workspace-contract";

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-pi-probe-")));
  const installationRoot = join(root, "installation"), executionRoot = join(root, "execution"), historyRoot = join(root, "history");
  mkdirSync(join(installationRoot, "agent", "extensions"), { recursive: true });
  mkdirSync(executionRoot); mkdirSync(historyRoot);
  copyFileSync(new URL("./fixtures/runtime-probe.ts", import.meta.url), join(installationRoot, "agent", "extensions", "kiva.ts"));
  const descriptor: ExecutionDescriptor = { installationRoot, executionRoot, historyRoot, projectId: "project-fixture", sessionId: randomUUID() };
  return { root, descriptor, context: () => JSON.parse(readFileSync(join(installationRoot, ".kiva", "agent", "probe-context.json"), "utf8")) };
}

describe("installed Pi no-prompt compatibility", () => {
  it("starts new Pi owners with the saved model/thinking pair without a model request", { timeout: 30_000 }, async () => {
    const f = fixture(), agent = join(f.descriptor.installationRoot, ".kiva", "agent");
    mkdirSync(agent, { recursive: true });
    writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { "defaults-probe": { api: "openai-completions", baseUrl: "https://example.invalid/v1", apiKey: "offline-fixture-key", models: [{ id: "offline-reasoner", name: "Offline reasoner", contextWindow: 8192, maxTokens: 2048, reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
    await saveModelDefaults(f.descriptor.installationRoot, { provider: "defaults-probe", modelId: "offline-reasoner", thinkingLevel: "high" });
    const settings = readFileSync(join(agent, "settings.json"), "utf8");
    for (let attempt = 0; attempt < 2; attempt++) {
      const previous = process.env.PI_OFFLINE; process.env.PI_OFFLINE = "1";
      const adapter = createPiAdapter({ ...f.descriptor, sessionId: randomUUID() });
      if (previous === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = previous;
      try {
        await adapter.start();
        const state = await adapter.getState();
        assert.equal(state.model?.provider, "defaults-probe"); assert.equal(state.model?.id, "offline-reasoner");
        assert.equal(state.thinkingLevel, "high"); assert.equal(state.messageCount, 0);
        await adapter.setThinkingLevel("low");
      } finally { await adapter.stop(); }
      assert.equal(readFileSync(join(agent, "settings.json"), "utf8"), settings, "session-only RPC controls must not rewrite shared defaults");
    }
  });

  it("creates and restarts the full exact empty ID with observed extension cwd and external history", { timeout: 30_000 }, async () => {
    const f = fixture();
    for (let attempt = 0; attempt < 2; attempt++) {
      const adapter = createPiAdapter(f.descriptor);
      try {
        await adapter.start();
        const state = await adapter.getState();
        assert.equal(state.sessionId, f.descriptor.sessionId);
        assert.equal(state.messageCount, 0);
        assert.equal(f.context().sessionId, f.descriptor.sessionId);
        assert.equal(f.context().cwd, f.descriptor.executionRoot);
        assert.equal(f.context().sessionCwd, f.descriptor.executionRoot);
        assert.ok(state.sessionFile?.startsWith(f.descriptor.historyRoot));
        assert.equal(existsSync(state.sessionFile!), false, "empty identity survives without a transcript");
      } finally { await adapter.stop(); }
    }
  });

  it("resumes an exact supported transcript, respects lifecycle cancellation, and round-trips extension UI", { timeout: 30_000 }, async () => {
    const f = fixture();
    const session = SessionManager.create(f.descriptor.executionRoot, f.descriptor.historyRoot, { id: f.descriptor.sessionId });
    session.appendMessage({ role: "user", content: "Fixture transcript; never send to a model", timestamp: 1 });
    const file = session.getSessionFile()!;
    const adapter = createPiAdapter({ ...f.descriptor, sessionFile: file });
    try {
      await adapter.start();
      assert.equal((await adapter.getState()).sessionId, f.descriptor.sessionId);
      const request = new Promise<Record<string, unknown>>((resolve) => adapter.onEvent((event) => {
        const value = event as Record<string, unknown>;
        if (value.type === "extension_ui_request" && value.method === "confirm") resolve(value);
      }));
      const prompt = adapter.prompt("/probe-ui");
      const ui = await request;
      await adapter.respondToUI({ id: String(ui.id), confirmed: true });
      await prompt;
      await waitFor(() => existsSync(join(f.descriptor.installationRoot, ".kiva", "agent", "probe-response.json")));
      assert.deepEqual(JSON.parse(readFileSync(join(f.descriptor.installationRoot, ".kiva", "agent", "probe-response.json"), "utf8")), { confirmed: true });
      assert.deepEqual(await adapter.newSession(), { cancelled: true });
      assert.deepEqual(await adapter.switchSession(file), { cancelled: true });
      assert.equal((await adapter.getState()).sessionId, f.descriptor.sessionId);
    } finally { await adapter.stop(); }
    const header = JSON.parse(readFileSync(file, "utf8").split("\n", 1)[0]);
    assert.equal(header.cwd, f.descriptor.executionRoot);
    assert.equal(header.id, f.descriptor.sessionId);
  });

  it("quarantines supported extension-driven identity replacement before serving a foreign snapshot", { timeout: 30_000 }, async () => {
    const f = fixture();
    const hub = new RuntimeHub(() => createPiAdapter(f.descriptor), 60_000, f.descriptor);
    try {
      await hub.execute({ type: "initialize" });
      await hub.execute({ type: "prompt", message: "/probe-drift" }).catch(() => {});
      await waitFor(() => hub.lifecycle() === "quarantined");
      await assert.rejects(hub.execute({ type: "initialize" }), /identity|quarantin/i);
      assert.equal(hub.lifecycle(), "quarantined");
      assert.equal(hub.passiveSnapshot()?.session.id, f.descriptor.sessionId);
    } finally { await hub.stop(); }
  });
});

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("Probe timed out"); await new Promise((resolve) => setTimeout(resolve, 10)); }
}
