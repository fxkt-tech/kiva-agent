import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { readModelCatalog, saveModelDefaults } from "./model-catalog";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

it("reads configured model options without a Pi owner, network, credential writes or secret fields", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiva-model-catalog-"));
  const agent = join(root, ".kiva", "agent");
  mkdirSync(agent, { recursive: true });
  const config = JSON.stringify({ providers: { "catalog-fixture": {
    baseUrl: "https://example.invalid/v1", api: "openai-completions", apiKey: "fixture-secret-never-return",
    models: [{ id: "configured-model", name: "Configured model", reasoning: true, input: ["text"], contextWindow: 8192, maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  } } });
  writeFileSync(join(agent, "models.json"), config);
  const previousFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Model discovery must stay offline"); };
  try {
    const catalog = await readModelCatalog(root);
    assert.deepEqual(catalog.models.find((model) => model.provider === "catalog-fixture"), { provider: "catalog-fixture", id: "configured-model", reasoning: true, contextWindow: 8192, thinkingLevels: ["off", "minimal", "low", "medium", "high"] });
    assert.equal(JSON.stringify(catalog).includes("fixture-secret-never-return"), false);
    assert.equal(JSON.stringify(catalog).includes("example.invalid"), false);
    assert.equal(networkCalls, 0);
    assert.deepEqual(readdirSync(agent), ["models.json"]);
    assert.equal(readFileSync(join(agent, "models.json"), "utf8"), config);
    assert.deepEqual(readdirSync(join(root, ".kiva")), ["agent"]);
  } finally { globalThis.fetch = previousFetch; }
});

it("saves both defaults through Pi, keeps unrelated settings, and reloads without any runtime", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiva-model-defaults-")), agent = join(root, ".kiva", "agent");
  mkdirSync(agent, { recursive: true });
  writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { "saved-fixture": { api: "openai-completions", baseUrl: "https://example.invalid/v1", apiKey: "secret", models: [{ id: "reasoning", name: "Reasoning", reasoning: true, input: ["text"], contextWindow: 8192, maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }, { id: "plain", name: "Plain", reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
  const path = join(agent, "settings.json");
  writeFileSync(path, JSON.stringify({ theme: "custom", packages: ["fixture-package"], retry: { enabled: false }, modelThinkingLevels: { "saved-fixture/reasoning": "low", "other/model": "high" } }));
  const choice = { provider: "saved-fixture", modelId: "reasoning", thinkingLevel: "high" };
  const saved = await saveModelDefaults(root, choice);
  assert.deepEqual(saved.defaults, choice);
  assert.deepEqual((await readModelCatalog(root)).defaults, choice);
  const pi = SettingsManager.create(root, agent);
  assert.equal(pi.getDefaultProvider(), choice.provider);
  assert.equal(pi.getDefaultModel(), choice.modelId);
  assert.equal(pi.getDefaultThinkingLevel(), "high");
  assert.equal(pi.getModelThinkingLevel(choice.provider, choice.modelId), "high", "a stale per-model override must not win over the saved choice");
  const stored = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(stored.theme, "custom"); assert.deepEqual(stored.packages, ["fixture-package"]); assert.deepEqual(stored.retry, { enabled: false }); assert.equal(stored.modelThinkingLevels["other/model"], "high");
  assert.equal(existsSync(join(root, ".kiva/sessions")), false);
  let applied = 0;
  const previous = readFileSync(path, "utf8");
  await assert.rejects(saveModelDefaults(root, { ...choice, modelId: "plain" }, async () => { applied++; }), /不支持/);
  await assert.rejects(saveModelDefaults(root, { ...choice, modelId: "missing" }, async () => { applied++; }), /不可用/);
  assert.equal(applied, 0); assert.equal(readFileSync(path, "utf8"), previous);
  await assert.rejects(saveModelDefaults(root, choice, async () => { throw new Error("current session busy"); }), /busy/);
  assert.equal(readFileSync(path, "utf8"), previous);
  await saveModelDefaults(root, { ...choice, modelId: "plain", thinkingLevel: "off" });
  assert.equal((await readModelCatalog(root)).defaults?.thinkingLevel, "off");
  writeFileSync(path, '{"secret":"do-not-expose",invalid');
  await assert.rejects(saveModelDefaults(root, choice), (error: unknown) => error instanceof Error && error.message.includes("默认设置") && !error.message.includes("do-not-expose"));
  assert.equal(readFileSync(path, "utf8"), '{"secret":"do-not-expose",invalid');
});


it("keeps a missing model configuration passive and reports malformed configuration without exposing it", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiva-model-catalog-empty-"));
  await readModelCatalog(root);
  assert.deepEqual(readdirSync(root), []);
  const agent = join(root, ".kiva", "agent");
  mkdirSync(agent, { recursive: true });
  writeFileSync(join(agent, "models.json"), '{"secret":"fixture-secret",invalid');
  await assert.rejects(readModelCatalog(root), (error: unknown) => error instanceof Error && error.message.includes("模型配置") && !error.message.includes("fixture-secret"));
});
