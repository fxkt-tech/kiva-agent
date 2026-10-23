import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import type { AuthInteraction, OAuthCredential } from "@earendil-works/pi-ai";
import { decodeAuthorizationAttempt, decodeAuthorizationSaveResult, isAuthorizationInput, isBeginAuthorizationInput, type AuthorizationAttempt } from "../shared/provider-authorization";
import { WorkspaceError } from "../shared/workspace-contract";
import { InstallationSettingsService } from "./installation-settings";
import { RuntimeManager } from "./runtime-manager";
import { SessionRepository } from "./session-repository";
import { WorkspaceRegistry } from "./workspace-registry";
import { createScopedTransport } from "./scoped-transport";
import type { AuthorizationOptions, OpenAIAuthorizationDriver } from "./provider-authorization";

const secret = "OAUTH_SECRET_MUST_NEVER_ESCAPE";
const credential: OAuthCredential = { type: "oauth", access: secret, refresh: `${secret}_refresh`, expires: Date.now() + 86_400_000, clientId: "client-kept-private", customField: { retained: true } };
const callbackUrl = "http://127.0.0.1:1455/auth/callback?code=private-code&state=private-state&client_id=registered-client";
const authorizationUrl = "https://auth.openai.com/api/accounts/authorize?state=private-state";
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 2));
const code = (expected: string) => (error: unknown) => error instanceof WorkspaceError && error.code === expected;
const interactive: OpenAIAuthorizationDriver = async (interaction, options) => {
  assert.match(options.getDeviceId!(), /^[0-9a-f-]{36}$/);
  assert.equal(options.agentName, "KivA");
  interaction.notify({ type: "auth_url", url: authorizationUrl });
  assert.equal(await interaction.prompt({ type: "manual_code", message: secret, signal: interaction.signal }), callbackUrl);
  return credential;
};
function fixture(options: AuthorizationOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), "kiva-openai-auth-")), agent = join(root, ".kiva", "agent");
  mkdirSync(agent, { recursive: true });
  const registry = new WorkspaceRegistry(root), repository = new SessionRepository(registry);
  const manager = new RuntimeManager(repository, () => { throw new Error("OAuth must never acquire Pi"); });
  const service = new InstallationSettingsService(root, manager, { driver: interactive, ...options });
  const file = (name: string) => join(agent, name);
  const revision = async () => (await service.read()).providers.find((entry) => entry.id === "openai")!.credential.revision;
  const begin = async (operationId = "operation_unique_123456") => service.authorization.begin({ operationId, revision: await revision() });
  return { root, agent, registry, repository, manager, service, file, revision, begin };
}
async function state(f: ReturnType<typeof fixture>, id: string, status: AuthorizationAttempt["status"]) {
  for (let i = 0; i < 1000; i++) { const snapshot = f.service.authorization.read(id); if (snapshot.status === status) return snapshot; if (snapshot.status === "failed") assert.fail(`unexpected auth failure: ${snapshot.error}`); await tick(); }
  assert.fail(`did not reach ${status}`);
}
async function complete(f: ReturnType<typeof fixture>, id: string) {
  const waiting = await state(f, id, "awaiting_authorization");
  assert.ok(waiting.promptId);
  f.service.authorization.submit(id, { promptId: waiting.promptId, callbackUrl });
  return state(f, id, "succeeded");
}

it("validates authorization inputs and projects only safe status/result fields", () => {
  assert.equal(isBeginAuthorizationInput({ operationId: "valid_operation_1234", revision: "valid_revision_1234" }), true);
  assert.equal(isBeginAuthorizationInput({ operationId: "short", revision: "valid_revision_1234" }), false);
  assert.equal(isAuthorizationInput({ promptId: "valid_prompt_123456", callbackUrl }), true);
  for (const url of ["https://evil.invalid/callback?code=x&state=y", callbackUrl.replace("127.0.0.1", "localhost"), `${callbackUrl}#secret`]) assert.equal(isAuthorizationInput({ promptId: "valid_prompt_123456", callbackUrl: url }), false);
  const safe = decodeAuthorizationAttempt({ id: "valid_attempt_12345", status: "awaiting_authorization", expiresAt: new Date().toISOString(), authorizationUrl, access: secret, refresh: secret });
  assert.ok(safe); assert.equal(JSON.stringify(safe).includes(secret), false);
  assert.equal(decodeAuthorizationAttempt({ ...safe, authorizationUrl: "https://evil.invalid" }), undefined);
  assert.equal(decodeAuthorizationAttempt({ ...safe, status: "cancelled" }), undefined);
  const saved = { id: "valid_attempt_12345", status: "succeeded", expiresAt: new Date().toISOString(), refreshRequired: true };
  assert.deepEqual(decodeAuthorizationAttempt(saved), saved);
  assert.equal(decodeAuthorizationAttempt({ ...saved, refreshRequired: undefined }), undefined);
  assert.equal(decodeAuthorizationAttempt({ ...saved, result: { access: secret } }), undefined);
  assert.equal(decodeAuthorizationAttempt({ ...saved, status: "failed" }), undefined);
  assert.deepEqual(decodeAuthorizationSaveResult({ refreshRequired: true }), { refreshRequired: true });
  assert.equal(decodeAuthorizationSaveResult({ refreshRequired: true, access: secret }), undefined);
});

it("reports saved OAuth and sign-out truthfully when metadata projection fails after persistence", async () => {
  const f = fixture();
  const metadata = f.service.providers.metadata.bind(f.service.providers);
  const persist = f.service.providers.mutateOpenAIAuthorization.bind(f.service.providers);
  let failMetadata = false;
  f.service.providers.metadata = async () => { if (failMetadata) throw new Error(secret); return metadata(); };
  f.service.providers.mutateOpenAIAuthorization = async (...args) => { await persist(...args); failMetadata = true; };
  try {
    const start = await f.begin();
    const saved = await complete(f, start.id);
    assert.equal(saved.status, "succeeded");
    assert.equal(saved.refreshRequired, true);
    assert.equal(saved.result, undefined);
    assert.ok(decodeAuthorizationAttempt(saved));
    assert.equal(JSON.stringify(saved).includes(secret), false);
    assert.deepEqual(JSON.parse(readFileSync(f.file("auth.json"), "utf8")).openai, credential);
    failMetadata = false;
    const revision = await f.revision();
    const removed = await f.service.logoutOpenAI(revision);
    assert.deepEqual(removed, { refreshRequired: true });
    assert.equal(JSON.parse(readFileSync(f.file("auth.json"), "utf8")).openai, undefined);
  } finally { await f.service.close(); await f.manager.stop(); }
});

it("sanitizes authorization preflight failures before they reach the transport", async () => {
  const f = fixture();
  f.service.providers.requireOpenAIAuthorization = async () => { throw new Error(secret); };
  try {
    await assert.rejects(f.begin(), (error: unknown) => error instanceof WorkspaceError && error.code === "settings_unavailable" && !error.message.includes(secret));
    assert.equal(existsSync(f.file("auth.json")), false);
    assert.equal(existsSync(f.file("settings.json")), false);
  } finally { await f.service.close(); await f.manager.stop(); }
});

it("keeps passive metadata offline, supports idempotent begin, safely persists OAuth and refreshes models without changing defaults", async () => {
  const f = fixture();
  const defaults = { defaultProvider: "unrelated", defaultModel: "keep-model", defaultThinkingLevel: "high" };
  writeFileSync(f.file("settings.json"), JSON.stringify(defaults));
  writeFileSync(f.file("auth.json"), JSON.stringify({ unrelated: { type: "api_key", key: "keep-key" }, "openai-codex": { type: "oauth", access: "legacy", refresh: "legacy", expires: 0 } }));
  const before = readFileSync(f.file("auth.json"), "utf8");
  try {
    const metadata = await f.service.read();
    assert.deepEqual(metadata.providers.find((entry) => entry.id === "openai")?.authorization, { canLogin: true, canLogout: false });
    assert.equal(readFileSync(f.file("auth.json"), "utf8"), before);
    let admissions = 0; const admit = f.manager.withProviderMutation.bind(f.manager);
    f.manager.withProviderMutation = (id, operation) => { admissions++; return admit(id, operation); };
    const start = await f.begin();
    const waiting = await state(f, start.id, "awaiting_authorization");
    assert.equal(admissions, 0, "browser waiting must never enter runtime mutation admission");
    assert.equal((await f.service.authorization.begin({ operationId: "operation_unique_123456", revision: await f.revision() })).id, start.id);
    assert.equal(f.service.authorization.read(start.id).promptId, waiting.promptId);
    assert.equal(readFileSync(f.file("auth.json"), "utf8"), before);
    const saved = await complete(f, start.id);
    assert.equal(admissions, 1);
    assert.equal(JSON.stringify(saved).includes(secret), false);
    assert.equal(JSON.stringify(saved).includes("private-code"), false);
    assert.ok(saved.result?.catalog?.models.some((model) => model.provider === "openai"));
    const auth = JSON.parse(readFileSync(f.file("auth.json"), "utf8"));
    assert.deepEqual(auth.openai, credential); assert.equal(auth.unrelated.key, "keep-key"); assert.equal(auth["openai-codex"].access, "legacy");
    const settings = JSON.parse(readFileSync(f.file("settings.json"), "utf8"));
    assert.equal(settings.defaultProvider, defaults.defaultProvider); assert.equal(settings.defaultModel, defaults.defaultModel); assert.equal(settings.defaultThinkingLevel, "high"); assert.match(settings.deviceId, /^[0-9a-f-]{36}$/);
    assert.equal(existsSync(f.file("auth.json.lock")), false); assert.equal(existsSync(f.file(".models.json.kiva-lock")), false);
    const id = settings.deviceId;
    await f.service.logoutOpenAI(await f.revision());
    const loggedOut = JSON.parse(readFileSync(f.file("auth.json"), "utf8"));
    assert.equal(loggedOut.openai, undefined); assert.equal(loggedOut.unrelated.key, "keep-key");
    const second = await f.begin("another_operation_123456");
    await state(f, second.id, "awaiting_authorization");
    assert.equal(JSON.parse(readFileSync(f.file("settings.json"), "utf8")).deviceId, id);
    await f.service.authorization.cancel(second.id);
  } finally { await f.service.close(); await f.manager.stop(); }
});

it("cancels without replacing a key, ignores late events and waits for driver cleanup before retry", async () => {
  const cleanup = deferred<void>(); let interaction!: AuthInteraction;
  const f = fixture({ driver: async (input) => { interaction = input; input.notify({ type: "auth_url", url: authorizationUrl }); try { await input.prompt({ type: "manual_code", message: "callback", signal: input.signal }); return credential; } finally { await cleanup.promise; } } });
  writeFileSync(f.file("auth.json"), JSON.stringify({ openai: { type: "api_key", key: "keep-key" } }));
  try {
    const start = await f.begin(); const waiting = await state(f, start.id, "awaiting_authorization");
    let cancelled = false; const cancelling = f.service.authorization.cancel(start.id).then((result) => { cancelled = true; return result; });
    await tick(); assert.equal(cancelled, false);
    await assert.rejects(f.begin("second_operation_123456"), code("authorization_busy"));
    cleanup.resolve(); assert.equal((await cancelling).status, "cancelled");
    interaction.notify({ type: "auth_url", url: authorizationUrl });
    assert.equal(f.service.authorization.read(start.id).status, "cancelled");
    assert.throws(() => f.service.authorization.submit(start.id, { promptId: waiting.promptId!, callbackUrl }), code("authorization_prompt_stale"));
    assert.equal(JSON.parse(readFileSync(f.file("auth.json"), "utf8")).openai.key, "keep-key");
    const retry = await f.begin("third_operation_123456"); await state(f, retry.id, "awaiting_authorization"); await f.service.authorization.cancel(retry.id);
  } finally { cleanup.resolve(); await f.service.close(); await f.manager.stop(); }
});

it("expires and shuts down pending attempts without writing credentials", async () => {
  const f = fixture({ timeoutMs: 30 });
  try {
    const start = await f.begin(); await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(f.service.authorization.read(start.id).status, "expired");
    assert.equal(existsSync(f.file("auth.json")), false);
  } finally { await f.service.close(); await f.manager.stop(); }
});

it("preserves advanced/overridden/symlink auth and cooperating Pi locks", async () => {
  const f = fixture();
  try {
    writeFileSync(f.file("models.json"), JSON.stringify({ providers: { openai: { baseUrl: "https://custom.invalid/v1" } } }));
    assert.equal((await f.service.read()).providers.find((entry) => entry.id === "openai")?.authorization?.canLogin, false);
    await assert.rejects(f.begin(), code("authorization_unavailable"));
    writeFileSync(f.file("models.json"), JSON.stringify({ providers: {} }));
    writeFileSync(f.file("auth.json"), JSON.stringify({ openai: { type: "api_key", key: "!echo protected-command" } }));
    await assert.rejects(f.begin(), code("authorization_unavailable"));
    writeFileSync(f.file("auth.json"), JSON.stringify({ openai: { type: "api_key", key: "keep-key" } }));
    mkdirSync(f.file("auth.json.lock"));
    const start = await f.begin(); const waiting = await state(f, start.id, "awaiting_authorization");
    f.service.authorization.submit(start.id, { promptId: waiting.promptId!, callbackUrl });
    for (let i = 0; i < 1000 && f.service.authorization.read(start.id).status !== "failed"; i++) await tick();
    assert.equal(f.service.authorization.read(start.id).error, "configuration_locked");
    assert.equal(existsSync(f.file("auth.json.lock")), true, "another owner's lock must remain");
    assert.equal(JSON.parse(readFileSync(f.file("auth.json"), "utf8")).openai.key, "keep-key");
    const linked = fixture(); const target = join(linked.root, "protected.json"); writeFileSync(target, "{}"); symlinkSync(target, linked.file("auth.json"));
    try { await assert.rejects(linked.begin(), code("unsafe_configuration")); assert.equal(readFileSync(target, "utf8"), "{}"); } finally { await linked.service.close(); await linked.manager.stop(); }
  } finally { await f.service.close(); await f.manager.stop(); }
});

it("rejects external credential edits and busy-provider commits, while cancellation after commit reports saved truthfully", async () => {
  const f = fixture();
  try {
    const start = await f.begin(); const waiting = await state(f, start.id, "awaiting_authorization");
    writeFileSync(f.file("auth.json"), JSON.stringify({ openai: { type: "api_key", key: "externally-replaced" } }));
    f.service.authorization.submit(start.id, { promptId: waiting.promptId!, callbackUrl });
    for (let i = 0; i < 1000 && f.service.authorization.read(start.id).status !== "failed"; i++) await tick();
    assert.equal(f.service.authorization.read(start.id).error, "configuration_conflict");
    assert.equal(JSON.parse(readFileSync(f.file("auth.json"), "utf8")).openai.key, "externally-replaced");
    const original = f.manager.withProviderMutation.bind(f.manager);
    f.manager.withProviderMutation = async () => { throw new WorkspaceError("provider_busy", secret, 409); };
    const busy = await f.begin("busy_operation_123456"); const busyWaiting = await state(f, busy.id, "awaiting_authorization");
    f.service.authorization.submit(busy.id, { promptId: busyWaiting.promptId!, callbackUrl });
    for (let i = 0; i < 1000 && f.service.authorization.read(busy.id).status !== "failed"; i++) await tick();
    assert.equal(f.service.authorization.read(busy.id).error, "provider_busy");
    assert.equal(JSON.stringify(f.service.authorization.read(busy.id)).includes(secret), false);
    f.manager.withProviderMutation = original;
    const persist = f.service.providers.mutateOpenAIAuthorization.bind(f.service.providers), release = deferred<void>();
    f.service.providers.mutateOpenAIAuthorization = async (...args) => { await release.promise; return persist(...args); };
    const saving = await f.begin("saving_operation_123456"), savingWaiting = await state(f, saving.id, "awaiting_authorization");
    f.service.authorization.submit(saving.id, { promptId: savingWaiting.promptId!, callbackUrl }); await state(f, saving.id, "committing");
    const cancel = f.service.authorization.cancel(saving.id); release.resolve(); assert.equal((await cancel).status, "succeeded");
    const stale = await f.revision(); writeFileSync(f.file("auth.json"), JSON.stringify({ openai: { type: "api_key", key: "newer-key" } }));
    await assert.rejects(f.service.logoutOpenAI(stale), code("authorization_unavailable"));
    assert.equal(JSON.parse(readFileSync(f.file("auth.json"), "utf8")).openai.key, "newer-key");
  } finally { await f.service.close(); await f.manager.stop(); }
});

it("exposes bounded settings OAuth routes with strict bodies/origin checks and safe failure responses", async () => {
  const f = fixture();
  const transport = createScopedTransport({ registry: f.registry, repository: f.repository, manager: f.manager, allowedOrigins: ["http://allowed.test"], authorization: { driver: async () => { throw new Error(secret); } } });
  const server = createServer((request, response) => { void transport.handle(request, response); }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, origin = "http://allowed.test") => fetch(base + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const route = "/api/settings/providers/openai/oauth";
  try {
    const metadata = await (await fetch(base + "/api/settings")).json(); const revision = metadata.providers.find((entry: { id: string }) => entry.id === "openai").credential.revision;
    assert.equal((await post(route, { operationId: "valid_operation_1234", revision }, "https://evil.invalid")).status, 403);
    assert.equal((await post(route, { operationId: "valid_operation_1234", revision, access: secret })).status, 400);
    const started = await post(route, { operationId: "valid_operation_1234", revision }); assert.equal(started.status, 202); const attempt = await started.json();
    assert.equal((await fetch(base + route + "/" + attempt.id, { headers: { origin: "https://evil.invalid" } })).status, 403);
    assert.equal((await post(`${route}/${attempt.id}/input`, { promptId: "valid_prompt_123456", callbackUrl: "https://evil.invalid" })).status, 400);
    for (let i = 0; i < 100; i++) { const snapshot = await (await fetch(`${base}${route}/${attempt.id}`)).json(); if (snapshot.status === "failed") { assert.equal(snapshot.error, "authorization_failed"); assert.equal(JSON.stringify(snapshot).includes(secret), false); break; } await tick(); }
    assert.equal((await fetch(`${base}${route}/unknown_attempt_12345`)).status, 404);
    assert.equal(existsSync(f.file("auth.json")), false);
  } finally { await transport.close(); await f.service.close(); await f.manager.stop(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
