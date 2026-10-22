# Swiss visual style verification

Implementation approved by the user on 2026-10-22. Work is on `feat/swiss-theme`; the user approved the commit/archive/journal batch and current-branch push with “提交&推送”.

## Environment and scope

- Production-browser evidence uses an isolated fixture at `http://127.0.0.1:30249`, with temporary Git projects, local fake runtime/catalog and clean browser contexts. No real user settings or paid prompts are used.
- Temporary evidence directory: `/var/folders/pk/ts3f4ygd0dbdsl6nt4d31hpm0000gn/T/kiva-swiss-browser-1_l7ztri` (also recorded in `/tmp/kiva-swiss-browser-current`). Screenshots and scripts are local evidence, not product assets.
- The existing user server on port 9495 is preserved. The pre-existing `web/next-env.d.ts` bytes are backed up and restored after production builds; that unrelated edit is excluded from the commit plan.

## Automated checks

- Focused preference/bootstrap/primitive/workbench/settings regressions: 103 passing tests, independently repeated by the Trellis check agent.
- `pnpm typecheck`: passed during implementation and independent review.
- `pnpm test`: passed (5 root tests + 304 web tests; no failures/skips).
- `pnpm web:build`: passed, including the fresh-production-cache build used for final browser acceptance (`fresh-build.log`).
- `git diff --check`: passed.
- No root lint command is configured.

## Production artifact finding

The first production browser run showed `data-visual-style="swiss"` and `--surface-radius: 0px`, but the composer retained an 18px radius. CSSOM contained old literal corners and old navigation foreground rules, while imported theme/primitive rules were current. An independent transform through the project's actual PostCSS/Tailwind plugin preserved all optional roles with optimization both enabled and disabled. This distinguishes a stale production artifact from a source-variable failure; no CSS workaround or new dependency was introduced.

The fixture was stopped and only `web/.next/cache/turbopack` was moved to the evidence directory as `production-turbopack-cache.before`. The user development cache at `web/.next/dev/cache` was preserved. The standard production build was rerun with a fresh production cache. Final browser acceptance then confirmed the composer radius is `0px`, material shadows are `none`, and heading weight is `700` in all six Swiss cases. Standalone transform evidence is in `/tmp/kiva-swiss-css-transform.mjs`, `/tmp/kiva-swiss-css-transform-results.json` and `/tmp/kiva-swiss-postcss-{false,true}.css`.

The old-style comparison was repeated against the fresh build: 12 cases (flat/neumorphic × light/dark × 1440/390/320), 372 visible element samples and no computed-property differences. The source/artifact diagnosis and production validation requirement are captured in the theme-system spec.

## Browser and independent-review evidence

- `old-style-comparison.json`: no differences in sampled geometry, palette, shadow, borders, font family/size/weight/tracking/line-height, spacing, switch/thumb geometry or focus properties. Before/after thread/settings screenshots are retained for each of the 12 cases.
- `acceptance-results.json`: Swiss light/dark × 1440/390/320 passed; document/settings/control bounds, composer geometry, heading hierarchy, nested Select Escape behavior, thin keyboard focus and mobile focus restoration passed. All three styles followed system light/dark changes; Swiss explicit modes overrode the opposite OS mode.
- Actual settings actions cycled Swiss → neumorphic → flat → Swiss, updated sibling `/projects`, preserved the composer DOM node, draft, local attachment, tool disclosure, route and session. Refresh restored dark/Swiss at the first animation frame; appearance-group reset restored system/flat in both tabs. No business mutation request or runtime start occurred.
- `primitive-comparison.json` and `after-primitives.json`: Badge and selected Select/Combobox styles were checked through actual rendered primitives. Four old-style/mode cases match their baselines exactly. Swiss Badge/option corners are square; selected text contrast is 4.86:1 light and 5.44:1 dark. Body contrast is 17.15:1 light / 16.86:1 dark; primary-action contrast is 6.14:1 / 7.05:1.
- `resource-results.json`: actual file and diff previews passed in light/1440 and dark/320. Menu-to-JSONL retained the full viewport (`x/y=0`, width=viewport, height=950, radius=0, shadow=none), and raw content matched the API exactly. No mutation/page errors occurred.
- `final-smoke.json`: no console errors, HTTP errors or unexpected resource failures. One API fetch cancellation during lifecycle/reload was recorded separately; history, tool card and composer were visible afterward. Final fake-runtime start count was zero.
- Main visually inspected Swiss light desktop thread, dark 390px thread, dark 320px settings and dark 320px JSONL. Sharp surfaces, restrained active/primary red, preserved circular actions and readable heading hierarchy match the approved direction.
- Independent Trellis check (`check_swiss`) found no task/spec/code defects and made no edits. The subsequent artifact investigation made no product changes, so its source review remains applicable.

The narrow long-line history fixture already clipped some timeline content before this task; both old-style baseline comparisons retained that geometry. This task preserves the layout contract. Document, settings, composer controls and JSONL bounds passed; no new clipping was introduced in those checks.

## Acceptance reconciliation

| Criterion | Result and evidence |
| --- | --- |
| AC1 / R1 | Passed: three settings labels, shared allowlist, field-wise legacy/invalid fallback; preference/bootstrap/settings tests and actual Select actions. |
| AC2 / R2 | Passed: Swiss light/dark presentation in six browser cases; unchanged old-style computed samples and primitive baselines. Existing dimensions, spacing, fonts and type sizes are preserved. |
| AC3 / R3 | Passed: first-frame reload, independent explicit/system modes, sibling `/projects` synchronization and appearance-group reset. |
| AC4 / R4 | Passed: mounted node/draft/attachment/disclosure/route retention, zero mutation requests and runtime starts. |
| AC5 / R5 | Passed: shared interaction/state tests, thin keyboard outline, nested overlays, mobile focus/bounds, visible status treatment and preview/JSONL checks. |
| AC6 / R1–R5 | Passed: focused and full tests, typecheck, production build, independent review and actual production-browser verification. |

Implementation and verification are complete. Phase 3.4 commit-plan approval and current-branch push were authorized by the user with “提交&推送”; proceed with the work commit, archive and journal, then push the feature branch.
