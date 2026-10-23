# Proposed commit batch

User explicitly approved the work commit, merge to main, temporary branch deletion and push on 2026-10-24. Branch: perf/code-changes-loading.

## Work commit

`perf(web): optimize changes listing and diff previews`

One coordinated API/client change: changes-only projection, bounded async diff/file reads, in-flight sharing, same-path refresh state, regression tests, benchmark and resource contracts. Include the reviewed task artifacts and measured limitations.

Files:

- `.trellis/spec/kiva-web/frontend/code-changes-performance.md`
- `.trellis/spec/kiva-web/frontend/index.md`
- `.trellis/spec/kiva-web/frontend/workspace-files-performance.md`
- `.trellis/tasks/10-23-code-changes-performance/check.jsonl`
- `.trellis/tasks/10-23-code-changes-performance/design.md`
- `.trellis/tasks/10-23-code-changes-performance/implement.jsonl`
- `.trellis/tasks/10-23-code-changes-performance/implement.md`
- `.trellis/tasks/10-23-code-changes-performance/prd.md`
- `.trellis/tasks/10-23-code-changes-performance/research/browser-check.py`
- `.trellis/tasks/10-23-code-changes-performance/research/commit-plan.md`
- `.trellis/tasks/10-23-code-changes-performance/research/loading-chain.md`
- `.trellis/tasks/10-23-code-changes-performance/research/performance-results.json`
- `.trellis/tasks/10-23-code-changes-performance/research/performance.md`
- `.trellis/tasks/10-23-code-changes-performance/research/validation.md`
- `.trellis/tasks/10-23-code-changes-performance/task.json`
- `web/features/files/workspace-browser.tsx`
- `web/features/workspace/resources.ts`
- `web/server/bootstrap.test.ts`
- `web/server/fixtures/changes-performance.ts`
- `web/server/resource-state.test.ts`
- `web/server/scoped-transport.test.ts`
- `web/server/scoped-transport.ts`
- `web/server/workbench-interactions.test.ts`
- `web/server/workspace-diff.test.ts`
- `web/server/workspace-files.test.ts`
- `web/server/workspace-files.ts`
- `web/server/workspace-reader.test.ts`
- `web/server/workspace-reader.ts`
- `web/server/workspace-tree.test.ts`
- `web/shared/types.ts`

## Excluded unrelated change

- `web/next-env.d.ts`: pre-existing edit, preserved byte-for-byte across build; do not stage or commit.

## Following the work commit

Standard task archive and session journal bookkeeping create their separate chore commits. After bookkeeping, merge to main, delete perf/code-changes-loading and push main as explicitly authorized. Preserve the unrelated next-env.d.ts change.
