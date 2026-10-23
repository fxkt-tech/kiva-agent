# Design: OpenAI authorization in model settings

Status: approved for implementation by the user on 2026-10-23.

## Change Boundary

The gap is user-initiated OAuth interaction in the installation settings surface. Pi already owns provider login, token exchange/refresh, credential shape, and Responses transport. Keep those responsibilities in Pi. Add a bounded server login-attempt service, guarded credential commit/sign-out, shared wire decoders, and one settings feature component.

The primary target is the built-in `openai` provider's Sign in with ChatGPT flow. Existing `openai-codex` credentials remain compatible, but this task does not add legacy browser/device-flow UI. No model API implementation, provider replacement, dependency upgrade, raw-config editor, credential import, or agent-backend replacement is required.

## Existing Contracts and Evidence

- `web/server/model-catalog.ts:11` builds a read-only, offline ModelRuntime using presence-only credential projections. Preserve this passive behavior.
- `web/server/provider-configuration.ts:91` distinguishes OAuth from API keys and refuses implicit conversion. Expose narrowly scoped OpenAI OAuth capability/status without weakening the API-key editor.
- `web/server/installation-settings.ts:10` coordinates short explicit settings writes and returns confirmed metadata/catalogs. OAuth waiting must not run under its global write queue.
- `web/server/runtime-manager.ts:115` holds global admission for the full `withProviderMutation` operation. Use it for short credential commit/removal only, never for browser authorization or remote OAuth requests.
- Pi 1.3.0 exposes provider-owned OAuth through `ModelRuntime.getProvider("openai").auth.oauth.login(interaction, options)`. Its provider emits `auth_url` notifications and a `manual_code` prompt, starts a loopback listener on port 1455, and supports cancellation.
- Pi's OpenAI login needs a stable installation UUID through `LoginOptions.getDeviceId`; use `SettingsManager.getOrCreateDeviceId()` and flush/error handling, with `agentName: "KivA"`. Installation identity initialization is an explicit-login side effect; cancellation need not delete the identity.
- Existing settings panels remain mounted while hidden. A feature-scoped authorization panel can retain attempt state across category navigation and use existing pending-close protection.

See `research/openai-auth.md` for installed-source and official-documentation notes. Implementation export verification corrected one API assumption: AuthStorage is not exported from the package root, so storage uses the already-approved public CredentialStore seam with a narrow Pi-compatible adapter. This does not change the approved product scope or authorization behavior.

## User Experience

Add an OpenAI / ChatGPT authorization section to Settings → Models, beside the existing default-model and provider sections. It displays configured authentication source and provides Continue with ChatGPT / reconnect / local sign-out as appropriate. Existing API-key controls remain in the provider editor.

Starting a replacement or signing out requires the existing ConfirmDialog. Unsupported advanced/configuration overrides remain read-only with a concrete explanation; do not silently shadow command-backed authentication.

After begin, show a user-clickable authorization link, progress, a callback-URL field only when Pi asks for manual input, and Cancel. A link with `target="_blank" rel="noopener noreferrer"` avoids dependence on popups opened after an async request. Show port-conflict, timeout, provider-busy, configuration-conflict, cancellation, and generic auth failure using fixed safe messages. Never display raw exception messages or token responses.

Prevent dismissal while a login/write is pending through the existing form-state callback, but keep cancellation available. Category changes retain state. On successful cancellation the panel becomes dismissible. Unmount/page-close performs best-effort cancellation; a server timeout bounds orphaned attempts. On success, feed confirmed settings/catalog through the existing `onSaved`/`onCatalog` path and show a concise notice. Do not pick a model or alter defaults automatically.

## Service and Data Flow

`OpenAI auth panel → settingsApi → scoped settings transport → installation auth service → Pi ModelRuntime.login → staged credential → short guarded commit → metadata/catalog confirmation → existing model controls`.

Suggested new modules:

- `web/shared/provider-authorization.ts`: allowlisted attempt/status/input/capability contracts and decoders. Keep OAuth token types out of browser-facing interfaces.
- `web/server/provider-authorization.ts`: bounded attempt lifecycle, Pi interaction bridge, staging credential store, cancellation, timeout, cleanup, and injectable driver for offline tests.
- `web/features/settings/openai-authorization.tsx`: all feature state, request/poll cancellation, confirmation, progress, callback input, and terminal outcomes.

Extend the existing provider/settings service only at narrow seams needed for capability projection, validated OAuth commit/removal, result confirmation, and shutdown. Avoid restructuring unrelated model/provider forms.

## HTTP Contract

Use installation-scoped routes under `/api/settings/providers/openai/oauth`:

| Request | Purpose |
| --- | --- |
| `POST .../oauth` | Begin with the currently observed credential revision and a client-generated operation ID; retries with the same ID return the same attempt. |
| `GET .../oauth/<attemptId>` | Read the in-memory safe attempt snapshot; no OAuth refresh or network side effect. |
| `POST .../oauth/<attemptId>/input` | Submit the current prompt ID and callback URL. Reject stale prompts/attempts and invalid or oversized fields. |
| `POST .../oauth/<attemptId>/cancel` | Idempotent cancellation before commit; after commit return the truthful final state. |
| `POST .../oauth/logout` | Explicit local sign-out with the currently observed credential revision. |

The final implementation may use equivalent route spelling if the same contract is kept. Retain strict JSON bodies, duplicate-key checks, origin checks, bounded input, no query parameters, and no-store responses. Apply origin validation to authorization status reads as well because they can include ephemeral authorization URLs. Do not add broad CORS permissions.

Wire states are a discriminated union of starting, awaiting-authorization/input, committing, succeeded, cancelled, failed, and expired. Include only opaque IDs, expiry, a validated OpenAI authorization URL, an expected callback prompt ID, fixed status/error codes, and a confirmed ProviderSaveResult on success. Callback URLs contain temporary authorization codes: POST them only, never put them in API routes/query strings, storage, logs, or later status responses; clear input immediately after use/terminal outcome.

## Attempt Ownership, Cancellation, and Concurrency

Keep one active OpenAI login per installation service because Pi's loopback callback port is exclusive. Bound completed-attempt retention and total attempts; expire pending attempts after a documented short window (suggestion: 10 minutes). Do not enumerate other clients' attempt capabilities in public settings metadata. The initiating operation ID and opaque attempt ID support duplicate-submit/network-retry recovery without exposing tokens.

Bridge Pi `notify` through an allowlist and `prompt` through a single current prompt deferred promise. Honor the prompt's own abort signal when the loopback callback wins, so a later manual submission cannot race a completed prompt. Use a concrete attempt AbortController and reject pending prompts on cancel/expiry/shutdown. Wait for the previous flow to release its callback listener before a retry starts. Observe all background promises and clear timers/listeners.

An attempt is cancellable until guarded persistence begins. Commit is a short explicit state: cancellation after it starts reports the actual saved result instead of claiming that credentials were not changed. State/attempt identity checks run immediately before persistence so late callbacks from abandoned attempts cannot write credentials.

## Credential Staging and Commit

Create a read-only login ModelRuntime with an in-memory/staging CredentialStore and no-write model cache, with model network disabled. Call the public provider-owned OAuth method directly with a concrete AbortSignal, so its promise settles only after callback-server cleanup; avoid ModelRuntime.login's early abort race for this cancellation boundary. Browser authorization and token exchange complete outside the settings write queue and RuntimeManager admission. Do not instantiate the default writable auth store or resolve command/env-backed secrets just to render status or wait for authorization.

After a successful staged login, enqueue a short persistence operation through InstallationSettingsService and `RuntimeManager.withProviderMutation("openai", ...)`. Recheck attempt activity/abort, the observed credential/configuration revision, allowed replacement type, directory/file identity, and provider overrides. Persist through Pi's public CredentialStore seam using a narrow Pi-compatible file adapter with the existing shared lock protocol, bounded no-follow snapshots, atomic replacement, and unrelated-provider preservation. AuthStorage/FileAuthStorageBackend declarations exist in the installed dist tree but are not root exports; do not deep-import them. Recheck the stored target inside its locked mutation callback; handle expected first-file initialization distinctly from an external edit. Do not flatten provider-specific OAuth fields or copy credentials to another file.

Commit only to the built-in provider configuration that was authorized; custom base URLs/headers/advanced auth must not accidentally receive the resulting token. The OAuth action is disabled or rejected when OpenAI has unsupported overrides. Keep API-key save behavior unchanged, including its refusal to overwrite OAuth.

For sign-out, remove only a matching current stored OpenAI OAuth credential under the same short admission/revision/identity checks. Never erase a concurrently replaced API key, unrelated credentials, or models/defaults. Local removal does not revoke the grant on OpenAI. Existing environment/config sources may become effective afterward.

On confirmed persistence, existing configuration-generation invalidation refreshes idle Pi owners on their next explicit safe action. Busy/queued/transitioning OpenAI work rejects commit/removal with actionable feedback; unrelated runtime commands remain responsive throughout browser waiting. A saved credential with a failed metadata/catalog refresh must produce a truthful saved-with-warning result rather than a false login failure. The OAuth-only save result is `ProviderSaveResult | {refreshRequired:true}`. When metadata projection throws after persistence, return `refreshRequired:true`; login remains succeeded without a result, and the UI shows a fixed saved warning and reloads metadata. Do not invent revisions/status or change generic API-key/provider response contracts.

## Lifecycle and Integration

Expose an idempotent shutdown/close hook from the scoped transport/settings service and call it from the custom server before exiting, so pending OAuth callback servers and timers are cancelled. Isolated test/browser servers must close the same resources. Add a narrowly scoped service/driver injection point for deterministic tests rather than environment-controlled fake authorization in production.

## Compatibility and Rollback

No auth format migration. Existing API keys, defaults, custom providers, stored OAuth, and old session transcripts retain their current shapes. New capability fields are projected through shared safe decoders. The legacy `openai-codex` entry remains supported by Pi and the existing catalogs.

Reverting this feature removes the Web authorization entry but leaves Pi-compatible OAuth credentials usable through Pi. A failed or cancelled attempt before commit preserves previous credentials. A stable installation device ID may remain after the first explicit login attempt. Never claim restoration of an overwritten key or remote revocation.

## Validation and Deferred Items

Use injected offline OAuth interactions and temporary installations to verify real service/transport/UI behavior, including token sentinels, revision races, callback abort, cancellation before/after commit, listener cleanup, provider admission, local sign-out, model refresh, unchanged defaults, and API-key regressions. Browser acceptance uses an isolated fake-driver server and tests desktop/390px/320px and light/dark layouts, focus, pending close, manual fallback, and cancellation/retry.

Real OpenAI account login requires the user's browser consent and cannot be certified by offline tests. Keep that limitation explicit. Pi's pinned OAuth implementation is upstream code; this task does not reimplement its OIDC validation, registration policy, or provider refresh internals. Account-specific remote model discovery and entitlement verification are deferred; passive settings/catalog reads remain offline.

## User Follow-up: `pnpm clear-web`

The user explicitly requested a root command to close Web. This is a small adjacent CLI deliverable under the active task. Add a root package script, a thin bin entry, and a focused process-identity/stop helper if needed; preserve the existing Web startup scripts and app/auth behavior.

Discover actual Node server entry processes by canonical installation/root + actual server entry identity, including existing processes started before this command was added. Do not kill by port alone, use a loose process-name substring, or require a pid file that old processes never wrote. On this Linux host `/proc` provides exact argv/cwd/exe/start-time identity. The implementation deliberately supports Linux and explicitly rejects unsupported platforms rather than adding a lossy POSIX process-string fallback. Unsupported discovery must fail explicitly, never broaden process matching. Handle paths with spaces and wrappers correctly.

Signal only positively matched installation-owned Web processes using SIGTERM so existing OAuth/runtime shutdown hooks run. Wait for bounded graceful completion; no implicit SIGKILL, process-tree sweep, state deletion, cache removal, or remote side effects. No server is a successful idempotent outcome. Surface permission/discovery/timeout failures truthfully. The no-argument command targets this installation's Web instances regardless of custom PORT.

Meaningful tests spawn disposable fake Web-entry processes and unrelated/other-installation controls; do not run the new stop command against the user's actual Web/auth flow during implementation.
