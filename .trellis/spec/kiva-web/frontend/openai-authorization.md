# OpenAI Authorization in Model Settings

## 1. Scope / Trigger

Settings → Models owns the explicit OpenAI / ChatGPT login surface. It uses the built-in `openai` provider's current Sign in with ChatGPT flow through Pi 1.3.0, then the existing installation catalog/model/default controls. Existing `openai-codex` credentials remain compatible; this surface does not introduce a legacy Codex login flow or replace Pi with Codex CLI/app-server.

Read this contract when changing authorization UI, attempts, settings transport, credential storage, provider capability projection, or runtime invalidation. [Global settings](./global-settings.md) remains authoritative for passive reads, existing API-key/provider edits, safe metadata/revisions, and session/default semantics.

## 2. Signatures

Installation-scoped HTTP endpoints live under `/api/settings/providers/openai/oauth`:

| Method and suffix | Input | Output |
| --- | --- | --- |
| `POST` base | `{operationId, revision}` | Safe authorization attempt |
| `GET /:attemptId` | Opaque attempt ID | Existing attempt snapshot; no OAuth/network side effects |
| `POST /:attemptId/input` | `{promptId, callbackUrl}` | Updated safe attempt |
| `POST /:attemptId/cancel` | Empty JSON object | Truthful cancelled/terminal/committing state |
| `POST /logout` | `{revision}` | `AuthorizationSaveResult = ProviderSaveResult \| {refreshRequired:true}` |

The authorization service and transport expose explicit cleanup for pending attempts, callbacks and timers. Tests inject a narrow OAuth driver into the same service composition; production has no fake-login environment mode.

## 3. Contracts

### Public data and passive reads

`ProviderSettings.authorization?: {canLogin:boolean, canLogout:boolean, reason?:string}` is projected through the existing settings decoder. Offer the new flow only for the built-in, unmodified `openai` provider and an absent or safely replaceable stored credential. Custom OpenAI endpoints/overrides and command-backed/unsupported auth remain protected. The existing API-key editor continues to reject OAuth replacement.

`AuthorizationAttempt` contains opaque `id`, `expiresAt`, `status`, and only the fields valid for that state. States are `starting`, `awaiting_authorization`, `committing`, `succeeded`, `cancelled`, `failed`, and `expired`. The waiting state may contain an allowlisted authorization URL and prompt ID. Success contains either a sanitized `ProviderSaveResult` or `refreshRequired:true` without a result when persistence succeeded but safe metadata confirmation failed; failure/expiry uses a fixed allowlisted error code. The two success shapes are mutually exclusive. Terminal states discard authorization URLs and prompt data.

One shared module owns request validation and attempt decoding. Never spread raw Pi notifications, credentials, token responses, or exceptions into browser-facing results. Status URLs contain opaque attempt IDs only. Manual callback URLs contain temporary authorization codes: send them in POST bodies, never logs/query strings/browser storage/diagnostics; clear the input after submission or a terminal result.

Settings/catalog/status reads cannot start login, refresh OAuth, initialize files/device IDs, resolve command-backed keys, acquire Pi owners, fetch remote models, or send model prompts. Opening Models must remain passive. A refreshed static Pi catalog does not certify account entitlement.

### Explicit login and storage

The feature obtains the built-in provider through public `ModelRuntime.getProvider("openai")` and invokes its public `provider.auth.oauth.login(interaction, options)` with a concrete AbortSignal. This stages the returned credential without persistent writes and waits for the provider callback server's cleanup before resolving cancellation. Do not wrap it in an early abort race: ModelRuntime.login itself can settle before provider cleanup completes. Pi owns PKCE, authorization/code exchange, OAuth-specific credential fields, refresh, and Responses transport. Pass a stable installation UUID from SettingsManager through `getDeviceId` and set `agentName: "KivA"`, which Pi maps to the OAuth query parameter `agent_name_hint=KivA`. Initialize/flush the identity only after explicit begin; cancellation may retain that non-secret installation ID.

Keep browser waiting, callback listeners, and remote OAuth requests outside the settings write queue and RuntimeManager admission. After staged login, run only the short credential commit under installation write coordination and `RuntimeManager.withProviderMutation("openai", ...)`. Recheck attempt activity, observed credential/configuration revision, provider capability, directory/file identity, and cancellation immediately before persistence. Busy/queued/transitioning OpenAI work rejects mutation; unrelated work is never stopped.

Use the public CredentialStore seam. The installed AuthStorage/FileAuthStorageBackend classes are not package-root exports: do not deep-import them. A narrow Pi-compatible file adapter cooperates with Web configuration writers through `.models.json.kiva-lock` and Pi through `auth.json.lock`. Use bounded no-follow snapshots, owned lock identity checks, private temporary files and atomic replacement; preserve unrelated provider fields and OAuth registration/refresh fields. Do not steal or remove another process's lock, and keep operations short relative to Pi's stale-lock threshold.

Confirmed local sign-out removes only the current matching stored OpenAI OAuth credential under the same admission/revision/identity guards. It does not revoke the remote OpenAI grant, clear environment/configuration sources, restore a replaced API key, erase other credentials, or rewrite defaults.

### Attempt and UI lifecycle

Permit one pending OpenAI login per service because Pi uses a fixed loopback callback port. Bound attempt lifetime, retained terminal attempts, and duplicate operation IDs. Begin retries using the same operation ID must recover the same attempt, including after a lost HTTP response. Cancellation/expiry/shutdown aborts Pi and pending prompt promises and releases callback listeners before another attempt proceeds. Honor a prompt's own abort signal when the browser callback wins; reject stale manual input.

Cancellation is effective before persistence begins. Once committing, report the actual saved/final result; never claim that credentials were preserved if they were already changed. Late completion of an abandoned attempt cannot write.

The feature owns local state, polling/request cancellation, confirmations, and form-state reporting. Reuse existing Dialog/ConfirmDialog, buttons, inputs, alerts and notices. Provide a deliberate authorization link with `noopener noreferrer`, pending progress, manual callback fallback when prompted, Cancel, retry, reconnect, and confirmed local sign-out. Pending form state blocks settings dismissal, cancellation remains accessible, and category navigation retains the attempt. Unmount/page-close performs best-effort cancellation; server expiry bounds orphaned attempts.

Confirmed success replaces safe settings/catalog through the existing callbacks and shows a concise notice. Do not select a default or change current session controls automatically. Existing configuration-generation invalidation reloads idle Pi owners only on their next explicit safe action. Persisted credentials with failed catalog refresh produce saved-with-warning feedback, not a false login failure. If metadata itself cannot be projected after persistence, return the OAuth-only `{refreshRequired:true}` fallback; keep login status `succeeded`, show a fixed saved-with-warning message, and reload safe metadata. Do not fabricate revisions/status or weaken the ordinary provider/API-key result decoder.

## 4. Validation & Error Matrix

| Condition | Required outcome |
| --- | --- |
| Disallowed origin, non-JSON mutation, query parameters, duplicate/unknown/oversized fields | Reject before starting auth or mutating configuration; apply origin checks to auth status reads too |
| Authorization URL outside `https://auth.openai.com/api/accounts/authorize` | Reject; never render an arbitrary clickable provider URL |
| Callback URL outside the configured loopback callback, missing code/state, or stale prompt | Reject safely; do not echo the callback or resolve another prompt |
| Another active attempt or occupied OAuth callback port | Fixed actionable busy/port-busy feedback; do not kill the other process |
| Cancel/timeout/shutdown before commit | Abort flow, preserve stored credential, remove callback/prompt data and clean resources |
| Provider busy, stale revision, changed file/directory identity, or another writer's lock | Retryable fixed error; preserve current credentials and running work |
| Unsupported OpenAI overrides or command-backed/advanced auth | Disabled/read-only capability or explicit rejection; no implicit shadowing/conversion |
| Raw provider/storage/token error | Fixed safe error code/message only; no raw cause/response or credential data |
| Credential saved but catalog/status refresh fails | Truthful persisted-state warning with explicit reload |
| Sign-out races replacement or is requested for a non-OAuth target | Reject rather than delete the replacement credential |

## 5. Good / Base / Bad Cases

- Good: begin explicitly, open OpenAI authorization, complete callback/manual fallback, guarded commit, refresh safe status/catalog, then independently save a selected default.
- Base: absent credentials/configuration still allow passive settings reads; only the explicit login action initializes installation identity/storage.
- Bad: hold global admission while waiting for the browser, persist directly from a callback after cancellation, emit tokens in status/error output, blindly delete a concurrently replaced key, or treat static catalog membership as verified remote access.

## 6. Tests Required

Service and transport tests use temporary installations, injected OAuth interactions and token sentinels. Assert passive no-network/no-write behavior; duplicate begin recovery; safe URL/input validation; callback-vs-manual cancellation; timeout/retry/listener cleanup; truthful pre/post-commit cancel behavior; provider admission and unrelated operation responsiveness; credential revision/lock/substitution guards; unrelated and legacy credential preservation; conditional local sign-out; safe saved-with-warning projection including metadata exceptions after both login and local sign-out; and zero raw tokens/callback codes/errors in responses.

Settings interaction tests assert explicit confirmation before replacement/sign-out, progress/link/manual fallback, cancel/retry, late/stale response protection, retained category state, pending dismissal, safe failure messages, catalog refresh and unchanged defaults/API-key behavior. Real Chromium checks exercise the same isolated fixture at desktop/390px/320px in light/dark, including keyboard/focus and overflow. Run project tests, typecheck, build and diff checks. Report real-account OAuth/inference separately; a fake driver cannot prove provider availability.

## 7. Wrong vs Correct

Wrong: `GET settings → writable runtime → refresh tokens`; `withProviderMutation(() => waitForBrowser())`; `cancel → old callback writes credential`; `return {...rawOAuthError}`.

Correct: passive safe projection → explicit bounded attempt with staged Pi auth → short revision/admission/lock-guarded credential commit → sanitized confirmed metadata/catalog → user-owned model/default selection.
