# Implementation plan

## Gate and ownership

- The user approved the final planning summary with “开始实现”; task status is in_progress. Native trellis-implement completed the code and trellis-check is performing the final full-scope pass.
- After approval, load phase 1.4 and 2.1 details; use native trellis-implement dispatch with native context injection and child-side JSONL loading fallback. One implement agent owns the settings coordinator/flow and related tests/CSS. Other existing working-tree edits are not its property.
- Parent session owns planning, spec updates, integration, commit scope and finish-work. Quality verification uses trellis-check after implementation.

## 1. Record the baseline and preserve existing work

- [x] Record current settings changes and task scope. Preserve prior changes to shell.tsx, workbench-interactions.test.ts, workspace-routing.md, next-env.d.ts, and HTML files.
- [x] Read component, global settings, visual system, theme, OpenAI authorization, and research context. Inspect exact code/tests listed by research before extraction.
- [x] Establish baseline settings-dialog and installation/provider/auth tests plus web typecheck; record pre-existing unrelated failures rather than silently fixing or dropping them.

## 2. Extract one feature coordinator and retain state owners

- [x] Move Models composition from SettingsDialog into a feature-scoped ModelsSettings coordinator without changing safe settings/catalog callbacks.
- [x] Separate active inner view from candidate/pending/auth state. Retain one owner per form across inner and outer category navigation.
- [x] Reuse/factor existing default/provider/credential saving and authentication behavior; remove the stacked home composition.
- [x] Add meaningful tests for view navigation, retained dirty candidates, guarded Back/close, pending state, and retained OAuth cancellation/progress before changing flow-specific persistence.
- [x] Checkpoint: opening Models issues only existing passive reads; no write, runtime, auth start, remote model query, or prompt.

## 3. Build the landing and provider management paths

- [x] Compose the flat model list with exact provider identity, accessible Add Model and Manage Providers actions, model/provider search, empty/loading/error recovery, and compact explicit default edit.
- [x] Build provider list/detail navigation using metadata capabilities, including unconfigured providers and built-ins with editable authentication but immutable definitions.
- [x] Move OpenAI login into the matching provider details while keeping one mounted authorization owner and existing pending/discard guards.
- [x] Checkpoint: existing default save/rebase tests and OAuth/API-key tests pass through the new navigation; current session controls remain unchanged.

## 4. Build Add Model as one shared creation path

- [x] Choose editable existing provider or New Provider. Link built-in activation to provider management rather than exposing unsupported model edits.
- [x] Collect connection + first model before new-provider persistence; use the common supported fields and existing model capability disclosure.
- [x] Reject duplicate provider/model IDs locally and retain candidates on invalid/server/conflict errors. Append to complete safe provider definitions, never available-only catalog entries.
- [x] Save definitions explicitly, then use confirmed provider/credential revision for a separately saved authentication step when needed.
- [x] Preserve partial success and saved identity. Retry key save only after credential failure; handle saved-with-warning by passive reload and truthful state.
- [x] Route both New Provider and provider-detail Add Model into this single flow; no duplicated save implementation.
- [x] Checkpoint: available-model catalog updates after confirmed writes; defaults remain explicit and unaffected unless separately saved.

## 5. Verification and review

- [x] Run focused settings interaction suites after each meaningful step; keep original coverage for unsaved/default conflicts, duplicate providers, key clearing, API errors, metadata/catalog stale responses, authorization state and cancellation.
- [x] Run `pnpm --dir web exec tsx --experimental-test-module-mocks --test server/settings-dialog.test.ts server/installation-settings.test.ts` and applicable existing OpenAI/provider/transport suites identified in research.
- [x] Run `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web build`, and `git diff --check` after the full change. A build-generated next-env.d.ts change remains outside the authored task diff.
- [x] Review keyboard/accessibility contracts in code (named actions, Back/heading context, focus target ownership, capability-disabled state, safe shared overlay usage), long IDs, semantic tokens, and use of existing flat settings primitives. Do not add CSS-string mirror tests.
- [x] Dispatch trellis-check for complete task scope/spec compliance and meaningful tests; fix genuine findings and rerun only checks justified by changes/failures.
- [x] Do not use browser automation, browser tests, screenshots, remote provider probes, or paid prompts. Report code-only verification accurately.

## 6. Integration and finish

- [x] Update global-settings/OpenAI authorization specs to describe the final screen ownership and state invariants; remove temporary rejected-layout language while retaining the exact contracts.
- [x] Verify the final requirements-to-tests mapping, truthful persistence feedback, preserved unrelated edits, and authored diff.
- [x] Follow phase 3 commit/finish instructions with task-only staging. The user explicitly authorized this task’s commit/push on 2026-10-27; work commit bf2d5d9 includes only this task’s source/test/spec changes.
- [x] Record final verification and task progress; archive only when task work and required finish steps are complete.

## User correction after initial review: subscription-login discoverability

- [x] Add a compact home ChatGPT / Codex subscription entry opening a dedicated auth view rather than generic provider/API-key details.
- [x] Reuse one auth owner/capability/operation, keep navigation passive, preserve connected/unsupported/pending/cancel behavior and dirty guards.
- [x] Prove a missing-entry regression before the fix; rerun focused tests/typecheck and a focused independent check. Update final verification evidence.
- [x] Preserve the already-presented commit plan pending the user's explicit commit instruction; no automatic commit or push.

## User correction: align the whole home structure with other settings categories

- [x] Replace the bespoke home header and styled compact section wrappers with the same h3/explanation + continuous SettingRow composition as Appearance/Conversation.
- [x] Place provider management and available-model actions on corresponding rows; preserve direct subscription access and all retained state/guards.
- [x] Remove the prior global final-row-border workaround and unused home-only action CSS. Keep normal shared row borders and existing section spacing.
- [x] Add a meaningful component-structure regression, run settings tests/typecheck, independent review, and verify delivered CSS without browser testing.
