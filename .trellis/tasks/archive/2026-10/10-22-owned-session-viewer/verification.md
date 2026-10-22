# Verification

Status: implementation and production acceptance passed on 2026-10-22; subsequent user-reported stale development CSS was reproduced, recovered and revalidated on the actual9495 origin. Work commit confirmation remains pending (workflow Phase 3.4).

## Acceptance results

| Acceptance | Result and evidence |
| --- | --- |
| AC1 ownership | Project-owned React/TypeScript/CSS modules with pinned Pi 1.3.0 MIT attribution. No iframe, private exporter/runtime import or new dependency. |
| AC2 reading/navigation | Branch fixture: newest valid leaf, alternate branch, ancestor returning to newest descendant, five filters, search/labels, thinking/tool/hidden controls and confirmed paired outputs. Models, dialog tests and browser interactions pass. |
| AC3 source fidelity | Exact returned raw text and downloaded bytes checked with CRLF, BOM, blank lines, malformed records and incomplete tail. Truncated download explicitly uses `.partial.jsonl`. Text/link clipboard actions and canonical exact branch/target reopening pass, including duplicate-ID line fallback. |
| AC4 passive integration | Menu opened another session over an existing conversation while retaining the same textarea DOM, draft, attachment, route and socket. Direct archived/trash links work without sidebar membership. Zero command/API mutations; every fixture history SHA-256 remains unchanged. Scope mismatch, retry, missing records and invalid query checks pass. |
| AC5 integrity/performance | Pure coverage includes duplicate/missing/forward/cyclic ancestry, primitives/malformed records, ambiguous/off-window/omitted-block tools and finite/missing/overflow usage. Iterative deep/wide 25,000-node models pass. Browser near-8-MiB source and old-page-boundary target tests pass; details field depth/pagination remain bounded. |
| AC6 themes/accessibility | 18 layout cases: flat/neumorphic/Swiss × light/dark × 1440/390/320, full-viewport popup, no horizontal overflow, mobile full-width reader and on-demand tree. Native keyboard, pane pointer/key resizing, nested Escape/focus return, tab Home, outer focus trap, independent scrolling, source depth16 at320 and system-theme state retention pass. Screenshots visually inspected. |
| AC7 gate | Independent trellis-check: root5 + web333 =338 tests, typecheck and diff-check pass. Final production build passes. No lint script exists. |

## Commands and logs

- `pnpm typecheck` — pass. `/tmp/owned-session-viewer-check-typecheck.log`.
- `pnpm test` —338 passed, zero failed/skipped. `/tmp/owned-session-viewer-check-test.log`.
- Focused dialog/workbench suites —80 passed (included in the full total). Pure structure/presentation/session coverage —20 passed (included in the full total).
- `pnpm web:build` —pass after the final UI fixes. `/tmp/kiva-owned-viewer-evidence/build-final.log`.
- `git diff --check` —pass.
- Trellis context manifests validate without truncation warnings. Check context contains a focused excerpt of the final canonical contract.

## Measured scale

- Pure Node measurement:8,388,281 bytes,38,669-record deep chain; index132.83ms, branch selection2.40ms, first reading projection11.45ms, cached projection0.08ms. Heap91.6MiB includes source/fixture. Script:`/tmp/kiva-owned-model-benchmark.mts`.
- Isolated production Chromium:8,388,452 bytes,55,002 records; menu open to selected last-window record885ms, tree Home21ms/End17ms, search plus source target reveal113ms. Observed last-window DOM:1,646 elements,121 tree rows,40 records; limits remain160/60. Values are local measurements, not universal latency guarantees.
- The branch index covers the complete returned snapshot; it does not claim to recover bytes beyond the existing backend8MiB limit. Large text/line/block/field previews explicitly clip and retain the raw snapshot.

## Browser evidence and reproduction

All scripts, generated fixture repositories, fonts and screenshots are outside the working tree:

- `/tmp/kiva-owned-viewer-evidence/browser-main.mjs` / `browser-main.json`:18 matrix cases and7 interaction groups; screenshots `viewer-{style}-{mode}-{width}.png`.
- `/tmp/kiva-owned-viewer-evidence/browser-edge.mjs` / `browser-edge.json`:9 integration/integrity/performance groups, exact history hashes and zero mutations.
- `/tmp/kiva-owned-viewer-evidence/browser-bounds.mjs` / `browser-bounds.json`:8 focused geometry/focus/bounds checks. At320px the deepest enabled field toggle is16px wide, source popup width/scrollWidth302px, document width320px. Pointer separator470px.
- Baseline old-viewer screenshots:`before-jsonl-{1440,390,320}.png`. Native Pi reference screenshots:`/tmp/kiva-jsonl-research/integration/`.
- Fixture uses `/tmp/kiva-running-composer-evidence/controlled-fixture.mts`, a deterministic no-model custom server on9497 with disposable projects. Setup is in `/tmp/kiva-owned-viewer-evidence/setup-fixture.mjs`.
- Cached Playwright Chromium ran with `/tmp/kiva-running-composer-evidence/fonts.conf` and the existing cached Firefox library directory. No dependency installation or production fixture file was added.

## Review fixes and limitations

- Review identified ordinary tree selection retaining an older leaf and falsely reporting a missing link. Tree navigation now always chooses the newest descendant; source links retain a valid current branch; copied initial links retain an explicit valid historical branch. Regression and browser checks pass.
- Unpaired tool output honors the global output control; invalid/oversized IDs use line fallback. Cross-window tree Home/End restores focus explicitly.
- Normal backend conversation projection cannot parse null/primitive entries. This pre-existing backend behavior is outside this frontend task. Those raw records were tested through the exact `/jsonl` document response, without corrupting the fixture's ordinary metadata/list projection. The viewer host itself does not depend on that projection succeeding; routed tests cover its failure.

## Preservation

- Saved original running-composer patch/files are in `/tmp/kiva-owned-viewer-evidence/`. `composer.tsx`, its task artifacts and `web/next-env.d.ts` remain byte-identical to their pre-task snapshots.
- Shared CSS/tests contain only JSONL changes relative to those snapshots; the entire composer visual-spec section remains identical. The proposed work commit excludes their pre-existing composer hunks.
- Initial acceptance preserved user server9495 at PID15862. After the screenshot report, all3 projects/4 sessions were verified dormant/idle and the service was gracefully reloaded with its original command/environment to PID66765. Current development CSS and actual1440/390/320 geometry now pass. All4 history hashes/bytes are unchanged. `.next/dev` and its cache were not removed; next-env remains preserved. See `research/dev-css-regression.md`.
- A scratch-index task-only patch applies cleanly to HEAD:31 paths, excluding composer.tsx, its task and next-env. The shared-file delta is JSONL-only; prior composer CSS, workbench tests and visual-spec changes are excluded. Real index untouched. Evidence:`task-only-plan.json`, `owned-session-viewer-only.patch` in the temporary evidence directory.
- No commits, archive, journal auto-commits, push or merge performed. Separate composer approval remains pending.

## User-reported live CSS regression

Production-only acceptance missed server9495 serving the old grid stylesheet with new tree JSX. Native browser reproduced and verified recovery of the exact502-record session at1440/390/320. Recovery required one graceful idle-only service reload, with no code/style workaround or cache deletion. No product source changed, so prior338-test/typecheck/build results remain applicable; focused actual-origin browser checks and independent recovery review cover this failure. Root-cause evidence and the strengthened canonical verification contract are in `research/dev-css-regression.md`.

## Compact header follow-up (R8 / AC8)

- Replaced the separate title and tabs/snapshot toolbar with one54px `.jsonl-header`. Title/name and desktop file/size each occupy two small text lines within the band. At720px and below, secondary file metadata/download text hides, leaving an accessible28px download icon. Alerts remain below the header.
- Actual9495 native Chromium:18 header geometry cases (flat/neumorphic/Swiss × light/dark ×1440/390/320) all measure54px. Long CJK/unbroken title and filename remain ellipsized; tabs/download/close share a centerline and stay in bounds without overlap or header/document overflow. At320, identity108px, tabs122px, download28px and close28px fit in one band.
- Partial/loading/error headers also remain54px. Verified native tab arrows/Home, exact raw text and retained reader instance, mobile icon download byte fidelity, explicit partial accessible label/filename, Escape and zero API mutations/page errors. Metadata/title overrides are browser-only, with no registered-session writes.
- Actual served dev CSS is current before and after production build:114,393 characters, new header selector present, obsolete toolbar selector absent. Same9495 service PID66765; no reload/cache action needed for this follow-up.
- Independent header review found no issues. `pnpm test`:338 passed; `pnpm typecheck` and `git diff --check`:pass. Logs:`/tmp/owned-session-viewer-header-check-{test,typecheck}.log`. Final production build:`/tmp/kiva-owned-viewer-evidence/build-compact-header.log` passes. Existing next-env/composer/other-task bytes preserved.
- Evidence:`/tmp/kiva-owned-viewer-evidence/compact-header-browser.mjs`, `compact-header-browser.json`, `compact-header-served-css-final.json`, and `header-{style}-{mode}-{width}.png`. Canonical JSONL contract updated. Commit approval remains pending.

## Authorized commit boundary verification

User approved commit and push with “提交&推送” on2026-10-22. The work commit excludes prior composer implementation/tests and next-env. Exporting the exact proposed index caught a viewer test referring to two excluded composer-test helpers; its draft/attachment setup now uses inline `act` callbacks, preserving identical behavior without moving the prior helpers into this task.

Independent verification of the exact exported commit tree passes:root5 + web324 =329 tests, zero failures/skips, root/web typecheck pass. This excludes9 pending composer tests present in the combined338-test workspace result. Product source is unchanged by this test-only correction; prior production/browser results remain applicable. Logs:`/tmp/kiva-owned-viewer-evidence/commit-tree-final-{test,typecheck}.log`. The temporary export uses symlinked existing dependencies; pnpm's export-only auto-install warning did not prevent scripts from running or passing.
