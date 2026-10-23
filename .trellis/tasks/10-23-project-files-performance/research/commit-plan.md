# Proposed commit batch

User approved the commit batch, merge to main, temporary branch deletion and push on 2026-10-23.

## Work commit

`perf(web): optimize project directory loading`

Includes the coordinated server/client wire change, bounded async reader and sharing, regression tests, reproducible benchmark, resource specs and reviewed task artifacts. Files:

- `.trellis/spec/kiva-web/frontend/index.md`
- `.trellis/spec/kiva-web/frontend/workspace-files-performance.md`
- `.trellis/spec/kiva-web/frontend/workspace-routing.md`
- `.trellis/tasks/10-23-project-files-performance/check.jsonl`
- `.trellis/tasks/10-23-project-files-performance/design.md`
- `.trellis/tasks/10-23-project-files-performance/implement.jsonl`
- `.trellis/tasks/10-23-project-files-performance/implement.md`
- `.trellis/tasks/10-23-project-files-performance/prd.md`
- `.trellis/tasks/10-23-project-files-performance/research/browser-check.py`
- `.trellis/tasks/10-23-project-files-performance/research/commit-plan.md`
- `.trellis/tasks/10-23-project-files-performance/research/loading-chain.md`
- `.trellis/tasks/10-23-project-files-performance/research/performance-results.json`
- `.trellis/tasks/10-23-project-files-performance/research/performance.md`
- `.trellis/tasks/10-23-project-files-performance/research/validation.md`
- `.trellis/tasks/10-23-project-files-performance/task.json`
- `web/features/files/workspace-browser.tsx`
- `web/features/sessions/collections.tsx`
- `web/features/workspace/shell.tsx`
- `web/server/bootstrap.test.ts`
- `web/server/bootstrap.ts`
- `web/server/fixtures/files-performance.ts`
- `web/server/scoped-transport.test.ts`
- `web/server/scoped-transport.ts`
- `web/server/workbench-interactions.test.ts`
- `web/server/workspace-reader.test.ts`
- `web/server/workspace-reader.ts`
- `web/server/workspace-tree.test.ts`
- `web/shared/types.ts`

## Excluded unrelated change

- `web/next-env.d.ts`: pre-existing user change, preserved byte-for-byte across production build. Excluded from staging and all commits.

## After the work commit

Run the standard task archive and journal bookkeeping (their separate chore commits), retaining this task's code commit as the session reference. Then merge to main, delete perf/project-files-loading and push main as explicitly requested. Preserve the unrelated next-env.d.ts edit throughout.
