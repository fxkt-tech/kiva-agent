# Current behavior and integration evidence

Read-only research on 2026-10-21 at `6447c0c` with pinned local dependencies. No actual credential/config values were inspected, no network/model requests were made and no Pi owner was started.

## Repository seams

- `web/features/workspace/shell.tsx:42`: persistent shell owns drafts/navigation/modals/actions. `:62–64` catalogs require a selected project; `:112–119` hardcodes Mod+N; `:133` is the Pi footer; `:140–141` mounts modals outside the sidebar.
- `web/app/globals.css:1`: theme tokens and system-only dark media query; `:85` owns thin focus. `web/app/layout.tsx:1` loads Geist and a pre-body cache recovery script. Theme boot must coexist with that script.
- `web/components/kiva-workbench-client.tsx:1`: interactive shell uses `ssr: false`; preserve this hydration seam.
- `web/features/sessions/composer.tsx:33`: local default `steer`; `:73` hardcoded Mod+K. Submit preserves captured draft identities, IME/repeat and native disabled guards. Combined picker explicitly saves a full candidate pair.
- `web/components/message-content.tsx:21`: native thinking/tool details initially collapsed. Preference initialization must not override manual toggles during streaming.
- `web/features/sessions/conversation.tsx:23`: session changes remount conversation; preference state belongs above it.
- `web/server/model-catalog.ts:8`: public offline ModelRuntime with no-write credential/cache adapters. `:26` global defaults; `:51` complete pair saves through SettingsManager/flush/drainErrors. Reuse this behavior.
- `web/server/scoped-transport.ts:21`: current per-server write queue serializes pair saves across projects. New installation routes must precede non-project rejection and share save serialization with composer routes.
- `web/server/runtime-manager.ts:47`: scoped acceptance locks deliberately do not hold model runs. `:90` withIdle checks `hub.isIdle()` before release; `:133` acquisition has a separate allocation queue. Provider edits need an acceptance barrier, not an unlocked owner scan followed by writes.
- `web/server/pi-adapter.ts:11`: Pi reads the installation agent directory on owner startup; provider reload needs an idle-owner release before next explicit action, not a global stop.
- `web/server/bootstrap.ts:40`: Pi version currently pinned to 1.3.0. About should report actual package versions/a controlled fallback, not invented live connectivity.
- `web/server/workspace-registry.ts:123`: exclusive same-directory temporary write plus rename is an existing atomic persistence pattern, not a cross-process lock by itself.

## Pi 1.3.0 APIs and limits

- `node_modules/@earendil-works/pi-coding-agent/docs/settings.md`: defaults/per-model thinking and advanced compaction/retry/proxy/tool settings exist. Web theme/shortcuts are not TUI settings; advanced execution options are deferred.
- `node_modules/@earendil-works/pi-coding-agent/docs/models.md:47`: compatible definitions live in models.json; auth.json holds credentials. Preserve overrides/inline keys/env references/commands without exposing raw config.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.d.ts:1`: root-exported ModelRuntime accepts authPath/modelsPath/offline options and supports persistent `login(providerId, "api_key", interaction)`. `setRuntimeApiKey` is transient, not persistence.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js:572`: login persists and then synchronizes offline state; synchronization failure can follow successful persistence. Returned credentials/errors must never be serialized directly.
- `node_modules/@earendil-works/pi-ai/dist/models.js:352`: login persists through CredentialStore.modify. `dist/auth/helpers.js:7` shows ordinary single-secret auth. Multi-prompt/ambient/OAuth flows cannot be generalized into one key field.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/provider-composer.js:241`: compatible providers can compose API-key auth without an inline key; a definition may remain unavailable until a credential exists.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/auth-storage.js:30`: default file storage creates private files and locks writes. AuthStorage is not root-exported, and package exports forbid internal deep imports; use public ModelRuntime behavior.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/model-config.d.ts:1`: definitions have many advanced fields and no public persistent writer. Kiva needs one narrow, revision-checked atomic patcher; preserve Pi as validator/resolver.
- `node_modules/@earendil-works/pi-ai/dist/types.d.ts:19`: all four proposed compatible APIs exist. Preserve other APIs read-only.
- `getSupportedThinkingLevels` from `@earendil-works/pi-ai/compat` already owns actual effort capabilities; reasoning=true does not mean all levels exist.

## Consequences

1. Separate browser preferences, Pi defaults, provider definitions and credentials; no generic settings blob.
2. Installation settings endpoints must work with no registered/selected project while old composer semantics remain compatible.
3. Definitions and keys get separate save actions, avoiding false promises of a two-file transaction.
4. Settings reads only project safe metadata; never resolve auth/refresh OAuth/run configured commands/fetch model catalogs to display it.
5. Unsafe/advanced source forms remain read-only. Keep raw revisions server-side, expose opaque edit tokens, reject stale saves.
6. Provider mutation excludes affected command acceptance and rejects active owners; defaults-only saves need no owner release.

No blocking technical unknown remains for this scope. Implementation must verify these contracts with isolated adversarial fixtures before actual user configuration can be edited through the UI.

## Dispatch note

Context validation passes, but visual-system.md is 34,304 bytes and exceeds the configured 32,768-byte injection cap. Native implement/check workers must read the complete original file through EOF after injection, rather than silently use a truncated tail. This is a loading instruction, not a reason to alter runtime configuration or split unrelated specs during this planning task.
