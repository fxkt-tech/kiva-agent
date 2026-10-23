# Running composer commit plan

Status: approved by the user's 2026-10-23 request to commit the remaining work, pull remote updates and merge into `main`. The original `feat/running-composer` changes are now carried on `feat/owned-session-viewer`.

## Work commit

`feat(web): align running composer interactions`

- `web/features/sessions/composer.tsx`
- `web/app/globals.css`
- `web/server/workbench-interactions.test.ts`
- `.trellis/spec/kiva-web/frontend/visual-system.md`
- `.trellis/tasks/10-22-running-composer/prd.md`
- `.trellis/tasks/10-22-running-composer/design.md`
- `.trellis/tasks/10-22-running-composer/implement.md`
- `.trellis/tasks/10-22-running-composer/task.json`
- `.trellis/tasks/10-22-running-composer/verification.md`
- `.trellis/tasks/10-22-running-composer/commit-plan.md`

One coherent frontend interaction change: a stable shared send/stop action and composer-attached authoritative read-only queue cards, with meaningful state/scope regressions and final executable contracts/evidence.

Validation: the original composer acceptance passed 62 focused tests, 318 full tests, typecheck, a fresh production build, independent review and browser matrices. Final combined viewer/composer review on 2026-10-23 passed all 339 tests (5 root + 334 web), typecheck and whitespace checks. Details: `verification.md`.

## Excluded pre-existing change

- `web/next-env.d.ts` — unrelated pre-existing user modification, preserved byte-for-byte. Exclude it from all commits.

Temporary browser scripts, fonts, fixture data, screenshots and production-cache backup remain outside the repository.

## Bookkeeping after the work commit

Execute the work commit first, then use `trellis-finish-work` to archive this completed task and record its journal entry. Leave other active tasks alone. Pull the latest remote `main`, merge the feature work, validate the integrated result and push the updated branches. Do not amend or delete branches.
