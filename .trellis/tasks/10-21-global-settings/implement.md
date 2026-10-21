# Implementation plan

## Entry gate

- [x] User approved the latest final planning summary with “开始实现” on 2026-10-21.
- [x] Read PRD, design, research, both curated context manifests and applicable specs; `task.py validate` passes.
- [x] Native injection warns that `visual-system.md` exceeds the 32,768-byte per-file limit (34,719 bytes at final verification). Implement/check agents must explicitly read that entire source file through EOF rather than rely on truncated injected context; do not change project injection limits merely for this task.
- [x] Run `task.py start` only after approval. Preserve unrelated `web/next-env.d.ts` dev-path changes and actual user data.

## Slice 1 — Contracts and browser preference foundation

Ownership: implement agent owns new shared preference/shortcut DTOs, browser store, theme boot helper and their tests; later changes to app layout/CSS are serial with UI work.

- [x] Implement versioned field-wise preference decoding/defaults/reset groups, immutable subscription snapshots, storage denial and cross-tab updates. No secrets/drafts in storage.
- [x] Implement explicit/system theme boot and root tokens without disturbing local Geist, cache recovery or hydration seam.
- [x] Implement shortcut normalization, defaults, protected-key/conflict validation and priority/action registry. Leave no competing hardcoded listeners.
- [x] Test invalid/missing storage, theme changes/OS changes, conflict/reset semantics and stable snapshots.

## Slice 2 — Safe installation services and runtime admission

Ownership: implement agent owns shared installation DTOs, installation/provider services, model-catalog integration, runtime-manager changes, transport endpoints and server tests. Do this slice before enabling any provider save UI.

- [x] Define strict safe metadata/edit DTOs and opaque revision tokens; add no-project installation endpoints with no-store and origin/content-type protections.
- [x] Refactor the existing default-save queue into one installation coordinator shared by legacy composer routes and new endpoints; keep SettingsManager persistence and scope guards intact.
- [x] Add definition preflight/allowlist patches, cross-process cooperative lock, stale/substitution checks, offline candidate validation, private atomic replacement and unknown-field preservation.
- [x] Add verified standard API-key persistence through public ModelRuntime login. Preflight existing auth type/source/revision; never use deep imports or transient runtime keys as persistence.
- [x] Keep definition/key/default mutations separate; map all raw storage/Pi errors to safe fixed error DTOs, including credential-saved/view-refresh-failed outcomes.
- [x] Implement provider mutation admission and configuration generations; refresh stale idle owners only on explicit actions. Never stop active work or block unrelated abort/UI responses behind file locks.
- [x] Add transport/runtime tests for no-project access, unavailable/corrupt/advanced config, fake secret sentinels, no GET writes/network/command execution, duplicate/unsafe fields, stale concurrent tabs, Pi field preservation, busy/pending/hidden/race/generation cases and retained streams/identities.
- [x] Verify actual pinned Pi no-prompt credential/default compatibility in isolated installations, with no network and fake keys.

## Slice 3 — Settings shell and category UI

Ownership: implement agent owns `features/settings/*`, shell/footer integration, application CSS and routed/dialog tests. No simultaneous writer on shell/composer/CSS.

- [x] Add fixed settings/attribution row, modal portal, desktop category rail/mobile categories, constrained scrolling, focus trap/restoration and dirty-close handling.
- [x] Add appearance/conversation auto-save controls and per-group reset with storage failure feedback.
- [x] Add shortcut recorder, conflict/protected-key errors, action availability, reset and accurate platform labels.
- [x] Add complete default model/thinking form using one shared confirmed installation catalog.
- [x] Add provider list/add/edit and separate API-key action; show supported/read-only/source/unauthenticated states without revealing stored keys. Never persist typed secrets in browser storage.
- [x] Add About versions/manual passive check/allowlisted diagnostic copy, with honest clipboard failures.
- [x] Use concise existing Toasts only for confirmed explicit actions; no per-toggle success banners. Retain failed form candidates, block duplicate/pending dismiss and clear secrets on save/cancel/unmount.

## Slice 4 — Existing conversation integration

Ownership: same implement agent serially updates composer, message content, conversation and shell/global dispatch tests.

- [x] Apply conversation font/wrap preferences without changing navigation/code font identity or raw JSONL text.
- [x] Initialize thinking/tool details from preferences while preserving manual toggles on streaming updates.
- [x] Initialize queue mode without changing queued work or overriding an existing composer choice.
- [x] Replace old global shortcut handlers with the registry. Preserve Enter/Shift+Enter default and alternate Mod+Enter behavior, native forms, IME/229, disabled/repeat guards and footer hints.
- [x] Retain combined composer pair save/apply, context percentage, attachments, file trees, connection indicator, compact sidebar and headerless/no-panel layout.

## Slice 5 — Independent check, spec sync and browser acceptance

- [x] Dispatch `trellis-check` read/review after implementation with the real task/check manifest. Mechanical defects can be fixed in scope; design deviations return to the main session.
- [x] Run `pnpm typecheck`, `pnpm test`, `pnpm web:build`, `git diff --check` and `python3 .trellis/scripts/task.py validate .trellis/tasks/10-21-global-settings`.
- [x] Browser-test light/dark/system at desktop/390px/320px: footer, all five categories, mobile open/close/focus, text/field bounds, keyboard recording/conflicts, both send modes without paid prompts, theme persistence/OS switching, raw JSONL and tool disclosures.
- [x] Use an isolated real-server fixture for provider/default/key writes, stale tabs, malformed source/read-only forms, failed-save retry, secret cleanup, empty project registry, running-owner block and safe next-action reload.
- [x] Assert no secret in responses/browser persistence/errors/diagnostics/log captures, no GET mutation/model network, no overflow/hydration/resource errors, no actual user data mutation.
- [x] Compare actual running-origin CSS/JS with source if stale; restart only after checking every registered scope for active work. Never clear actual configuration/history. Preserve generated next-env changes outside task scope.
- [x] Update visual-system/workspace-routing specs and README with the implemented preference/storage/security/admission contracts using `trellis-update-spec`.
- [x] Record delivered scope/tests/deferred items in `research/verification.md`; commit/push remains gated on user authorization, with task/archive/journal auto-commits not invoked.

## Risks / rollback points

- Theme boot/CSS: preserve old system behavior as fallback; avoid hiding hydration errors globally.
- Shared dispatch: action ownership and modal priority must be tested before deleting old listeners.
- Provider writer: do not enable UI mutations until revision/unknown-field/redaction/negative tests pass.
- Runtime admission: never hold acceptance locks for model-run promises; ensure abort remains usable and stale idle refresh cannot create a second writer.
- Credentials: no multi-file success claim, no raw error propagation, no replacement of OAuth/unsupported auth. Keep separate actions even if a combined form looks simpler.
- Rollback keeps saved Pi definitions/auth and preference data; it never removes user configurations, histories, worktrees or branches.

## Verification handoff

Implementation and acceptance are complete; see `research/verification.md`. The user subsequently explicitly requested “提交&推送”: commit the feature, archive the task, record the journal and push in that order. Preserve and exclude the pre-existing `web/next-env.d.ts` development-path change; leave the local service on port 9495 running.
