# Commit plan

Status: implementation/check/browser gates passed; user approved commit and push with “提交&推送” on2026-10-22.

## Proposed work commit

`feat(web): add owned Pi-style session reader`

Files (one coherent viewer change):

- `web/features/sessions/PI-VIEWER-NOTICE.md`
- `web/features/sessions/jsonl-structure.ts`
- `web/features/sessions/jsonl-session.ts`
- `web/features/sessions/jsonl-presentation.ts`
- `web/features/sessions/jsonl-timeline.tsx`
- `web/features/sessions/jsonl-tree.tsx`
- `web/features/sessions/jsonl-thread.tsx`
- `web/features/sessions/jsonl-record-details.tsx`
- `web/features/sessions/session-jsonl-dialog.tsx`
- `web/features/sessions/session-viewer-host.tsx`
- `web/features/sessions/session-viewer-link.ts`
- `web/features/sessions/collections.tsx`
- `web/features/workspace/shell.tsx`
- `web/server/jsonl-session.test.ts`
- `web/server/jsonl-presentation.test.ts`
- `web/server/jsonl-dialog.test.ts`
- `web/server/workbench-interactions.test.ts` —JSONL hunks only.
- `web/app/globals.css` —JSONL hunks only.
- `.trellis/spec/kiva-web/frontend/visual-system.md` —JSONL contract only.
- `.trellis/tasks/10-22-owned-session-viewer/` —approved planning, curated context, research, verification and commit-plan artifacts.

The shared-file stage must exclude the prior composer delta. The baseline is the exact pre-task snapshots at `/tmp/kiva-owned-viewer-evidence/original/`. A scratch index produced `/tmp/kiva-owned-viewer-evidence/owned-session-viewer-only.patch`, which applies cleanly to HEAD and excludes every pending composer/next-env change; the real index remains untouched; no whole-file `git add` of the three shared paths is allowed.

Validation:338 tests in the combined workspace;329 tests and root/web typecheck in the exact isolated task-only commit tree. Production build, independent Trellis review,18 viewer layout cases,24 interaction/bounds groups, and the additional compact-header18-case matrix pass; see `verification.md`.

## Excluded pending / unrelated changes

- `web/features/sessions/composer.tsx` and all pre-task composer hunks in shared CSS, workbench tests and the visual spec.
- `.trellis/tasks/10-22-running-composer/` including its pending verification/commit-plan files. This task's earlier commit/archive confirmation remains separate.
- `web/next-env.d.ts` —pre-existing user change, preserved exactly.
- All temporary fixtures/scripts/cache backups/browser evidence outside the repository.

## Authorized completion

Execute the task-only work commit without amend. Then follow trellis-finish-work: archive only this task and record its journal in subsequent bookkeeping commits. Leave running-composer and next-env changes in the worktree. The user additionally authorized pushing the current `feat/owned-session-viewer` branch to origin after the work/archive/journal commits. No force-push, merge or other task archive is included.
