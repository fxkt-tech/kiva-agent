# Global settings design

## Status and scope

Approved implementation design for PRD R1–R7. Following final review, the user explicitly approved execution (“开始实现”) on 2026-10-21.

One cohesive task is appropriate: footer/dialog, shared browser preference/shortcut ownership, and installation model services need an integrated acceptance pass. Disjoint foundation/server/UI modules may be built concurrently with explicit ownership and shared contracts; integration and review are sequential. Never use parallel writers on shell/composer/transport. There are no independently releasable child tasks required for this scope.

## 1. UI composition

- Persistent shell owns `settingsOpen`. Footer is one compact row, settings left and attribution right. Opening from mobile closes the drawer and portals the dialog to `document.body`, outside its transformed sidebar.
- Desktop target approximately 820px wide, 640px tall, constrained to viewport minus 32px; category rail approximately 160px. At 720px and below use an inset, near-full-height dialog with horizontally accessible categories. Content scrolls inside the modal, never in the document.
- Categories: 外观 / 快捷键 / 模型 / 会话 / 关于. Use existing Geist and semantic tokens, simple field rows/dividers, native accessible selects/switches/buttons and 1px focus treatment. Do not create dashboard cards or add a conversation header.
- Dialog owns labelled title/close, focus trap, active category keyboard behavior, Escape/backdrop handling and focus restoration. If the mobile trigger is hidden after closing the drawer, restore the standalone navigation button rather than focus a hidden element.
- Browser preference controls auto-save. Default-model/provider forms have local candidates and explicit action-specific save buttons. Keep candidates when switching categories; dirty close asks in-app whether to discard. Clear typed secrets when discarded, successfully saved or unmounted. Pending explicit saves block dismissal and duplicate submission.
- Use the existing Toast and Alert. Keep save state per action; definition saved/credential pending is a real intermediate state, not one combined “all settings saved” message.

## 2. Module boundaries

Proposed new modules (names can be adjusted during implementation without changing contracts):

| Owner | Responsibility |
| --- | --- |
| `web/shared/web-preferences.ts` | Versioned non-secret preferences, defaults, decoding and shortcut action/binding types |
| `web/lib/web-preferences.ts` | One browser store, subscriptions, localStorage failures, storage-event synchronization |
| `web/lib/shortcuts.ts` | Normalization, conflict/protected-key validation and one scoped action dispatcher |
| `web/lib/theme-bootstrap.ts` | Small safe pre-paint explicit-theme script |
| `web/features/settings/*` | Dialog/category views, provider candidates, key-only input and diagnostic copying |
| `web/shared/installation-settings.ts` | Sanitized read/write DTOs and single shared request/response decoders |
| `web/server/installation-settings.ts` | Installation-level facade, safe metadata, version/check projection, opaque edit revisions |
| `web/server/provider-configuration.ts` | Narrow models.json patches, validated provider/key writes, file safety/concurrency |
| Existing `server/model-catalog.ts` | Offline model catalog and Pi default-pair persistence, reused rather than duplicated |
| Existing `server/runtime-manager.ts` | Provider-change admission barrier and lazy refresh of stale idle owners |

Avoid a generic config engine or broad application state framework. Browser preferences, user drafts, URL identity, runtime state and server configuration remain separate owners.

## 3. Browser preferences and theme

Use one namespaced, versioned origin-local key such as `kiva:web-preferences:v1`, containing only validated UI preferences:

```
appearance: theme(system|light|dark), conversationFontSize(14|16|18), wrapCode(boolean)
conversation: thinkingExpanded(boolean), toolsExpanded(boolean), queueMode(steer|follow_up)
shortcuts: sendMode(enter|mod-enter), action bindings or null
```

One store exposes `getSnapshot/subscribe/update/resetGroup`; initialize once, retain immutable snapshots, decode unknown values centrally and synchronize sibling tabs via storage events. On persistence denial retain session-local state and surface a clear warning. Never call `localStorage.clear` or store candidates, keys, drafts, attachments or server configuration.

Apply a root theme attribute; use existing CSS tokens for explicit light/dark and system fallback. A tiny allowlisted boot script reads only the theme and applies it before paint, with try/catch and no user-generated script interpolation. Preserve legacy cache recovery and the client-only workbench seam; any root hydration suppression must be narrow and justified, never hide unrelated mismatches.

Conversation font size changes content, not global navigation or code font identity. Wrapping affects rendered code/tool output where appropriate, not exact raw JSONL content. Initial disclosure preference is owned per mounted item and not reasserted on streaming renders. Queue preference initializes a new composer and does not replace an in-session user override.

## 4. Shortcut dispatch

- Use portable `Mod` plus normalized key/modifiers; show platform-specific labels. Persist only single combinations. Reject pure modifier keys, application duplicates and known protected browser/OS combinations; require a modifier for global recorded actions.
- Registry actions: newSession, openCommands, focusComposer, openSettings. Defaults preserve Mod+N/Mod+K, add Mod+comma, and leave focusComposer unbound. Store action availability separately from binding definitions.
- Central dispatch prioritizes dialog/shortcut recording, then available route/composer actions. Do not leave the existing shell/composer window listeners competing with the new registry. Escape remains modal-local dismissal.
- Send-mode handling remains on the native textarea/form. Enter mode preserves Shift+Enter; Mod+Enter mode leaves Enter as a native newline. Other modifiers must not accidentally submit. Retain IME composition/229, repeat, disabled-button and pending checks; update footer hints from the same normalized preference.
- Recording never invokes the recorded action. Ignore unavailable actions without mutating state; closing settings restores normal dispatch. Browser/OS capture cannot be guaranteed and must not be misrepresented.

## 5. Installation endpoints and shared catalog

Handle installation routes in the existing custom scoped transport before project-route parsing. Do not create another RuntimeManager or require an arbitrary selected project.

| Endpoint | Purpose / response |
| --- | --- |
| `GET /api/settings` | Sanitized provider metadata/editability, opaque edit tokens, versions and passive backend-check result |
| `GET /api/settings/models` | Existing `ModelCatalog` projection, installation-scoped and safe with no projects |
| `POST /api/settings/defaults` | Complete `ModelConfiguration` plus observed default/catalog revision; confirmed catalog |
| `POST /api/settings/providers` | Add/update one allowlisted compatible definition with observed revision; confirmed safe provider projection |
| `POST /api/settings/providers/:id/credential` | Explicit new API key plus observed credential revision; non-secret confirmed credential status |

Use strict bounded JSON DTOs, application/json mutations, current origin protection, no CORS relaxation, no-store headers and sanitized error codes/messages. Reject unknown/duplicate identity inputs and arbitrary client paths. All paths derive from `registry.installationRoot`.

The shell's catalog becomes installation-owned while maintaining its existing context interface. Both settings and composer consume one confirmed catalog state. Retain old project-scoped model endpoints for compatibility and existing scoped session apply; route them through the same save coordinator/service. No-project defaults must never acquire a session. A late request cannot replace a newer confirmed revision.

Keep provider metadata lazy to dialog opening. The safe catalog may be loaded for composer functionality, as it is today. Do not fetch secrets or raw models/auth/settings files into client components.

## 6. Defaults, provider definitions and credentials

### Defaults

Reuse `saveModelDefaults`: validate pair through Pi capabilities, set provider/model/global effort and the model-specific effort entry, await flush, inspect errors. New settings endpoint supplies no session/apply callback. Existing composer still applies to its exact optional session before persisting defaults; its partial-failure distinction stays intact. Defaults do not invalidate existing owners or overwrite recorded controls.

### Provider definition save

- First-release write surface is add/update, not delete. Keep IDs stable; prevent prototype-like/duplicate keys, unsupported APIs/protocols, control characters and excessive counts/lengths. New models accept an ID and optional name/context/max-output/input/reasoning values; positive safe integer limits and duplicate IDs are checked. Derive thinking choices through Pi's compatibility helper.
- Allow HTTP(S) endpoint paths, including local/LAN models because the application is local, but reject URL userinfo/query/fragment. No automatic request is made to that URL. Existing unsafe/advanced source forms are preserved and marked read-only rather than echoed into editable fields.
- Parse existing files before mutation and retain unknown top-level/provider/model/override fields. Patch known fields by stable identity; do not replace a provider object with the form DTO or remove absent models. Do not flatten per-model API/URL overrides or advanced headers/commands into the simple editor.
- Keep server-side observed file fingerprints and issue opaque edit tokens; do not expose raw auth/config hashes. Serialize settings operations, lock the definition writer across cooperating processes, re-read and compare the submitted revision, validate the merged definition offline using public Pi surfaces in a private temporary fixture, then atomically replace a same-directory exclusive private temporary file. No writes on GET. Refuse malformed/symlink/substituted/nonregular files instead of following or overwriting them.
- Before commit, repeat observed source/ownership validation. Arbitrary external editors may not honor locks: detected divergence produces a reload-required conflict rather than last-write-wins. Do not claim a stronger cross-tool transaction.

### API key save

- Key entry is separate from definition editing: first save a compatible definition, then explicitly configure its key. Built-in providers with verified standard single-secret API-key login are eligible; OAuth-only, multi-field/ambient/advanced auth is read-only. An empty key never clears or changes stored credentials.
- Preflight credential type/source/revision and reject OAuth or command-backed replacement. Reject secret input that Pi would interpret as executable/config interpolation, control/newline characters and excessive length. Normal API-key characters remain literal.
- Use public `ModelRuntime.create({authPath, modelsPath, allowModelNetwork:false,...})` with no-write model cache, then the verified standard `login(providerId, "api_key", interaction)` path. Do not deep-import non-exported AuthStorage or use transient `setRuntimeApiKey` as persistence.
- Restrict the interaction to the verified one-secret flow; unexpected prompts fail safely. Default Pi credential storage owns file locking and private creation modes. Preserve unrelated auth entries and never return the resulting Credential object.
- `CredentialSynchronizationError` may mean disk was saved but view refresh failed. Re-read safe status/revision and report that distinction without serializing credential/error cause fields. This action writes credentials only, never also edits provider definitions or defaults.
- Existing models.json keys/env references remain untouched. API-key replacement intentionally overrides the active API-key source through auth.json and must be clearly labelled; OAuth/command-backed entries stay read-only. No migration or logout/delete.

### Secret projection and diagnostics

GET metadata uses explicit allowlists, never object spreading raw configs. Show credential source/configured state, not prefixes/suffixes, headers, environment values or tokens. Legacy endpoint URLs that contain secret-bearing parts are redacted and non-editable. Catch parser/Pi/storage errors at this boundary and map to fixed actionable messages; never pass raw error payloads to existing generic transport serialization.

About copies fixed versions/preferences/check outcome only. Use the HTTP read result as a last-checked backend result, not a live model/provider status; retain the separate exact-session WebSocket indicator. No absolute directories, raw configs, user content or untrusted error strings in copied diagnostics.

## 7. Runtime admission and safe refresh

Provider edits can affect a live Pi process's requests. A separate write queue alone is insufficient: a prompt could be accepted after an idle scan and before persistence.

- Add a narrow admission barrier around commands that can acquire owners/start work/change model controls, and around provider mutations. Await admission before per-scope locks to avoid inverted lock order; keep long model RPC/run promises outside the admission lock, as current acceptance does.
- Under exclusive provider mutation admission, inspect all existing owners, including hidden projects. Reject before file writes if an affected current/transitioning provider is not safely idle. Pending model changes or unresolved ownership are conservative conflicts, not permission to edit mid-run.
- Abort, steering, follow-up and extension responses to unrelated active work must remain deliverable; they must not wait behind a credential-file lock. Do not hold a global model-run mutex or call manager.stop.
- On confirmed provider-definition/credential save, increment the installation configuration generation. All owners' catalogs may now be stale, even if their current model uses another provider. Keep busy unrelated owners running with their current configuration. At the next explicit owner/model action, if an owner is stale and safely idle, release/reacquire it through existing identity/ownership machinery before accepting the action. Never refresh it via passive reads/subscriptions.
- Preserve stream/subscription identity and publish the normal authoritative resource projection/reset as appropriate. No new worktree/history, deletion, control rewrite or duplicate writer is permitted.
- A default-only save does not bump this generation. A rejected/failed provider write must not claim a new usable configuration; post-persistence refresh failures are reported honestly and tracked for safe retry.

Tests must cover the admission race, stale cross-provider catalog selection, pending RPCs, queued/UI/retry/compaction work, hidden projects and immediate abort delivery for unrelated runs.

## 8. Rollout and verification

No on-open migration is needed. Missing UI preferences use existing defaults. Existing Pi files remain authoritative; new browser preference data is isolated and versioned. Rollback removes the UI/provider write endpoints without deleting saved compatible Pi configuration or auth.

Automated tests use temporary installations, fake keys, fake adapters, denied network and sentinel advanced/secret fields. Verify response/storage/log/diagnostic redaction and no command execution, no partial success, revision conflicts, private writes, runtime admission and old composer semantics. Browser mutation checks use isolated servers, never actual user settings. Run typecheck/test/build/diff checks and real desktop/mobile theme/keyboard/navigation regression before handoff.
