import { randomBytes } from "node:crypto";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AuthInteraction, AuthPrompt, LoginOptions, OAuthCredential } from "@earendil-works/pi-ai";
import { authorizationErrors, isAuthorizationPending, isOpenAIAuthorizationUrl, type AuthorizationAttempt, type AuthorizationError, type AuthorizationInput, type AuthorizationSaveResult, type BeginAuthorizationInput } from "../shared/provider-authorization";
import { WorkspaceError } from "../shared/workspace-contract";
import { noWriteModelsStore } from "./provider-configuration";
import { settingsError } from "./settings-files";

export type OpenAIAuthorizationDriver = (interaction: AuthInteraction, options: LoginOptions) => Promise<OAuthCredential>;
export interface AuthorizationOptions { driver?: OpenAIAuthorizationDriver; timeoutMs?: number }
interface AuthorizationCallbacks {
  preflight(revision: string): Promise<unknown>;
  initialize(): Promise<string>;
  commit(credential: OAuthCredential, revision: string, signal: AbortSignal, beginCommit: () => void): Promise<AuthorizationSaveResult>;
}
interface Attempt {
  snapshot: AuthorizationAttempt;
  operationId: string;
  revision: string;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  prompt?: { id: string; resolve(value: string): void; reject(reason: unknown): void };
  done?: Promise<void>;
}
const opaqueId = () => randomBytes(24).toString("base64url");
const failure = () => settingsError("authorization_failed", "ChatGPT 授权未完成，请重试。", 502);

async function piAuthorization(interaction: AuthInteraction, options: LoginOptions): Promise<OAuthCredential> {
  const runtime = await ModelRuntime.create({
    modelsPath: null, refreshOnCreate: false, allowModelNetwork: false, modelsStore: noWriteModelsStore,
    credentials: { read: async () => undefined, list: async () => [], modify: async () => { throw failure(); }, delete: async () => { throw failure(); } },
  });
  const oauth = runtime.getProvider("openai")?.auth.oauth;
  if (!oauth || !interaction.signal) throw failure();
  // Public provider-owned login stages credentials and settles only after callback cleanup.
  // Do not wrap it in an abort race: a retry must wait for its loopback listener to close.
  return oauth.login({ ...interaction, signal: interaction.signal }, options);
}

/** One bounded login-attempt owner; no long operation holds settings/runtime admission. */
export class ProviderAuthorization {
  private attempts = new Map<string, Attempt>();
  private active?: Attempt;
  private closed = false;
  private readonly timeoutMs: number;
  private readonly driver: OpenAIAuthorizationDriver;
  constructor(private readonly callbacks: AuthorizationCallbacks, options: AuthorizationOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10 * 60_000;
    this.driver = options.driver ?? piAuthorization;
  }
  async begin(input: BeginAuthorizationInput): Promise<AuthorizationAttempt> {
    if (this.closed) throw settingsError("stopping", "服务正在关闭，请稍后重试。", 503);
    const previous = [...this.attempts.values()].find((attempt) => attempt.operationId === input.operationId);
    if (previous) {
      if (previous.revision !== input.revision) throw settingsError("configuration_conflict");
      return this.project(previous);
    }
    await this.callbacks.preflight(input.revision);
    // Preflight may yield to another tab: reserve only after rechecking the active attempt.
    const duplicate = [...this.attempts.values()].find((attempt) => attempt.operationId === input.operationId);
    if (duplicate) { if (duplicate.revision !== input.revision) throw settingsError("configuration_conflict"); return this.project(duplicate); }
    if (this.active) throw settingsError("authorization_busy", "已有 ChatGPT 授权正在进行，请完成或取消后重试。");
    if (this.closed) throw settingsError("stopping", "服务正在关闭，请稍后重试。", 503);
    for (const [id, attempt] of this.attempts) if (!isAuthorizationPending(attempt.snapshot.status) && (Date.parse(attempt.snapshot.expiresAt) < Date.now() || this.attempts.size >= 32)) this.attempts.delete(id);
    const attempt: Attempt = {
      snapshot: { id: opaqueId(), status: "starting", expiresAt: new Date(Date.now() + this.timeoutMs).toISOString() },
      operationId: input.operationId, revision: input.revision, controller: new AbortController(),
      timer: setTimeout(() => { if (attempt.snapshot.status !== "committing") this.abort(attempt, "expired"); }, this.timeoutMs),
    };
    attempt.timer.unref();
    this.attempts.set(attempt.snapshot.id, attempt); this.active = attempt;
    attempt.done = this.run(attempt);
    return this.project(attempt);
  }
  read(id: string) { return this.project(this.find(id)); }
  submit(id: string, input: AuthorizationInput) {
    const attempt = this.find(id);
    if (attempt.snapshot.status !== "awaiting_authorization" || attempt.prompt?.id !== input.promptId) throw settingsError("authorization_prompt_stale", "授权步骤已变化，请等待状态更新后重试。");
    attempt.prompt.resolve(input.callbackUrl);
    return this.project(attempt);
  }
  async cancel(id: string) {
    const attempt = this.find(id);
    this.abort(attempt, "cancelled");
    await attempt.done;
    return this.project(attempt);
  }
  async close() {
    this.closed = true;
    for (const attempt of this.attempts.values()) this.abort(attempt, "cancelled");
    await Promise.allSettled([...this.attempts.values()].map((attempt) => attempt.done));
    this.attempts.clear();
  }
  private find(id: string) {
    const attempt = this.attempts.get(id);
    if (!attempt) throw settingsError("authorization_not_found", "授权记录已过期，请重新登录。", 404);
    return attempt;
  }
  private project(attempt: Attempt): AuthorizationAttempt { return { ...attempt.snapshot }; }
  private abort(attempt: Attempt, status: "cancelled" | "expired") {
    if (!isAuthorizationPending(attempt.snapshot.status) || attempt.snapshot.status === "committing") return;
    attempt.snapshot = { id: attempt.snapshot.id, expiresAt: attempt.snapshot.expiresAt, status, ...(status === "expired" ? { error: "authorization_expired" as const } : {}) };
    attempt.controller.abort(settingsError("authorization_expired"));
  }
  private prompt(attempt: Attempt, prompt: AuthPrompt): Promise<string> {
    if (prompt.type !== "manual_code" || attempt.controller.signal.aborted) return Promise.reject(failure());
    const signal = prompt.signal ? AbortSignal.any([attempt.controller.signal, prompt.signal]) : attempt.controller.signal;
    const id = opaqueId();
    return new Promise((resolve, reject) => {
      const cleanup = () => { signal.removeEventListener("abort", abort); if (attempt.prompt?.id === id) { attempt.prompt = undefined; delete attempt.snapshot.promptId; } };
      const abort = () => { cleanup(); reject(signal.reason); };
      attempt.prompt = { id, resolve: (value) => { cleanup(); resolve(value); }, reject: (reason) => { cleanup(); reject(reason); } };
      attempt.snapshot = { ...attempt.snapshot, status: "awaiting_authorization", promptId: id };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  private async run(attempt: Attempt) {
    try {
      const deviceId = await this.callbacks.initialize();
      attempt.controller.signal.throwIfAborted();
      const credential = await this.driver({
        signal: attempt.controller.signal,
        prompt: (prompt) => this.prompt(attempt, prompt),
        notify: (event) => {
          if (attempt.controller.signal.aborted || !isAuthorizationPending(attempt.snapshot.status)) return;
          if (event.type === "auth_url") {
            if (!isOpenAIAuthorizationUrl(event.url)) throw failure();
            attempt.snapshot = { ...attempt.snapshot, status: "awaiting_authorization", authorizationUrl: event.url };
          }
        },
      }, { getDeviceId: () => deviceId, agentName: "KivA" });
      attempt.controller.signal.throwIfAborted();
      const result = await this.callbacks.commit(credential, attempt.revision, attempt.controller.signal, () => {
        attempt.controller.signal.throwIfAborted();
        attempt.snapshot = { id: attempt.snapshot.id, expiresAt: attempt.snapshot.expiresAt, status: "committing" };
      });
      attempt.snapshot = { id: attempt.snapshot.id, expiresAt: attempt.snapshot.expiresAt, status: "succeeded", ...("refreshRequired" in result ? { refreshRequired: true } : { result }) };
    } catch (error) {
      if (attempt.snapshot.status !== "cancelled" && attempt.snapshot.status !== "expired") {
        const code: AuthorizationError = error instanceof WorkspaceError && authorizationErrors.includes(error.code as AuthorizationError) ? error.code as AuthorizationError : error instanceof Error && /Port 1455 is in use/.test(error.message) ? "authorization_port_busy" : "authorization_failed";
        attempt.snapshot = { id: attempt.snapshot.id, expiresAt: attempt.snapshot.expiresAt, status: code === "authorization_expired" ? "expired" : "failed", error: code };
      }
    } finally {
      clearTimeout(attempt.timer);
      attempt.prompt?.reject(failure());
      if (this.active === attempt) this.active = undefined;
    }
  }
}
