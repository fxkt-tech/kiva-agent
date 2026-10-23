import { decodeProviderSaveResult, type ProviderSaveResult } from "./installation-settings";

export const authorizationErrors = ["authorization_failed", "authorization_port_busy", "authorization_expired", "authorization_busy", "authorization_unavailable", "configuration_conflict", "configuration_locked", "provider_busy", "unsafe_configuration", "settings_unavailable"] as const;
export type AuthorizationError = typeof authorizationErrors[number];
export type AuthorizationStatus = "starting" | "awaiting_authorization" | "committing" | "succeeded" | "cancelled" | "failed" | "expired";
export type AuthorizationSaveResult = ProviderSaveResult | { refreshRequired: true };
export interface AuthorizationAttempt {
  id: string;
  status: AuthorizationStatus;
  expiresAt: string;
  authorizationUrl?: string;
  promptId?: string;
  error?: AuthorizationError;
  result?: ProviderSaveResult;
  refreshRequired?: true;
}
export interface BeginAuthorizationInput { operationId: string; revision: string }
export interface AuthorizationInput { promptId: string; callbackUrl: string }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
export const isAuthorizationId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{16,100}$/.test(value);
export const isAuthorizationRevisionInput = (value: unknown): value is { revision: string } => record(value) && exact(value, ["revision"]) && isAuthorizationId(value.revision);
export const isBeginAuthorizationInput = (value: unknown): value is BeginAuthorizationInput => record(value) && exact(value, ["operationId", "revision"]) && isAuthorizationId(value.operationId) && isAuthorizationId(value.revision);
export function isOpenAIAuthorizationUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 16_000) return false;
  try { const url = new URL(value); return url.origin === "https://auth.openai.com" && url.pathname === "/api/accounts/authorize" && !url.username && !url.password && !url.hash; } catch { return false; }
}
export function isAuthorizationInput(value: unknown): value is AuthorizationInput {
  if (!record(value) || !exact(value, ["promptId", "callbackUrl"]) || !isAuthorizationId(value.promptId) || typeof value.callbackUrl !== "string" || value.callbackUrl.length > 20_000) return false;
  try { const url = new URL(value.callbackUrl); return url.origin === "http://127.0.0.1:1455" && url.pathname === "/auth/callback" && !url.username && !url.password && !url.hash && !!url.searchParams.get("code") && !!url.searchParams.get("state"); } catch { return false; }
}
export const isAuthorizationPending = (status: AuthorizationStatus) => status === "starting" || status === "awaiting_authorization" || status === "committing";
export function decodeAuthorizationSaveResult(value: unknown): AuthorizationSaveResult | undefined {
  if (record(value) && exact(value, ["refreshRequired"]) && value.refreshRequired === true) return { refreshRequired: true };
  return decodeProviderSaveResult(value);
}
export function decodeAuthorizationAttempt(value: unknown): AuthorizationAttempt | undefined {
  if (!record(value) || !isAuthorizationId(value.id) || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) return;
  if (!["starting", "awaiting_authorization", "committing", "succeeded", "cancelled", "failed", "expired"].includes(String(value.status))) return;
  const status = value.status as AuthorizationStatus;
  if (value.authorizationUrl !== undefined && (status !== "awaiting_authorization" || !isOpenAIAuthorizationUrl(value.authorizationUrl))) return;
  if (value.promptId !== undefined && (status !== "awaiting_authorization" || !isAuthorizationId(value.promptId))) return;
  if (value.error !== undefined && (!authorizationErrors.includes(value.error as AuthorizationError) || status !== "failed" && status !== "expired")) return;
  const result = value.result === undefined ? undefined : decodeProviderSaveResult(value.result);
  if (value.result !== undefined && !result) return;
  if (status === "succeeded" ? result ? value.refreshRequired !== undefined : value.refreshRequired !== true : value.result !== undefined || value.refreshRequired !== undefined) return;
  return { id: value.id, status, expiresAt: value.expiresAt, ...(value.authorizationUrl ? { authorizationUrl: value.authorizationUrl as string } : {}), ...(value.promptId ? { promptId: value.promptId as string } : {}), ...(value.error ? { error: value.error as AuthorizationError } : {}), ...(result ? { result } : {}), ...(value.refreshRequired === true ? { refreshRequired: true } : {}) };
}
