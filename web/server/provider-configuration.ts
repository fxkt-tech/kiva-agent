import { ModelRuntime, CredentialSynchronizationError } from "@earendil-works/pi-coding-agent";
import { lstat, mkdir, mkdtemp, open, rename, rmdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isProviderDefinition, isProviderId, isSaveCredentialInput, type InstallationSettings, type ProviderCredentialStatus, type ProviderDefinition, type ProviderSettings } from "../shared/installation-settings";
import { agentDirectory, EditRevisions, isRecord, ownValue, readSettingsFile, settingsError, type FileSnapshot } from "./settings-files";

// Verified Pi 1.3.0 envApiKeyAuth single-secret flows. Ambient/multi-field providers stay read-only.
const standardKeys = new Map(Object.entries({ openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", google: "GEMINI_API_KEY", deepseek: "DEEPSEEK_API_KEY", groq: "GROQ_API_KEY", mistral: "MISTRAL_API_KEY", xai: "XAI_API_KEY", openrouter: "OPENROUTER_API_KEY", cerebras: "CEREBRAS_API_KEY", together: "TOGETHER_API_KEY", nvidia: "NVIDIA_API_KEY", fireworks: "FIREWORKS_API_KEY", baseten: "BASETEN_API_KEY", huggingface: "HF_TOKEN" }));
export const noWriteModelsStore = { read: async () => undefined, write: async (): Promise<never> => { throw settingsError(); }, delete: async (): Promise<never> => { throw settingsError(); } };
const emptyCredentials = { read: async () => undefined, list: async () => [], modify: async (): Promise<never> => { throw settingsError(); }, delete: async (): Promise<never> => { throw settingsError(); } };
const readOnlyReason = "此配置使用高级或不受支持的格式，请在配置文件中管理。";
const hasCommand = (value: unknown): boolean => typeof value === "string" && value.startsWith("!");
const simpleStoredCredential = (value: unknown) => isRecord(value) && value.type === "api_key" && typeof value.key === "string" && value.env === undefined && !hasCommand(value.key) && Object.keys(value).every((key) => ["type", "key"].includes(key));
const require = createRequire(import.meta.url);
function packageVersion(path: () => string, fallback: string) {
  try { const value: unknown = JSON.parse(readFileSync(path(), "utf8")); if (isRecord(value) && typeof value.version === "string" && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.version)) return value.version; } catch { /* Controlled pinned-version fallback only. */ }
  return fallback;
}
const versions = {
  app: packageVersion(() => require.resolve("../../package.json"), "0.1.0"),
  pi: packageVersion(() => join(dirname(require.resolve("@earendil-works/pi-coding-agent")), "..", "package.json"), "1.3.0"),
};
function ambientConfigured(id: string) {
  if (id === "amazon-bedrock") return ["AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_BEARER_TOKEN_BEDROCK", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_WEB_IDENTITY_TOKEN_FILE"].some((key) => !!process.env[key]);
  if (id === "google-vertex") return ["GOOGLE_CLOUD_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS"].some((key) => !!process.env[key]);
  if (id === "anthropic") return ["ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_IDENTITY_TOKEN_FILE", "ANTHROPIC_ORGANIZATION_ID"].every((key) => !!process.env[key]);
  return false;
}
function environmentConfigured(id: string) {
  if (id === "anthropic") return ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN"].some((key) => !!process.env[key]);
  const environmentKey = standardKeys.get(id);
  return !!environmentKey && !!process.env[environmentKey];
}

export function configuredProvider(id: string, definition: Record<string, unknown> | undefined, credential: unknown) {
  if (isRecord(credential) && (credential.type === "oauth" || credential.type === "api_key" && (typeof credential.key === "string" && !!credential.key || isRecord(credential.env) && Object.keys(credential.env).length > 0))) return true;
  if (typeof definition?.apiKey === "string" && definition.apiKey) {
    if (hasCommand(definition.apiKey)) return true; // Presence only: never execute a configured command.
    const refs = [...definition.apiKey.matchAll(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g)];
    return refs.every((match) => !!process.env[match[1] ?? match[2]]);
  }
  return environmentConfigured(id) || ambientConfigured(id);
}

function safeDefinition(id: string, value: unknown): ProviderDefinition | undefined {
  if (!isRecord(value) || ["headers", "authHeader", "oauth", "modelOverrides"].some((key) => value[key] !== undefined) || hasCommand(value.apiKey) || !Array.isArray(value.models)) return;
  const models = value.models.map((model) => {
    if (!isRecord(model) || ["api", "baseUrl", "headers", "compat", "thinkingLevelMap", "samplingParams", "samplingParamsByThinkingLevel"].some((key) => model[key] !== undefined)) return undefined;
    return { id: model.id, ...(model.name === undefined ? {} : { name: model.name }), ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }), ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }), ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }), ...(model.input === undefined ? {} : { input: model.input }) };
  });
  const result = { id, api: value.api, baseUrl: value.baseUrl, models };
  return isProviderDefinition(result) ? result : undefined;
}

export class ProviderConfiguration {
  readonly revisions = new EditRevisions();
  constructor(readonly root: string) {}
  async sources() {
    const [models, auth] = await Promise.all([readSettingsFile(this.root, "models.json"), readSettingsFile(this.root, "auth.json")]);
    if (models.value.providers !== undefined && !isRecord(models.value.providers)) throw settingsError();
    const providers = (models.value.providers ?? {}) as Record<string, unknown>;
    if (Object.keys(providers).length > 200 || Object.entries(providers).some(([id, provider]) => !isProviderId(id) || !isRecord(provider))) throw settingsError();
    return { models, auth, providers };
  }
  async metadata(): Promise<InstallationSettings> {
    let source: Awaited<ReturnType<ProviderConfiguration["sources"]>> | undefined;
    try { source = await this.sources(); } catch { /* Never serialize raw parser/storage details. */ }
    if (source) {
      const configured = await ModelRuntime.create({ modelsPath: join(await agentDirectory(this.root), "models.json"), refreshOnCreate: false, allowModelNetwork: false, credentials: emptyCredentials, modelsStore: noWriteModelsStore });
      if (configured.getError()) source = undefined;
    }
    const runtime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false, allowModelNetwork: false, credentials: emptyCredentials, modelsStore: noWriteModelsStore });
    const builtins = new Map(runtime.getProviders().map((provider) => [provider.id, provider]));
    const providers: ProviderSettings[] = [];
    for (const id of new Set([...builtins.keys(), ...Object.keys(source?.providers ?? {})])) {
      if (!isProviderId(id)) continue;
      const raw = source ? ownValue(source.providers, id) : undefined, configured = isRecord(raw) ? raw : undefined;
      const definition = safeDefinition(id, configured), builtin = builtins.get(id);
      const rawAuth = source ? ownValue(source.auth.value, id) : undefined;
      const credential = this.credential(id, configured, rawAuth, source?.auth, source?.models.fingerprint, !!source, !!builtin, !!definition);
      const editable = !!source && !!definition && (rawAuth === undefined || simpleStoredCredential(rawAuth));
      providers.push({ id, name: configured ? id : builtin?.name ?? id, kind: configured ? "configured" : "builtin", editable, ...(!editable ? { readOnlyReason: configured ? readOnlyReason : "内置提供方的定义由 Pi 管理；可新增兼容提供方。" } : {}), ...(definition ? { definition } : {}), credential });
    }
    providers.sort((a, b) => a.id.localeCompare(b.id));
    return { revision: this.revisions.issue("definitions", source?.models.fingerprint ?? "unavailable"), providers, canAddProvider: !!source, ...(!source ? { issue: "配置文件不可用或不安全，编辑已禁用；修复后请重新加载。" } : {}), versions, check: { status: "ok", checkedAt: new Date().toISOString() } };
  }
  private credential(id: string, definition: Record<string, unknown> | undefined, raw: unknown, auth: FileSnapshot | undefined, modelsFingerprint: string | undefined, valid: boolean, builtin: boolean, compatible: boolean): ProviderCredentialStatus {
    let source: ProviderCredentialStatus["source"] = "none", safe = valid && (builtin ? standardKeys.has(id) : compatible);
    if (raw !== undefined) {
      if (!isRecord(raw)) { source = "unsupported"; safe = false; }
      else if (raw.type === "oauth") { source = "oauth"; safe = false; }
      else if (!simpleStoredCredential(raw)) { source = "unsupported"; safe = false; }
      else source = "stored";
    } else if (typeof definition?.apiKey === "string") { source = "configuration"; if (hasCommand(definition.apiKey)) safe = false; }
    else if (environmentConfigured(id)) source = "environment";
    else if (ambientConfigured(id)) { source = "unsupported"; safe = false; }
    if (definition && !compatible) safe = false;
    return { source, configured: configuredProvider(id, definition, raw), editable: safe, revision: this.revisions.issue(`credential:${id}`, `${auth?.fingerprint ?? "unavailable"}:${modelsFingerprint ?? "unavailable"}`), ...(!safe ? { readOnlyReason } : {}) };
  }
  async saveDefinition(definition: ProviderDefinition, revision: string) {
    if (!isProviderDefinition(definition)) throw settingsError("invalid_provider", "提供方配置无效，请检查接口、地址和模型字段。", 400);
    const preflight = await this.sources();
    this.revisions.require("definitions", preflight.models.fingerprint, revision);
    const preflightProvider = (await this.metadata()).providers.find((entry) => entry.id === definition.id);
    if (ownValue(preflight.providers, definition.id) !== undefined && !preflightProvider?.editable) throw settingsError("provider_read_only", readOnlyReason);
    const directory = await agentDirectory(this.root, true), directoryStat = await lstat(directory);
    const lockPath = join(directory, ".models.json.kiva-lock");
    try { await mkdir(lockPath, { mode: 0o700 }); } catch { throw settingsError("configuration_locked", "配置正在由另一进程保存，请稍后重试。"); }
    let temporary: string | undefined;
    try {
      const before = await this.sources();
      this.revisions.require("definitions", before.models.fingerprint, revision);
      const raw = ownValue(before.providers, definition.id);
      if (raw !== undefined && !safeDefinition(definition.id, raw)) throw settingsError("provider_read_only", readOnlyReason);
      const builtin = (await this.metadata()).providers.find((entry) => entry.id === definition.id);
      if (raw !== undefined && !builtin?.editable) throw settingsError("provider_read_only", readOnlyReason);
      if (raw === undefined && builtin?.kind === "builtin") throw settingsError("provider_read_only", "请为自定义接口使用新的提供方 ID。");
      const existingAuth = ownValue(before.auth.value, definition.id);
      if (existingAuth !== undefined && !simpleStoredCredential(existingAuth)) throw settingsError("provider_read_only", readOnlyReason);
      if (raw === undefined && Object.keys(before.providers).length >= 200) throw settingsError("provider_limit", "提供方数量已达到上限。");
      const previous = isRecord(raw) ? raw : {}, previousModels = Array.isArray(previous.models) ? previous.models : [];
      const merged = previousModels.map((model) => isRecord(model) ? { ...model } : model);
      for (const model of definition.models) {
        const index = merged.findIndex((existing) => isRecord(existing) && existing.id === model.id);
        if (index < 0) merged.push({ ...model }); else merged[index] = { ...(merged[index] as Record<string, unknown>), ...model };
      }
      if (merged.length > 200) throw settingsError("model_limit", "模型数量已达到上限。");
      const value = { ...before.models.value, providers: { ...before.providers, [definition.id]: { ...previous, api: definition.api, baseUrl: definition.baseUrl, models: merged } } };
      const serialized = `${JSON.stringify(value, null, 2)}\n`;
      await this.validateCandidate(serialized);
      const current = await this.sources(), currentDirectory = await lstat(await agentDirectory(this.root));
      if (current.models.fingerprint !== before.models.fingerprint || current.auth.fingerprint !== before.auth.fingerprint || currentDirectory.dev !== directoryStat.dev || currentDirectory.ino !== directoryStat.ino) throw settingsError("configuration_conflict", "配置已变化，请重新加载后再试。");
      temporary = join(directory, `.models-${randomUUID()}.tmp`);
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(serialized, "utf8"); await file.sync(); } finally { await file.close(); }
      if ((await this.sources()).models.fingerprint !== before.models.fingerprint) throw settingsError("configuration_conflict", "配置已变化，请重新加载后再试。");
      await rename(temporary, join(directory, "models.json")); temporary = undefined;
    } catch (error) { if (error instanceof Error && "status" in error) throw error; throw settingsError("provider_save_failed", "提供方配置保存失败，请检查权限后重试。", 500); }
    finally { if (temporary) await unlink(temporary).catch(() => {}); await rmdir(lockPath).catch(() => {}); }
  }
  private async validateCandidate(serialized: string) {
    const directory = await mkdtemp(join(tmpdir(), "kiva-model-validation-")), path = join(directory, "models.json");
    try {
      const file = await open(path, "wx", 0o600); try { await file.writeFile(serialized); } finally { await file.close(); }
      const runtime = await ModelRuntime.create({ modelsPath: path, refreshOnCreate: false, allowModelNetwork: false, credentials: emptyCredentials, modelsStore: noWriteModelsStore });
      if (runtime.getError()) throw settingsError("invalid_provider", "Pi 无法读取合并后的模型配置，原文件未更改。", 409);
    } finally { await unlink(path).catch(() => {}); await rmdir(directory).catch(() => {}); }
  }
  async saveCredential(id: string, apiKey: string, revision: string): Promise<{ synchronizationFailed: boolean }> {
    if (!isProviderId(id) || !isSaveCredentialInput({ apiKey, revision })) throw settingsError("invalid_credential", "API Key 格式无效；不支持命令、变量或多行内容。", 400);
    const metadata = await this.metadata(), provider = metadata.providers.find((entry) => entry.id === id);
    if (!provider?.credential.editable) throw settingsError("credential_read_only", readOnlyReason);
    if (provider.credential.revision !== revision) throw settingsError("configuration_conflict", "认证配置已变化，请重新加载后再试。");
    const directory = await agentDirectory(this.root, true), lockPath = join(directory, ".models.json.kiva-lock");
    try { await mkdir(lockPath, { mode: 0o700 }); } catch { throw settingsError("configuration_locked", "配置正在由另一进程保存，请稍后重试。"); }
    try { return await this.writeCredential(id, apiKey, revision, directory); }
    finally { await rmdir(lockPath).catch(() => {}); }
  }
  private async writeCredential(id: string, apiKey: string, revision: string, directory: string): Promise<{ synchronizationFailed: boolean }> {
    const before = await this.sources(), provider = (await this.metadata()).providers.find((entry) => entry.id === id);
    if (!provider?.credential.editable) throw settingsError("credential_read_only", readOnlyReason);
    if (provider.credential.revision !== revision) throw settingsError("configuration_conflict", "认证配置已变化，请重新加载后再试。");
    // Metadata/creation performs no auth refresh or command resolution. Public login owns private-file locking.
    const runtime = await ModelRuntime.create({ authPath: join(directory, "auth.json"), modelsPath: join(directory, "models.json"), refreshOnCreate: false, allowModelNetwork: false, modelsStore: noWriteModelsStore });
    const current = await this.sources();
    // Pi's public default storage creates a private empty auth file on first
    // construction. This explicit key action may perform that initialization;
    // anything other than the expected empty creation is a stale-source conflict.
    const initializedEmptyAuth = !before.auth.exists && current.auth.exists && Object.keys(current.auth.value).length === 0;
    if (current.auth.fingerprint !== before.auth.fingerprint && !initializedEmptyAuth || current.models.fingerprint !== before.models.fingerprint) throw settingsError("configuration_conflict", "配置已变化，请重新加载后再试。");
    let prompts = 0;
    try {
      await runtime.login(id, "api_key", { prompt: async (prompt) => { if (++prompts !== 1 || prompt.type !== "secret") throw settingsError("credential_flow_unsupported"); return apiKey; }, notify: () => { throw settingsError("credential_flow_unsupported"); } });
      return { synchronizationFailed: false };
    } catch (error) {
      if (error instanceof CredentialSynchronizationError) return { synchronizationFailed: true };
      throw settingsError("credential_save_failed", "API Key 保存未确认，请重新加载认证状态后重试。", 500);
    }
  }
}
