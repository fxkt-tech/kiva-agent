# Verification record

## Constraints

The user explicitly forbids browser testing. No browser/computer automation, screenshots, remote-provider probes or paid model prompts may be used for this task. Check outcomes below are code-only.

## Preserved baseline

- Branch: feat/model-settings-workflow, based on main (9fc0a01).
- Earlier uncommitted settings experiments are superseded by this task; baseline patch: /tmp/kiva-model-settings-baseline/settings.diff.
- Earlier first-send/session-shell changes and workspace-routing spec/tests remain outside task scope. Baseline patch: /tmp/kiva-model-settings-baseline/unrelated.diff.
- User/generator-modified web/next-env.d.ts exact starting contents: /tmp/kiva-model-settings-baseline/next-env.d.ts. Standalone HTML files remain untouched.

## Completed checks

- Parent service-boundary regression: `pnpm --dir web exec tsx --experimental-test-module-mocks --test server/installation-settings.test.ts server/provider-authorization.test.ts` → 19 passed, 0 failed. Log: /tmp/kiva-model-settings-service-tests.log. Backend contracts remain unchanged by the frontend redesign.
- Planning manifests: task.py validate → implement/check contexts each have 8 real existing entries, no warnings after using the bounded visual-contract research summary.

## Implementer evidence

- Settings-dialog suite: latest 41/41 passed after retained old assertions plus new explicit workflow, full-definition append, independent capability, partial-save/key retry, dirty Back, retained OAuth/default state, capability loss, saved-with-warning, 200-model cap, pending handler and catalog-recovery cases.
- Web typecheck and diff checks passed after the final implementation guard changes.
- Full web suite: 525/525 passed before the last small navigation/cancel guards and three additional settings tests. Log: /tmp/kiva-model-settings-all-tests.log. A final full suite is delegated to the check agent because production guards changed afterward.
- Production build passed. Log: /tmp/kiva-model-settings-build.log. Generated next-env.d.ts will be restored to exact pre-task contents by the parent after all builds.

## Final full-scope review and checks

Native trellis-check reviewed all affected kiva-web frontend changes against the task artifacts and curated specs. It fixed three concrete regressions before its final handoff:

1. Heading focus stole focus from the outer category tablist. Focus now changes only for inner-view transitions; category navigation retains tab focus.
2. A dirty default edit lost Cancel when its refreshed catalog became empty. Cancel remains reachable in every editing state.
3. A retained candidate after revision reload could merge with externally added models to exceed the 200-model cap. Validation counts the refreshed-definition/candidate ID union, guards both UI and direct save handler, retains the candidate, and explains the limit. The regression test was confirmed failing before the fix.

The reviewer also removed implementation-facing provider copy/remote-connection implications. No unresolved code findings remain.

- Final focused settings suite: 44/44 passed. Log: /tmp/kiva-model-settings-review-focused.log.
- Final complete web suite: 531/531 passed, 48 suites. Log: /tmp/kiva-model-settings-review-all-tests.log.
- Final web typecheck: passed. Log: /tmp/kiva-model-settings-review-typecheck.log.
- Final production build after reviewer fixes: passed. Command: `pnpm --dir web build`; log: /tmp/kiva-model-settings-final-build.log.
- Lint: no lint script configured in the web package.
- Final diff check: passed.
- Exact pre-task next-env.d.ts bytes restored after the final build. Combined unrelated shell/workbench/workspace-routing/next-env diff matches /tmp/kiva-model-settings-baseline/unrelated.diff exactly.
- No browser/computer automation, screenshots, remote provider calls, real-account OAuth or paid prompts were used.

## Acceptance coverage

| Criteria | Evidence |
| --- | --- |
| AC1 | Passive model-home/setup entries, exact provider/model identity/search/default, catalog-error recovery tests |
| AC2 | Complete-definition append, duplicate-ID checks, initial 200 cap and merged-cap-after-reload tests |
| AC3 | Staged new-provider definition/key-only retry, pending/duplicate handler guard, saved-with-warning tests |
| AC4 | Immutable built-in definition and independently editable auth; retained existing advanced-auth/login tests |
| AC5 | Explicit default pair/save, retained default candidate, always-reachable Cancel, unchanged defaults after creation/auth |
| AC6 | Dirty Back/discard, pending save, one retained OAuth owner/cancel, category focus, stale reads and explicit revision recovery |
| AC7 | 531 complete web tests, final typecheck/build/diff checks, native full-scope review, shared flat setting primitives and no browser QA |

## Completion state

Initial implementation/review completed and the one-shot commit plan was presented. The user then reported that Codex subscription login was missing, so the task returned to focused implementation before any commit. Passive actual-installation GET /api/settings confirmed `openai.authorization.canLogin=true`, while the legacy `openai-codex` metadata has no new-login capability: the regression is discoverability, not deleted backend support. Add a clear home subscription entry and direct authorization subview without generic provider forms. No work commit, push, archive or journal auto-commit has been performed. Earlier non-settings changes remain outside this task.

## Subscription-login discoverability correction

User feedback: the Codex subscription login appeared removed after the IA redesign. Root cause was the missing home signpost and generic-provider indirection, not removed backend capability. A passive actual-installation metadata read confirmed openai canLogin=true while openai-codex remained legacy metadata without new login capability.

- Red reproduction: the new home-discoverability test failed before implementation because home had no ChatGPT / Codex subscription entry. Log: /tmp/kiva-model-settings-subscription-red.log.
- Corrected UX: a flat home subscription row with current auth state and an explicit connect/manage/explanation action opens a dedicated subscription view; it never expands generic API-key/connection fields. Only the original explicit login button starts OAuth. One existing authorization owner also serves provider detail and retained pending/cancel/dirty state.
- Added coverage: discoverable passive entry and exact original OAuth route, connected/disabled reason, retained one owner across home/detail/category navigation, dirty return guard, and capability-absent/legacy-only explanatory recovery without inventing a legacy login route.
- Native trellis-check: no production findings remain; retained prior keyboard/default-cancel/merged-cap fixes. Added the missing legacy-only test.
- Final complete web tests: 536/536 passed, 48 suites; settings subset 49 passed. Log: /tmp/kiva-model-settings-subscription-review-all-tests.log.
- Final web typecheck: passed. Log: /tmp/kiva-model-settings-subscription-review-typecheck.log.
- Production build after the correction: passed; log /tmp/kiva-model-settings-subscription-final-build.log.
- No browser/computer automation, real account/OAuth interaction, commit or push was performed. The earlier commit plan remains unchanged and unapproved; the user's latest message was a product correction, not commit consent.

## Screenshot correction: duplicate section dividers

The user's supplied screenshot showed pairs of lines at the default/subscription section boundaries. Source inspection confirmed shared `.settings-row` bottom borders combined with subsequent `.settings-section` top borders. The existing composition now suppresses only a section's final direct row border, letting the next section own the boundary. Internal row separators and expanded default-summary/editor separation remain intact.

- Change: one CSS rule, `.settings-section > .settings-row:last-child { border-bottom: 0; }`.
- Existing settings interaction suite: 49/49 passed; log /tmp/kiva-model-settings-dividers-tests.log.
- Diff check passed. No new CSS-mirror tests, browser tests, screenshots or build were performed for this reversible CSS-only change. Previous full web suite/typecheck/build evidence remains applicable to unchanged logic.
- Focused independent source/cascade review passed with no findings: final direct row boundaries are suppressed, internal/expanded-editor separators and theme controls are preserved.

## Live delivery correction after “nothing changed” feedback

The previous source/cascade check was insufficient evidence that the running page had received the fix. Passive HTTP retrieval of the actual project page and its linked dev stylesheet proved the served CSS still omitted the final-row rule even though it existed on disk. The first mtime-only invalidation still returned the stale artifact; a reversible content-change/revert triggered the live dev compiler. After recompilation, the actual project-linked stylesheet returned:

```css
.settings-section > .settings-row:last-child {
  border-bottom: 0;
}
```

The HTTP assertion then passed against the project page's linked CSS (/_next/static/chunks/_1j1vqrm._.css). This was direct HTTP asset verification, not browser testing. No service restart, live runtime command, stored credential read, new unit test, or persistent extra source edit was needed. Diff check passed. Do not equate source-only style checks with live stylesheet delivery; when a user reports no visible change, inspect the actual referenced asset before claiming completion.

## User correction: model home differs structurally from other settings pages

The latest user feedback rejects the narrow divider/cache diagnosis as a complete answer. Comparing AppearancePanel/ConversationPanel with ModelsSettings shows the deeper layout inconsistency: ordinary categories have one settings-section-heading (h3 + explanation) and continuous SettingRows, while Models had a custom navigation header and separate styled settings-section wrappers for Default, Subscription and Available Models. The wrappers induced additional section borders/margins; suppressing a final row border treated that symptom rather than matching the existing composition.

Corrective implementation will use the same home heading/row composition, keep actions in the corresponding rows, retain explicit subscription and all existing flows, and remove the prior global last-row-border workaround. Inner-view Back navigation remains distinct and functional. No browser testing is authorized.

### Structural correction outcome

- Models home now uses the same single settings-section-heading h3 + explanation and continuous SettingRows as Appearance/Conversation. Default/subscription/catalog regions are plain wrappers with no styled section boundary. Provider management and available-model Add/Refresh actions sit on their respective row's right side using existing control composition. Custom Back/navigation remains only in inner views.
- The previous global final-row-border suppression and unused home-actions CSS were removed. Shared section spacing was not modified.
- A red-capable component regression compares actual Models/Appearance/Conversation heading/row composition. Final settings suite 50/50 and web typecheck passed; logs /tmp/kiva-model-settings-composition-tests.log and /tmp/kiva-model-settings-composition-typecheck.log.
- Native independent trellis-check passed source/composition/cascade review with no additional findings. Retained default/auth/provider state, tab focus and dirty/pending guards remain intact.
- Direct HTTP delivery verification passed against the actual project page: linked settings JS contains the new standard home composition; linked CSS no longer contains the old global final-row-border workaround or home-actions styles. A reversible stylesheet invalidation triggered the dev compiler; exact authored source was restored with no temporary comment or extra diff.
- Diff check passed. No browser/computer automation, screenshots, full-suite/build reruns, commit or push were performed for this focused presentation correction. Earlier complete functional test evidence remains recorded above, superseded by current 50-setting-test evidence for touched components.

## Commit/publication approval

On 2026-10-27 the user explicitly requested “提交&推送”, approving the already-presented task-only scope. Work commit `bf2d5d9` contains the nine intended source/test/spec files. Earlier first-send/session-shell changes, next-env.d.ts and standalone HTML files were not staged. Task archive and journal bookkeeping follow under trellis-finish-work before pushing the feature branch. No merge into main is implied.
