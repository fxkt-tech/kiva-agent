# Swiss style implementation plan

Status: implementation and verification complete on 2026-10-22; evidence is in `verification.md`. Phase 3.4 commit-plan approval and current-branch push were supplied by “提交&推送”.

## 1. Baseline and ownership

- [x] Recheck branch/worktree and preserve the pre-existing `web/next-env.d.ts` bytes. After approval create a feature branch from current main and record it on the task.
- [x] Capture flat and neumorphic light/dark screenshots and representative computed geometry, colors, shadows and typography before product writes, including desktop/390px/320px.
- [x] Load Phase 2.1 and dispatch one Trellis implement agent with the active task path and curated context. It owns task-related product/tests; main owns browser evidence, task/spec coordination and finish-work. All agents must preserve other contributors' changes; do not use concurrent writers on preference/CSS seams.

## 2. Third-style lifecycle (R1, R3)

- [x] Establish one shared style allowlist and derived type/normalization. Extend field-wise decoding with `swiss` while retaining v1 storage and flat fallback.
- [x] Make runtime root application and the pre-paint allowlist support every normalized non-flat style consistently. Retain size/version/error handling and stale-attribute cleanup.
- [x] Add the “瑞士风格” Select option; preserve “扁平化”, “新拟态”, independent mode selection, auto-save, group reset and warning behavior.
- [x] Extend actual preference/bootstrap parity, invalid/legacy input, transition, reload/reset and cross-tab regressions. Cover all three styles in system/light/dark modes without duplicating a private style decoder in tests.

## 3. Swiss presentation (R2, R4, R5)

- [x] Define Swiss light/dark palette, restrained accent, crisp geometry and shadow-free material in the theme owner.
- [x] Add only consumed optional corner and heading weight/tracking roles. Preserve exact existing per-selector fallbacks and genuine circular controls; keep all dimensions, type sizes and spacing intact.
- [x] Connect shared controls and native navigation/settings/composer/preview/content surfaces to those roles. Check mobile radius overrides and fullscreen JSONL/structural shadow exceptions.
- [x] Verify normal/hover/pressed/open/selected/checked/invalid/disabled/focus states; retain one thin keyboard cue and status clarity. Do not add style props, component copies, business branches or dependencies.
- [x] Extend existing settings/routed tests to prove Swiss selection, transitions with both prior styles, `/projects` synchronization and retained current session presentation without requests or runtime starts.

## 4. Verification and independent review

- [x] Iterate with the existing focused suites:
  `pnpm --dir web exec tsx --experimental-test-module-mocks --test server/web-preferences.test.ts server/theme-bootstrap.test.ts server/ui-primitives.test.ts server/workbench-interactions.test.ts server/settings-dialog.test.ts`.
- [x] Browser-check Swiss light/dark at 1440px/390px/320px and system-following changes. Exercise actual selector/portal keyboard navigation, nested Escape/final focus, mobile navigation, composer/draft/attachment/disclosure retention, reset, refresh-first-frame and sibling-tab `/projects` updates.
- [x] Compare both old styles against their baselines for dimensions, palette, radii, shadows, typography and circle geometry. Treat the new settings option as the expected content change, not permission for broader visual drift.
- [x] Check readable accent/status/focus states and no clipped controls/document overflow. Exercise file/diff previews and fullscreen JSONL geometry/exact source in isolated fixtures with no paid prompts or user settings writes. Record console/HTTP failures separately from expected lifecycle fetch cancellation.
- [x] Dispatch the Trellis check agent sequentially for a whole-task review/self-fixes. Confirm final `pnpm typecheck`, `pnpm test`, `pnpm web:build` and `git diff --check` results (typecheck independently passed in implementation and review; main ran the full tests/build/browser checks); there is no configured root lint command. Repeat only checks relevant to new fixes.

## 5. Contracts and completion

- [x] Update theme-system/global-settings/component/visual-system specs as needed with three-style admission and concrete optional role/compatibility contracts.
- [x] Reconcile R1–R5 with AC1–AC6, record browser/check evidence and restore any build-only changes to the original generated declaration.
- [x] Prepare the Phase 3.4 one-shot commit plan after quality passes; commit/archive/journal only under the applicable approval/workflow steps. Preserve unrelated changes and avoid implicitly extending prior push authorization to this new task.

## Rollback

Existing flat/neumorphic choices are the immediate user fallback. Keep changes confined to style admission and semantic presentation. Fix mismatches at their shared role/lifecycle owner rather than adding page-specific suppressions; never clear browser preferences or project/session data.
