# OpenAI OAuth integration evidence

Researched 2026-10-23. Scope: Settings → Models in Kiva, using the pinned Pi 1.3.0 runtime.

## Local Architecture

- Root and Web packages pin `@earendil-works/pi-coding-agent` 1.3.0; Web also pins `@earendil-works/pi-ai` 1.3.0.
- `web/server/pi-adapter.ts` uses Pi RPC and installation `.kiva/agent/` for every session. No Codex CLI process or new agent backend is necessary.
- `web/server/model-catalog.ts` recognizes OAuth presence using placeholder tokens and `allowModelNetwork: false`. Keep this no-write/no-refresh behavior on passive reads.
- `web/server/provider-configuration.ts` reads sanitized provider/auth metadata. Its standard API-key allowlist includes OpenAI, but OAuth is read-only; do not relax the generic key editor to accept OAuth tokens.
- `web/server/installation-settings.ts` serializes existing writes. `RuntimeManager.withProviderMutation` holds global admission until its callback completes. Long browser/OAuth work must stay outside both.
- Archived global-settings planning explicitly deferred OAuth in the first release; the user's current request authorizes planning a narrow extension to that contract. Existing advanced and command-backed protection still applies.

## Installed Pi API Evidence

Read the installed public declarations/source; do not deep-import these private implementation files in production:

- `web/node_modules/@earendil-works/pi-ai/dist/providers/openai.js`: provider `openai`, Responses API, API-key plus OAuth auth, label Sign in with ChatGPT.
- `.../dist/providers/openai-codex.js`: provider `openai-codex`, marked legacy, OAuth-only, ChatGPT backend-api endpoint. Preserve existing compatibility; prefer current OpenAI flow for the new feature.
- `.../dist/auth/oauth/openai-chatgpt.js`: public-client dynamic registration and PKCE; requires a stable UUID through `getDeviceId`, supports `agentName`, emits `auth_url`, races a manual callback-URL prompt against the loopback callback server, binds port 1455, and closes callback connections in `finally`. Access/refresh tokens and client registration fields remain provider-owned.
- `.../dist/auth/types.d.ts`: `CredentialStore` offers read/list/modify/delete; `LoginOptions` accepts `getDeviceId` and `agentName`. `modify` exposes the raw current provider credential under storage serialization, suitable for target conflict checks.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.d.ts`: public `ModelRuntime.create`, `login`, `logout`; create accepts custom credentials and model store. Login returns/persists a credential and then synchronizes its model/auth snapshot, but its internal abort race can settle before provider callback cleanup. For the Web attempt lifecycle use the public provider-owned `getProvider("openai").auth.oauth.login` with a concrete AbortSignal; this stages the credential and waits for its callback-server finally before allowing retry.
- `.../dist/core/auth-storage.d.ts` describes AuthStorage/FileAuthStorageBackend, but implementation-time package-root export verification shows these classes are NOT exported. They must not be deep-imported. Use the public CredentialStore seam and a narrow Pi-compatible shared-lock/atomic file adapter for guarded commit and conditional logout. The existing default ModelRuntime auth store may create an absent empty private auth file; distinguish expected initialization from observed external edits.
- `.../dist/core/settings-manager.d.ts`: public `getOrCreateDeviceId`; existing SettingsManager flush/drainErrors patterns should own identity persistence.
- `web/node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js:253`: the transport detects ChatGPT sign-in and omits several fields unsupported by that inference route. Do not reimplement this adapter in Kiva.

## Offline Probe Already Run

Constructed ModelRuntime with `modelsPath: null`, model network disabled, in-memory presence-only OAuth credentials, and model-store writes rejected. No real auth files or provider requests were used.

- No credential: neither OpenAI provider was available.
- A placeholder `openai` OAuth credential: built-in OpenAI models appeared with `api: openai-responses`.
- A placeholder `openai-codex` OAuth credential: built-in legacy Codex models appeared with `api: openai-codex-responses`.

This verifies directory/catalog recognition only, not token validity, account entitlement, real callback success, or inference.

## Official OpenAI Documentation

Sources were opened, not just searched:

- [ChatGPT plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source): open-source/local apps can request permission to use eligible ChatGPT plans; authorization uses a stable installation host ID and client registration.
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference): the supported endpoint for this flow is public `https://api.openai.com/v1/responses`, using an authorized OAuth bearer token. `store: false` and `stream: true` are required. Account-specific model discovery uses the same token against `/v1/models`; the bundled Pi catalog does not verify entitlement.
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations): the subscription route rejects several ordinary Responses parameters/tools, requires caller-supplied history, and needs token renewal. Rely on the pinned provider adapter; report live acceptance separately.
- [Code generation](https://developers.openai.com/api/docs/guides/code-generation): distinguishes Codex agent tooling from calling coding-capable models through Responses. The requested feature is model/settings authentication, not replacing the agent harness.

## Risks and Scope Decisions

- Port 1455 can already be held by Pi/Codex login; offer safe actionable retry feedback without killing the other process.
- Cancel can race a loopback callback or persistence. Define the persistence boundary explicitly and never claim cancellation after a credential was saved.
- API-key and OAuth are one stored credential per provider. Confirm replacement; do not claim automatic restoration of the previous key on sign-out.
- Existing OpenAI custom endpoint/headers/command-backed auth must not receive or be silently shadowed by subscription tokens. Reject unsupported override configurations.
- Retain the current static/offline model catalog for this task; fetching a live account-specific catalog is a separate, explicitly initiated feature.
- Real browser/account consent and live model availability remain user acceptance items; automated tests use a narrow injected driver and temporary installation.
- Upstream Pi owns OAuth protocol details. A comprehensive OIDC/registration-policy audit or provider SDK migration would require a separate scope review.
