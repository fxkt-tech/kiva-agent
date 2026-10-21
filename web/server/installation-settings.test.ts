import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { CredentialSynchronizationError, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { InstallationSettingsService } from "./installation-settings";
import { RuntimeManager } from "./runtime-manager";
import { WorkspaceRegistry } from "./workspace-registry";
import { SessionRepository } from "./session-repository";
import { createScopedTransport } from "./scoped-transport";
import { isProviderDefinition, isSaveCredentialInput, decodeInstallationCatalog, decodeInstallationSettings, decodeProviderSaveResult, type ProviderDefinition } from "../shared/installation-settings";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kiva-installation-settings-")), agent = join(root, ".kiva", "agent");
  mkdirSync(agent, { recursive: true });
  const registry = new WorkspaceRegistry(root), repository = new SessionRepository(registry);
  let adapters = 0;
  const manager = new RuntimeManager(repository, () => { adapters++; throw new Error("Settings must never acquire Pi"); });
  const service = new InstallationSettingsService(root, manager);
  const file = (name: string) => join(agent, name);
  return { root, agent, registry, repository, manager, service, file, adapters: () => adapters };
}
const definition: ProviderDefinition = { id: "test-compatible", api: "openai-completions", baseUrl: "http://127.0.0.1:9999/v1", models: [{ id: "test-model", name: "Fixture", reasoning: true, input: ["text", "image"], contextWindow: 8192, maxTokens: 2048 }] };
const provider = async (f: ReturnType<typeof fixture>, id = definition.id) => (await f.service.read()).providers.find((entry) => entry.id === id)!;
const code = (expected: string) => (error: unknown) => error instanceof Error && "code" in error && error.code === expected;

it("strictly decodes bounded provider and credential writes, rejecting duplicate/unsafe identities and interpolated secrets", () => {
  assert.equal(isProviderDefinition(definition), true);
  for (const invalid of [ { ...definition, id: "__proto__" }, { ...definition, headers: {} }, { ...definition, baseUrl: "https://user:secret@example.invalid" }, { ...definition, baseUrl: "https://example.invalid?key=secret" }, { ...definition, baseUrl: "file:///private/config" }, { ...definition, models: [{ id: "a" }, { id: "a" }] }, { ...definition, models: [{ id: "a", maxTokens: 0 }] }, { ...definition, models: [{ id: "a", input: ["text", "text"] }] } ]) assert.equal(isProviderDefinition(invalid), false);
  for (const apiKey of ["", "   ", "!echo secret", "$SECRET", "prefix${SECRET}", "escaped$$value", "$!not-literal", "line\nkey", "a".repeat(8193)]) assert.equal(isSaveCredentialInput({ revision: "a".repeat(32), apiKey }), false);
  assert.equal(isSaveCredentialInput({ revision: "a".repeat(32), apiKey: "sk-normal_test.123/+=" }), true);
  assert.equal(isSaveCredentialInput({ revision: "a".repeat(32), apiKey: "sk-literal_$9/+=" }), true);
  const token = "a".repeat(32), secret = "decoder-secret-sentinel";
  const settings = { revision: token, canAddProvider: true, versions: { app: "0.1.0", pi: "1.3.0", apiKey: secret }, check: { status: "ok", checkedAt: "2026-10-21" }, providers: [{ id: "safe", name: "Safe", kind: "builtin", editable: false, apiKey: secret, credential: { configured: true, source: "stored", editable: true, revision: token, key: secret } }] };
  assert.equal(JSON.stringify(decodeInstallationSettings(settings)).includes(secret), false);
  assert.equal(decodeInstallationSettings({ ...settings, providers: [...settings.providers, ...settings.providers] }), undefined);
  const catalog = { revision: token, models: [{ provider: "safe", id: "model", contextWindow: 8192, reasoning: false, apiKey: secret }] };
  assert.equal(JSON.stringify(decodeInstallationCatalog(catalog)).includes(secret), false);
  assert.equal(decodeInstallationCatalog({ ...catalog, models: [{ provider: "safe", id: "model" }] }), undefined);
});

it("reads installation metadata/catalog offline without projects, resolving credentials, writes, network or command execution", async () => {
  const f = fixture(), marker = join(f.root, "command-ran");
  const secret = "secret-never-project-3fca";
  writeFileSync(f.file("models.json"), JSON.stringify({ unrelated: { preserved: true }, providers: { [definition.id]: { ...definition, id: undefined, apiKey: `!touch '${marker}'` }, unsafe: { api: "openai-completions", baseUrl: `https://user:${secret}@example.invalid/v1?secret=${secret}`, apiKey: secret, models: [{ id: "redacted" }] } } }));
  writeFileSync(f.file("auth.json"), JSON.stringify({ openai: { type: "api_key", key: `!touch '${marker}'` }, anthropic: { type: "oauth", access: secret, refresh: secret, expires: 0 } }));
  const before = readdirSync(f.agent).map((name) => [name, readFileSync(f.file(name), "utf8")]);
  const fetch = globalThis.fetch; let network = 0;
  globalThis.fetch = async () => { network++; throw new Error(secret); };
  try {
    const settings = await f.service.read(), catalog = await f.service.catalog();
    assert.ok(decodeInstallationSettings(settings)); assert.ok(decodeInstallationCatalog(catalog));
    assert.equal(settings.providers.find((p) => p.id === definition.id)?.editable, false);
    assert.equal(settings.providers.find((p) => p.id === "unsafe")?.definition, undefined);
    assert.equal(settings.providers.find((p) => p.id === "openai")?.credential.editable, false);
    assert.equal(settings.providers.find((p) => p.id === "anthropic")?.credential.source, "oauth");
    assert.equal(JSON.stringify({ settings, catalog }).includes(secret), false);
    assert.equal(JSON.stringify({ settings, catalog }).includes(marker), false);
    assert.equal(network, 0); assert.equal(existsSync(marker), false); assert.equal(f.adapters(), 0);
    assert.deepEqual(readdirSync(f.agent).map((name) => [name, readFileSync(f.file(name), "utf8")]), before);
  } finally { globalThis.fetch = fetch; await f.manager.stop(); }
});

it("persists definitions and keys separately through public Pi login, preserving unknown fields and unrelated auth", async () => {
  const f = fixture(), sentinel = "unrelated-oauth-secret";
  writeFileSync(f.file("models.json"), JSON.stringify({ customTop: { retained: true }, providers: { other: { api: "openai-completions", baseUrl: "https://example.invalid/v1", apiKey: "other-secret", models: [{ id: "other", cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } }] } } }));
  writeFileSync(f.file("auth.json"), JSON.stringify({ anthropic: { type: "oauth", refresh: sentinel, access: sentinel, expires: 0 }, unrelated: { type: "api_key", key: "!never-run-this" } }));
  const authBefore = readFileSync(f.file("auth.json"), "utf8");
  const fetch = globalThis.fetch; let network = 0; globalThis.fetch = async () => { network++; throw new Error("Network forbidden"); };
  try {
    const first = await f.service.saveProvider(definition, (await f.service.read()).revision);
    assert.ok(decodeProviderSaveResult(first)); assert.equal(first.settings.providers.find((p) => p.id === definition.id)?.credential.configured, false);
    assert.equal(readFileSync(f.file("auth.json"), "utf8"), authBefore);
    const source = JSON.parse(readFileSync(f.file("models.json"), "utf8")); source.providers[definition.id].customProvider = { keep: true }; source.providers[definition.id].models[0].customModel = { keep: true }; source.providers[definition.id].models[0].cost = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 };
    writeFileSync(f.file("models.json"), JSON.stringify(source));
    const editing = await f.service.read();
    await f.service.saveProvider({ ...definition, models: [{ id: "second", reasoning: false }] }, editing.revision);
    const stored = JSON.parse(readFileSync(f.file("models.json"), "utf8"));
    assert.deepEqual(stored.customTop, { retained: true }); assert.deepEqual(stored.providers[definition.id].customProvider, { keep: true }); assert.deepEqual(stored.providers[definition.id].models[0].customModel, { keep: true }); assert.equal(stored.providers[definition.id].models.length, 2); assert.equal(stored.providers.other.apiKey, "other-secret");
    assert.equal(lstatSync(f.file("models.json")).mode & 0o777, 0o600);
    const saved = await f.service.saveCredential(definition.id, "sk-fixture-literal_123", (await provider(f)).credential.revision);
    assert.equal(saved.settings.providers.find((p) => p.id === definition.id)?.credential.source, "stored");
    assert.equal(saved.catalog?.models.some((model) => model.provider === definition.id && model.id === "second"), true);
    assert.equal(JSON.stringify(saved).includes("sk-fixture-literal_123"), false);
    const auth = JSON.parse(readFileSync(f.file("auth.json"), "utf8"));
    assert.deepEqual(auth[definition.id], { type: "api_key", key: "sk-fixture-literal_123" }); assert.equal(auth.anthropic.refresh, sentinel); assert.equal(auth.unrelated.key, "!never-run-this");
    const pi = await ModelRuntime.create({ authPath: f.file("auth.json"), modelsPath: f.file("models.json"), refreshOnCreate: false, allowModelNetwork: false, modelsStore: { read: async () => undefined, write: async () => { throw new Error("no cache"); }, delete: async () => { throw new Error("no cache"); } } });
    assert.equal((await pi.getAuth(definition.id))?.auth.apiKey, "sk-fixture-literal_123");
    assert.equal(network, 0); assert.equal(f.adapters(), 0);
  } finally { globalThis.fetch = fetch; await f.manager.stop(); }
});

it("uses opaque stale revisions and refuses corrupt, duplicate, advanced, symlink and substituted writes", async () => {
  const f = fixture();
  try {
    const original = await f.service.read();
    await f.service.saveProvider(definition, original.revision);
    const before = readFileSync(f.file("models.json"), "utf8");
    await assert.rejects(f.service.saveProvider({ ...definition, baseUrl: "https://changed.invalid" }, original.revision), code("configuration_conflict"));
    const metadata = await f.service.read();
    renameSync(f.file("models.json"), f.file("old.json")); writeFileSync(f.file("models.json"), before);
    await assert.rejects(f.service.saveProvider(definition, metadata.revision), code("configuration_conflict"));
    assert.equal(readFileSync(f.file("models.json"), "utf8"), before);
    writeFileSync(f.file("models.json"), '{"providers":{},"providers":{}}');
    assert.equal((await f.service.read()).canAddProvider, false);
    await assert.rejects(f.service.saveProvider(definition, metadata.revision), code("duplicate_configuration"));
    writeFileSync(f.file("models.json"), '{"secret":"must-not-leak",bad');
    assert.equal((await f.service.read()).canAddProvider, false);
    await assert.rejects(f.service.catalog(), (error: unknown) => error instanceof Error && !error.message.includes("must-not-leak"));
    const advanced = { providers: { [definition.id]: { api: definition.api, baseUrl: definition.baseUrl, models: definition.models, headers: { Authorization: "advanced-secret" } } } };
    writeFileSync(f.file("models.json"), JSON.stringify(advanced));
    const readOnly = await f.service.read(); assert.equal((await provider(f)).editable, false);
    await assert.rejects(f.service.saveProvider(definition, readOnly.revision), code("provider_read_only"));
    assert.deepEqual(JSON.parse(readFileSync(f.file("models.json"), "utf8")), advanced);
    renameSync(f.file("models.json"), f.file("symlink-target.json")); symlinkSync(f.file("symlink-target.json"), f.file("models.json"));
    assert.equal((await f.service.read()).canAddProvider, false);
    await assert.rejects(f.service.saveProvider(definition, readOnly.revision), code("unsafe_configuration"));
  } finally { await f.manager.stop(); }
});

it("rejects stale first saves before creating directories and coordinates provider/key writers across services", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiva-settings-no-directories-"));
  const manager = new RuntimeManager({ read: () => { throw new Error("No sessions"); }, resolveExecution: () => { throw new Error("No owners"); }, rename: () => {}, updateControls: () => {} }, () => { throw new Error("No Pi"); });
  const service = new InstallationSettingsService(root, manager);
  try {
    await service.read(); assert.deepEqual(readdirSync(root), []);
    await assert.rejects(service.saveProvider(definition, "invalid-but-token-shaped-123456"), code("configuration_conflict"));
    assert.deepEqual(readdirSync(root), []);
    await assert.rejects(service.saveCredential("openai", "sk-invalid-stale", "invalid-but-token-shaped-123456"), code("configuration_conflict"));
    assert.deepEqual(readdirSync(root), []);
    await service.saveProvider(definition, (await service.read()).revision);
    const second = new InstallationSettingsService(root, manager), metadata = await second.read();
    const agent = join(root, ".kiva", "agent"), before = readFileSync(join(agent, "models.json"), "utf8"), lock = join(agent, ".models.json.kiva-lock");
    mkdirSync(lock);
    try {
      await assert.rejects(second.saveProvider(definition, metadata.revision), code("configuration_locked"));
      await assert.rejects(second.saveCredential(definition.id, "sk-fixture", metadata.providers.find((p) => p.id === definition.id)!.credential.revision), code("configuration_locked"));
      assert.equal(readFileSync(join(agent, "models.json"), "utf8"), before); assert.equal(existsSync(join(agent, "auth.json")), false);
    } finally { rmdirSync(lock); }
    const keyRevision = metadata.providers.find((p) => p.id === definition.id)!.credential.revision;
    await service.saveCredential(definition.id, "sk-first", (await service.read()).providers.find((p) => p.id === definition.id)!.credential.revision);
    await assert.rejects(second.saveCredential(definition.id, "sk-stale", keyRevision), code("configuration_conflict"));
  } finally { await manager.stop(); }
});

it("preserves OAuth/advanced auth and rejects stale credential candidates without rewriting unrelated files", async () => {
  const f = fixture();
  try {
    await f.service.saveProvider(definition, (await f.service.read()).revision);
    const stale = (await provider(f)).credential.revision;
    writeFileSync(f.file("auth.json"), JSON.stringify({ [definition.id]: { type: "oauth", refresh: "sentinel", access: "sentinel", expires: 0 } }));
    const before = readFileSync(f.file("auth.json"), "utf8");
    await assert.rejects(f.service.saveCredential(definition.id, "replacement", stale), code("credential_read_only"));
    assert.equal(readFileSync(f.file("auth.json"), "utf8"), before);
    writeFileSync(f.file("auth.json"), JSON.stringify({ [definition.id]: { type: "api_key", key: "literal", env: { CUSTOM: "secret" } } }));
    assert.equal((await provider(f)).credential.editable, false);
    writeFileSync(f.file("auth.json"), "{}"); const revision = (await provider(f)).credential.revision;
    writeFileSync(f.file("auth.json"), JSON.stringify({ unrelated: { type: "api_key", key: "secret" } }));
    await assert.rejects(f.service.saveCredential(definition.id, "replacement", revision), code("configuration_conflict"));
  } finally { await f.manager.stop(); }
});

it("marks declared ambient-cloud authentication read-only without resolving files or returning environment values", async () => {
  const f = fixture(), names = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_IDENTITY_TOKEN_FILE", "ANTHROPIC_ORGANIZATION_ID"], previous = names.map((name) => process.env[name]);
  try {
    for (const name of names.slice(0, 3)) delete process.env[name];
    for (const name of names.slice(3)) process.env[name] = "ambient-secret-sentinel";
    const metadata = await f.service.read(), entry = metadata.providers.find((p) => p.id === "anthropic")!;
    assert.equal(entry.credential.configured, true); assert.equal(entry.credential.source, "unsupported"); assert.equal(entry.credential.editable, false);
    assert.equal(JSON.stringify(metadata).includes("ambient-secret-sentinel"), false);
    await assert.rejects(f.service.saveCredential("anthropic", "sk-not-ambient", entry.credential.revision), code("credential_read_only"));
    assert.equal(existsSync(f.file("auth.json")), false);
  } finally { names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }); await f.manager.stop(); }
});

it("treats harmless prototype-like provider names as own identities, not inherited configuration", async () => {
  const f = fixture();
  try {
    const toString = { ...definition, id: "toString" };
    await f.service.saveProvider(toString, (await f.service.read()).revision);
    const entry = await provider(f, "toString");
    assert.equal(entry.editable, true); assert.equal(entry.credential.source, "none"); assert.equal(entry.credential.editable, true);
    const saved = await f.service.saveCredential("toString", "sk-literal_$9/+=", entry.credential.revision);
    assert.equal(saved.settings.providers.find((p) => p.id === "toString")?.credential.source, "stored");
    assert.equal(saved.catalog?.models.some((model) => model.provider === "toString"), true);
    const runtime = await ModelRuntime.create({ authPath: f.file("auth.json"), modelsPath: f.file("models.json"), refreshOnCreate: false, allowModelNetwork: false, modelsStore: { read: async () => undefined, write: async () => { throw new Error("No model cache"); }, delete: async () => { throw new Error("No model cache"); } } });
    assert.equal((await runtime.getAuth("toString"))?.auth.apiKey, "sk-literal_$9/+=");
  } finally { await f.manager.stop(); }
});

it("reports post-persistence credential/catalog refresh failure without leaking keys or raw causes", async () => {
  const f = fixture(), secret = "sk-private-sync-error-sentinel", login = ModelRuntime.prototype.login;
  try {
    await f.service.saveProvider(definition, (await f.service.read()).revision);
    ModelRuntime.prototype.login = async function (...args) {
      const credential = await login.apply(this, args);
      throw new CredentialSynchronizationError(args[0], "login", credential, { cause: new Error(secret) });
    };
    const saved = await f.service.saveCredential(definition.id, secret, (await provider(f)).credential.revision);
    assert.equal(saved.settings.providers.find((p) => p.id === definition.id)?.credential.configured, true);
    assert.match(saved.warning!, /已保存.*同步失败/); assert.equal(JSON.stringify(saved).includes(secret), false);
    assert.equal(JSON.parse(readFileSync(f.file("auth.json"), "utf8"))[definition.id].key, secret);
    const catalog = f.service.catalog;
    f.service.catalog = async () => { throw new Error(secret); };
    const result = await f.service.saveProvider({ ...definition, baseUrl: "https://new.invalid/v1" }, (await f.service.read()).revision);
    assert.equal(result.catalog, undefined); assert.match(result.warning!, /已保存.*刷新/); assert.equal(JSON.stringify(result).includes(secret), false);
    f.service.catalog = catalog;
    ModelRuntime.prototype.login = async () => { throw new Error(secret); };
    const before = readFileSync(f.file("auth.json"), "utf8");
    await assert.rejects(f.service.saveCredential(definition.id, "sk-another-private", (await provider(f)).credential.revision), (error: unknown) => error instanceof Error && !error.message.includes(secret) && !error.message.includes("sk-another-private"));
    assert.equal(readFileSync(f.file("auth.json"), "utf8"), before);
  } finally { ModelRuntime.prototype.login = login; await f.manager.stop(); }
});

it("serves installation routes without projects, enforces origin/type/strict identities and shares legacy default persistence", async () => {
  const f = fixture(); f.registry.initialize(); for (const project of f.registry.list()) f.registry.remove(project.id);
  const origins: string[] = [], transport = createScopedTransport({ registry: f.registry, repository: f.repository, manager: f.manager, allowedOrigins: origins });
  const server = createServer(async (request, response) => { await transport.handle(request, response); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; origins.push(origin);
  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(origin + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  try {
    assert.equal(f.registry.list().length, 0);
    const metadataResponse = await request("/api/settings"), metadata = await metadataResponse.json();
    assert.equal(metadataResponse.status, 200); assert.match(metadataResponse.headers.get("cache-control")!, /no-store/);
    assert.equal((await request("/api/settings/models")).status, 200);
    assert.equal((await request("/api/settings/providers", { revision: metadata.revision, definition }, { origin: "https://evil.invalid" })).status, 403);
    assert.equal((await request("/api/settings/providers", { revision: metadata.revision, definition }, { "content-type": "text/plain" })).status, 415);
    assert.equal((await request("/api/settings?path=secret")).status, 400);
    assert.equal((await request("/api/settings", {})).status, 405);
    assert.equal((await request("/api/settings/providers", { revision: metadata.revision, definition: { ...definition, unexpected: true } })).status, 400);
    const duplicate = await fetch(origin + "/api/settings/providers", { method: "POST", headers: { "content-type": "application/json" }, body: `{"revision":"${metadata.revision}","revision":"${metadata.revision}","definition":${JSON.stringify(definition)}}` }); assert.equal(duplicate.status, 400);
    assert.equal((await request("/api/settings/providers", { revision: metadata.revision, definition })).status, 200);
    const settings = await (await request("/api/settings")).json(), credential = settings.providers.find((p: { id: string }) => p.id === definition.id).credential;
    const saved = await request(`/api/settings/providers/${definition.id}/credential`, { revision: credential.revision, apiKey: "sk-fixture-test" }); assert.equal(saved.status, 200, JSON.stringify(await saved.json()));
    const catalog = await (await request("/api/settings/models")).json();
    const choice = { provider: definition.id, modelId: definition.models[0].id, thinkingLevel: "high", revision: catalog.revision };
    assert.equal((await request("/api/settings/defaults", choice)).status, 200);
    assert.equal((await request("/api/settings/defaults", choice)).status, 409);
    const stored = JSON.parse(readFileSync(f.file("settings.json"), "utf8")); assert.equal(stored.defaultProvider, definition.id); assert.equal(stored.modelThinkingLevels[`${definition.id}/${definition.models[0].id}`], "high");
    assert.equal(f.adapters(), 0); assert.equal(existsSync(join(f.root, ".kiva", "sessions")), false);
  } finally { await f.manager.stop(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
