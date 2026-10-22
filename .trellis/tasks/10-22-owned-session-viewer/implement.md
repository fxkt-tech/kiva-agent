# Implementation plan

Status: scope/task creation/implementation approved on 2026-10-22. [x] Current branch: `feat/owned-session-viewer`.

## Preparation

- [x] Obtain combined approval of the final scope summary and a separate Trellis task. Then create it, copy these reviewed artifacts into its task directory, curate implement/check context, and activate only after artifact review.
- [x] Record the existing running-composer delta and exact original next-env bytes. Keep its commit/archive approval pending; do not amend, revert or silently include it in this task.
- [x] Read frontend component/theme/routing/visual contracts and the installed Pi 1.3.0 reference. Capture current viewer and native Pi comparison screenshots using only isolated fixture data.

## Implementation sequence

1. [x] Extend the owned source model for a complete returned-snapshot index, robust parent/branch/leaf traversal, diagnostic records and bounded tree/reading windows. Add meaningful pure tests for valid branches, duplicates, cycles, missing IDs and records beyond the old UI page boundary.
2. Build the Pi-style React navigation and branch reading components. Reuse semantic preview/Markdown/fields, implement conservative grouped tool results, filters/search and visibility controls, then add source details, copy and exact returned-snapshot download.
3. [x] Retain the existing full-screen data/error/raw shell and add mobile tree/pane resizing/focus semantics using the existing shared UI boundary. Replace obsolete JSONL split-inspector styles only.
4. [x] Consolidate dialog ownership into one feature host and add exact-session viewer deep links through the persistent shell. Preserve menu final focus, query validation, passive reads and scoped draft/attachment ownership.
5. [x] Add MIT provenance/notice for adapted source; remove obsolete task-owned viewer paths only after callers/tests are migrated. Avoid parallel old/new renderers or unrelated refactors.

Dispatch two trellis-implement agents with disjoint ownership: one for pure source/session/presentation models and their tests, one for React viewer/routing/CSS/integration tests. They agree the small data contract first. Main coordinates docs/spec/browser evidence. Only the UI agent writes globals.css/workbench-interactions.test.ts. Then dispatch trellis-check for the final complete task; all prompts identify this active task and load its curated context.

## Validation

- Focused structure/presentation/dialog/workbench/route tests: actual branch/filter/selection effects, source fidelity, copied-link reopening, no commands, stale scopes, archive/trash and exact focus ownership.
- `pnpm typecheck`, `pnpm test`, `pnpm web:build`, `git diff --check`; no lint script exists. Move aside only production Turbopack cache if needed and restore exact next-env bytes after builds.
- Browser: isolated no-model projects; flat/neumorphic/Swiss × light/dark at 1440/390/320; tree navigation/search/filter, branch target outside the render window, resizing, copy/download, nested Escape, mobile focus, raw fidelity, style changes with retained selection and zero runtime mutations.
- Performance: near-8-MiB snapshot, many short records, deep/wide branches and long tools. Record parse/render/selection responsiveness and DOM bounds; preserve diagnostics and complete access to returned raw data.
- Update only the canonical JSONL visual contract with the final owned-module signatures and deliberate inspector/branch changes. Reconcile AC1–AC7 with evidence.

## Completion

Prepare a concrete task-only commit plan after all checks pass. Commit/archive/journal follow the applicable confirmation. The pending running-composer work remains separately tracked; no push or merge is included.

## Completion evidence

All implementation steps,338 tests, typecheck, final build, independent review and browser gates passed. Canonical JSONL visual contract updated; see `verification.md`. Task-only commit plan prepared in `commit-plan.md`; awaiting Phase3.4 confirmation. Prior running-composer work remains pending and unchanged.

## Live-origin regression follow-up

The screenshot report reopened acceptance after the initial production gate. Implementer verified existing CSS imports/rules; actual9495 was serving stale old grid CSS. Main reproduced it, audited every registered scope as dormant/idle, gracefully reloaded the service and verified current served CSS plus desktop/mobile computed bounds and unchanged history hashes. No product code changed. Canonical JSONL verification now requires actual-origin freshness; details: `research/dev-css-regression.md`. Commit approval remains pending.

## Compact header follow-up

- [x] Merge dialog heading and snapshot/tab toolbar into one compact band, preserving accessible controls and content state.
- [x] Implement responsive two-line metadata within the band, icon download and deliberate truncation at320/390.
- [x] Run focused dialog/workbench checks and typecheck through implement/check agents; main validates actual-origin CSS and native browser geometry/focus/download, updates the canonical spec and evidence.

Compact-header follow-up complete:338 tests/typecheck/build and independent review pass; actual9495 all18 geometry cases plus loading/error/partial controls pass at54px. See verification.md. No commit/reload/cache changes performed for this follow-up.

Commit/push authorized by the user. Exact task-only export passes329 tests and root/web typecheck after making one viewer integration test independent of excluded composer helpers. Prior composer delta remains unchanged.
