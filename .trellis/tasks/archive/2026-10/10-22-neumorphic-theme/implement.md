# Implementation plan

Status: implementation, review and verification complete; user-approved work committed as `d706f08` on 2026-10-22. Trellis finish-work owns final archive/journal bookkeeping.

## 1. Baseline and ownership

- [x] Recheck working-tree changes and preserve the existing `web/next-env.d.ts` edit.
- [x] Capture flat light/dark desktop and narrow screenshots plus representative computed control/composer/popup geometry and focus styles before changing product code.
- [x] Load Phase 2.1 and dispatch the Trellis implement agent with the active task path, PRD/design/plan and curated context. Use one implement writer for this cohesive preference/CSS change. The agent owns the listed presentation/preference files and related tests; it must preserve other contributors' edits.

## 2. Appearance lifecycle (R1, R3)

- [x] Add the independent `visualStyle` field, type, flat default and field-wise decoder while retaining the preference key/version.
- [x] Extend the existing application helper/environment callback to apply both dimensions consistently on initialize/update/reset/external events, including environments with no document.
- [x] Extend the existing pre-paint script with the same allowlisted attribute outcomes and retain the cache-recovery/hydration seam.
- [x] Add the separate “视觉风格” Select with “线性扁平” and “新拟态” choices in AppearancePanel. Retain the existing theme selector and auto-save/reset/warning behavior.
- [x] Extend meaningful preference/bootstrap regressions: missing/invalid legacy style, independent partial updates, all mode/style pairs, reload, cross-tab no-write-loop, group reset and denied storage. Compare actual bootstrap and runtime attribute outcomes, not copied implementation strings.

## 3. Material styling (R2, R4, R5)

- [x] Extract the existing palette into `styles/themes.css` without changing flat values; introduce only consumed geometry/material roles with exact flat fallbacks.
- [x] Define neumorphic light/dark role values and preserve system-mode CSS behavior independently of style.
- [x] Connect shared control and overlay CSS to material roles. Keep the Button interface and expose variant semantics only if necessary for CSS.
- [x] Audit native feature controls and the composer/sidebar/settings/preview/command surfaces so the alternate style is coherent beyond primitives. Keep layout/density/circle geometry and structural JSONL highlights intact.
- [x] Verify actual hover, active/pressed, checked, selected/highlighted, invalid, disabled and focus states. Keep one visible focus cue and material shadows together.
- [x] Extend existing settings/routed regressions to cover style selection, `/projects` cross-tab application and retained current draft/route/disclosure state without a business mutation. Reuse established mocked UI boundaries.

## 4. Verification and review

- [x] Run focused web suites while iterating:
  `pnpm --dir web exec tsx --experimental-test-module-mocks --test server/web-preferences.test.ts server/theme-bootstrap.test.ts server/ui-primitives.test.ts server/workbench-interactions.test.ts`.
- [x] Run required final checks from the repository root: `pnpm typecheck`, `pnpm test`, `pnpm web:build`, `git diff --check`. There is no root lint command to invent.
- [x] Browser-check both visual styles at 1440px/390px/320px in explicit light/dark; also check system-following color changes with each style. Reuse a representative isolated fixture with existing history/Markdown/tools and no paid prompts.
- [x] Exercise settings Select/Combobox portals, keyboard focus, nested Escape, final focus, dialog/mobile drawer, composer and preview actions. Check no horizontal overflow, clipped controls or hydration/resource errors.
- [x] Change style from settings, refresh, change it in a sibling tab including `/projects`, reset Appearance, and verify first-render restoration and retained session/draft/attachment/disclosure state. Confirm the toggle sends no business mutation request.
- [x] Capture before/after screenshots and computed-style evidence, and record results in the task. Recheck actual served CSS if browser behavior differs from source.
- [x] Dispatch the Trellis check agent sequentially with whole-task ownership for review/self-fixes. Any new fix gets its relevant checks; avoid simultaneous writers on the preference/CSS seams.

## 5. Contracts and completion

- [x] Update frontend visual-system, component and global-settings specs to document independent mode/style ownership, default compatibility, state/material roles and browser verification.
- [x] Recheck R1–R5 against AC1–AC6 and preserve unrelated changes.

- [x] Obtain the Phase 3.4 one-shot commit confirmation.
- [x] Commit task-owned work as `d706f08` and hand off archive/journal recording to `trellis-finish-work`.

## Rollback points

Keep appearance lifecycle and visual styling separately reviewable. Flat remains the immediate user fallback. If the alternate style fails contrast/layout verification, fix the role owner rather than adding page-specific suppressions. A full rollback reverts only task-owned changes and never deletes browser preferences, project/session data or the pre-existing worktree edit.
