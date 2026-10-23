# Running composer verification

Implementation was explicitly approved on 2026-10-22. All AC1–AC6 checks passed on the original `feat/running-composer` baseline. The changes were retained on `feat/owned-session-viewer`; the user authorized committing the remaining work and integrating updated remote `main` on 2026-10-23.

## Change and environment

- Product changes are confined to `web/features/sessions/composer.tsx`, feature rules in `web/app/globals.css`, and routed regressions in `web/server/workbench-interactions.test.ts`. No backend, runtime contract, dependency, shared primitive or checked-in fixture changes were required.
- Evidence lives in `/tmp/kiva-running-composer-evidence/`: baseline, acceptance and presentation scripts/JSON, before/after screenshots, fresh build log and original generated declaration. These are local test artifacts, not product assets.
- Browser mutations used fresh temporary Git projects at isolated `http://127.0.0.1:9496` with the existing deterministic adapter. A temporary fixture wrapper exposed controlled adapter events and overrode abort to emit settled without clearing the authoritative queue, matching the approved boundary. No paid model request or real session mutation occurred.
- Chromium used cached browser packages and temporary CJK fonts/library paths to support this machine's missing browser dependencies; no project dependency changed.
- The existing user server on 9495 and `.next/dev` cache were preserved. Only the production Turbopack cache was moved aside before the fresh build. The exact pre-existing `web/next-env.d.ts` bytes were restored and compared successfully afterward.

## Automated checks and independent review

- Focused routed interaction tests: **62/62 passed**. Log: `/tmp/running-composer-interactions.log`.
- `pnpm typecheck`: passed during implementation and independent review. Review log: `/tmp/running-composer-check-typecheck.log`.
- `pnpm test`: **318/318 passed** (5 root + 313 web; zero failed/skipped). Review log: `/tmp/running-composer-check-test.log`.
- `pnpm web:build`: passed with fresh production cache; compiled, typechecked and generated all routes. Log: `/tmp/kiva-running-composer-evidence/build.log`.
- `git diff --check`: passed. There is no configured lint script.
- Independent `trellis-check` reviewed the complete task/product/test/spec diff and the actual hook/submit/event paths. It found no concrete issues and made no edits, so no subsequent product rebuild was needed.

## Browser evidence

`baseline.json` and `acceptance.json` cover flat/neumorphic/Swiss × light/dark × 1440/390/320:

- **18 exact before/after comparisons** retained queue-free composer, action, settings and toolbar bounds and native textarea growth at empty/1/3/5/6 lines, including shrinking after clearing.
- **18 running/card cases** measured identical send/stop position and 30px circular bounds. Stop uses a filled square; Swiss keeps square card surfaces and a circular primary action. There is exactly one action button and one labelled clear-all control.
- Mixed-lane cards retain duplicates and escaped text. Long unbroken/multiline messages and many cards remain accessible in a bounded focusable scroll list. Native End scrolling, the thin focus outline, clear control and card labels passed; no horizontal document overflow or clipped action controls was found.
- A 320×480 short viewport retained the action with a six-line draft and overflowing queues.
- Actual click/Enter/Shift+Enter/Control+Enter interactions dispatch prompt/steer and preserve native newline behavior. Empty/whitespace send shortcuts issue no command; synthesized composition, Safari 229 and repeated Enter events do not submit or abort. Attachment-only input exposes send and retains the captured text-file payload.
- A held/rejected enqueue confirmed optimistic stop, disabled send for the next draft and captured-source text restoration. Explicit keyboard stop dispatched only abort; authoritative queue cards remained while idle.
- Refresh and a sibling tab recovered authoritative cards; consumption/clear-all updated both tabs. Clear-all targeted the exact current session. Navigation ignored late updates from the prior session.
- No page errors occurred. The deliberately rejected enqueue produced the expected 409. One cancelled Next route-prefetch request (`net::ERR_ABORTED`) was recorded separately; no unexpected resource failure remained.

`presentation.json` and `presentation-*.png` repeat the compact mixed/duplicate stack in all **18 combinations**, with settled navigation transitions and hit-tested action visibility. Six actual mobile popup checks passed for context/model controls at 390/320; Escape/focus return and slash-palette dismissal passed. Main visually inspected flat/light desktop, Swiss/dark 390 and neumorphic/light 320: cards are inset and attached behind the composer; text, static labels, counts and clear-all remain readable.

`live-origin.json` records a passive read of the existing `http://127.0.0.1:9495/projects`: served CSS includes `.composer-queue`, `.queue-card` and current action/position rules. That check issued no mutation requests and did not restart the service. Only the isolated test service was stopped after acceptance.

## Acceptance reconciliation

| Criterion | Evidence |
| --- | --- |
| AC1 / R1 | Single mounted native action, state/attachment/pending/failure regressions; 18 browser equal-bound measurements. |
| AC2 / R2 | Mixed/duplicate/escaped authoritative cards, labels/counts/clear-all regressions; compact and overflowing card matrices. |
| AC3 / R1, R3 | Both shortcut modes, IME/repeat/disabled guards, pending source restoration and settling/navigation tests; native browser interaction. |
| AC4 / R4 | Three styles, both color modes, desktop/390/320 and short-height bounds; thin keyboard focus, internal scrolling and mobile popups. |
| AC5 / R3, R5 | Scoped event/consume/reconnect/clear/abort tests and real fixture refresh/sibling-tab/navigation checks; no local queue inference. |
| AC6 / R1–R5 | Typecheck, 318 full tests, fresh production build, full independent review, browser evidence and whitespace checks. |

## Final combined review (2026-10-23)

- Independent `trellis-check` reviewed the retained composer delta with the committed viewer/pagination and current canonical specs; no findings or edits.
- `pnpm test`: **339/339 passed** (5 root + 334 web, zero failed/skipped). Log: `/tmp/kiva-main-integration-20261023/composer-check-test.log`.
- `pnpm typecheck` and `git diff --check`: passed. Typecheck log: `/tmp/kiva-main-integration-20261023/composer-check-typecheck.log`.
- The composer source remains byte-identical to the browser-accepted implementation. Original `web/next-env.d.ts` bytes remain preserved; generated output is excluded from the commit.
- Remote `main` at fetch is `ce5f2f1`: it already contains the owned viewer and adds the brand logo/favicon update. Integrate that update without replacing it.

Implementation is complete and the user has authorized the recorded commit and integration plan. Task archive and journal follow the work commit.
