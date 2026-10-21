import { isModelConfiguration, type ModelCatalog, type ModelConfiguration } from "./model-configuration";

export const providerApis = ["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"] as const;
export type ProviderApi = typeof providerApis[number];
export interface ProviderModelDefinition { id: string; name?: string; contextWindow?: number; maxTokens?: number; reasoning?: boolean; input?: ("text" | "image")[] }
export interface ProviderDefinition { id: string; api: ProviderApi; baseUrl: string; models: ProviderModelDefinition[] }
export interface ProviderCredentialStatus { configured: boolean; source: "stored" | "configuration" | "environment" | "oauth" | "none" | "unsupported"; editable: boolean; revision: string; readOnlyReason?: string }
export interface ProviderSettings { id: string; name: string; kind: "builtin" | "configured"; editable: boolean; readOnlyReason?: string; definition?: ProviderDefinition; credential: ProviderCredentialStatus }
export interface InstallationSettings { revision: string; providers: ProviderSettings[]; canAddProvider: boolean; issue?: string; versions: { app: string; pi: string }; check: { status: "ok"; checkedAt: string } }
export interface InstallationModelCatalog extends ModelCatalog { revision: string }
export interface SaveDefaultsInput extends ModelConfiguration { revision: string }
export interface SaveProviderInput { revision: string; definition: ProviderDefinition }
export interface SaveCredentialInput { revision: string; apiKey: string }
export interface ProviderSaveResult { settings: InstallationSettings; catalog?: InstallationModelCatalog; warning?: string }

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((key) => keys.includes(key));
export const isProviderId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(v) && !["constructor", "prototype", "__proto__"].includes(v);
const text = (v: unknown, max = 500): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const revision = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(v);
export function isProviderDefinition(v: unknown): v is ProviderDefinition {
  if (!record(v) || !exact(v, ["id", "api", "baseUrl", "models"]) || !isProviderId(v.id) || !providerApis.includes(v.api as ProviderApi) || !text(v.baseUrl, 2000) || !Array.isArray(v.models) || v.models.length < 1 || v.models.length > 200) return false;
  try { const url = new URL(v.baseUrl); if (v.baseUrl !== v.baseUrl.trim() || v.baseUrl.includes("?") || v.baseUrl.includes("#") || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return false; } catch { return false; }
  const ids = new Set<string>();
  return v.models.every((m) => {
    if (!record(m) || !exact(m, ["id", "name", "contextWindow", "maxTokens", "reasoning", "input"]) || !text(m.id) || ["constructor", "prototype", "__proto__"].includes(m.id) || ids.has(m.id)) return false;
    ids.add(m.id);
    if (m.name !== undefined && !text(m.name)) return false;
    for (const key of ["contextWindow", "maxTokens"]) if (m[key] !== undefined && (!Number.isSafeInteger(m[key]) || (m[key] as number) <= 0 || (m[key] as number) > 1_000_000_000)) return false;
    if (m.reasoning !== undefined && typeof m.reasoning !== "boolean") return false;
    return m.input === undefined || Array.isArray(m.input) && m.input.length > 0 && m.input.length <= 2 && new Set(m.input).size === m.input.length && m.input.every((item) => item === "text" || item === "image");
  });
}
export const isSaveProviderInput = (v: unknown): v is SaveProviderInput => record(v) && exact(v, ["revision", "definition"]) && revision(v.revision) && isProviderDefinition(v.definition);
export const isSaveDefaultsInput = (v: unknown): v is SaveDefaultsInput => record(v) && exact(v, ["revision", "provider", "modelId", "thinkingLevel"]) && revision(v.revision) && isModelConfiguration(v);
// Pi resolves these templates/escapes on credential reads. Reject only syntax
// it would interpret; ordinary literal key characters (including e.g. $9) stay exact.
const interpretedKeySyntax = /\$(?:\$|!|\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/;
export const isSaveCredentialInput = (v: unknown): v is SaveCredentialInput => record(v) && exact(v, ["revision", "apiKey"]) && revision(v.revision) && text(v.apiKey, 8192) && v.apiKey.trim().length > 0 && !v.apiKey.startsWith("!") && !interpretedKeySyntax.test(v.apiKey);

export function decodeInstallationCatalog(v: unknown): InstallationModelCatalog | undefined {
  if (!record(v) || !revision(v.revision) || !Array.isArray(v.models) || v.models.length > 100_000) return;
  if (v.defaults !== undefined && !isModelConfiguration(v.defaults)) return;
  const ids = new Set<string>();
  if (!v.models.every((m) => { if (!record(m) || !text(m.provider) || !text(m.id) || typeof m.contextWindow !== "number" || !Number.isFinite(m.contextWindow) || typeof m.reasoning !== "boolean" || m.thinkingLevels !== undefined && (!Array.isArray(m.thinkingLevels) || m.thinkingLevels.length > 20 || !m.thinkingLevels.every((level) => text(level, 50)))) return false; const id = JSON.stringify([m.provider, m.id]); if (ids.has(id)) return false; ids.add(id); return true; })) return;
  const catalog = v as unknown as InstallationModelCatalog;
  return { revision: catalog.revision, models: catalog.models.map((model) => ({ provider: model.provider, id: model.id, contextWindow: model.contextWindow, reasoning: model.reasoning, ...(model.thinkingLevels ? { thinkingLevels: [...model.thinkingLevels] } : {}) })), ...(catalog.defaults ? { defaults: { provider: catalog.defaults.provider, modelId: catalog.defaults.modelId, thinkingLevel: catalog.defaults.thinkingLevel } } : {}) };
}
export function decodeInstallationSettings(v: unknown): InstallationSettings | undefined {
  if (!record(v) || !revision(v.revision) || typeof v.canAddProvider !== "boolean" || !record(v.versions) || !text(v.versions.app) || !text(v.versions.pi) || !record(v.check) || v.check.status !== "ok" || !text(v.check.checkedAt) || !Array.isArray(v.providers) || v.providers.length > 500 || v.issue !== undefined && !text(v.issue, 2000)) return;
  const ids = new Set<string>();
  if (!v.providers.every((p) => { if (!record(p) || !isProviderId(p.id) || ids.has(p.id) || !text(p.name) || !["builtin", "configured"].includes(p.kind as string) || typeof p.editable !== "boolean" || p.readOnlyReason !== undefined && !text(p.readOnlyReason, 2000) || p.definition !== undefined && (!isProviderDefinition(p.definition) || p.definition.id !== p.id) || !record(p.credential) || typeof p.credential.configured !== "boolean" || typeof p.credential.editable !== "boolean" || !revision(p.credential.revision) || !["stored", "configuration", "environment", "oauth", "none", "unsupported"].includes(p.credential.source as string) || p.credential.readOnlyReason !== undefined && !text(p.credential.readOnlyReason, 2000)) return false; ids.add(p.id); return true; })) return;
  const settings = v as unknown as InstallationSettings;
  return { revision: settings.revision, canAddProvider: settings.canAddProvider, ...(settings.issue ? { issue: settings.issue } : {}), versions: { app: settings.versions.app, pi: settings.versions.pi }, check: { status: "ok", checkedAt: settings.check.checkedAt }, providers: settings.providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, editable: p.editable, ...(p.readOnlyReason ? { readOnlyReason: p.readOnlyReason } : {}), ...(p.definition ? { definition: { id: p.definition.id, api: p.definition.api, baseUrl: p.definition.baseUrl, models: p.definition.models.map((model) => ({ ...model, ...(model.input ? { input: [...model.input] } : {}) })) } } : {}), credential: { configured: p.credential.configured, source: p.credential.source, editable: p.credential.editable, revision: p.credential.revision, ...(p.credential.readOnlyReason ? { readOnlyReason: p.credential.readOnlyReason } : {}) } })) };
}
export function decodeProviderSaveResult(v: unknown): ProviderSaveResult | undefined {
  if (!record(v)) return;
  const settings = decodeInstallationSettings(v.settings), catalog = v.catalog === undefined ? undefined : decodeInstallationCatalog(v.catalog);
  if (!settings || v.catalog !== undefined && !catalog || v.warning !== undefined && !text(v.warning, 2000)) return;
  return { settings, catalog, warning: v.warning as string | undefined };
}
