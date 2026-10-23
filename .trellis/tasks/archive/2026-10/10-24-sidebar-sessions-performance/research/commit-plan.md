# Proposed commit batch

User explicitly approved this work commit, merge to main, temporary branch deletion and push on 2026-10-24. Branch: perf/sidebar-session-lists.

## Work commit

`perf(web): optimize sidebar session list loading`

One coordinated change: scoped summary DTO/API, exact single-pass streaming reads and shared parsers, mutation/runtime epochs, demanded shared client lists, regression coverage, specs and paired API/browser evidence. Include reviewed task artifacts and documented remaining costs.

Files:

- `.trellis/spec/kiva-web/frontend/index.md`
- `.trellis/spec/kiva-web/frontend/sidebar-session-lists.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/check.jsonl`
- `.trellis/tasks/10-24-sidebar-sessions-performance/design.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/implement.jsonl`
- `.trellis/tasks/10-24-sidebar-sessions-performance/implement.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/prd.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/browser-after-results.json`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/browser-baseline-results.json`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/browser-check-results.json`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/browser-check.py`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/browser-metrics-setup.py`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/browser-metrics.py`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/browser-performance.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/commit-plan.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/loading-chain.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/performance-results.json`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/performance.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/research/validation.md`
- `.trellis/tasks/10-24-sidebar-sessions-performance/task.json`
- `web/features/sessions/collections.tsx`
- `web/features/sessions/composer.tsx`
- `web/features/sessions/conversation.tsx`
- `web/features/sessions/model-settings.tsx`
- `web/features/sessions/session-lists.tsx`
- `web/features/workspace/project-picker.tsx`
- `web/features/workspace/shell.tsx`
- `web/server/fixtures/sidebar-performance.ts`
- `web/server/project-visibility.test.ts`
- `web/server/runtime-manager.ts`
- `web/server/scoped-transport.test.ts`
- `web/server/scoped-transport.ts`
- `web/server/session-catalog.ts`
- `web/server/session-list-reader.test.ts`
- `web/server/session-list-reader.ts`
- `web/server/session-list-state.test.ts`
- `web/server/session-record.ts`
- `web/server/session-repository.test.ts`
- `web/server/session-repository.ts`
- `web/server/session-summary.ts`
- `web/server/workbench-interactions.test.ts`
- `web/server/workspace-tree.test.ts`
- `web/shared/workspace-contract.ts`

## Excluded unrelated change

- `web/next-env.d.ts`: pre-existing edit, preserved byte-for-byte across build; do not stage or commit.

## After the work commit

Standard task archive and session journal bookkeeping create their separate chore commits. After bookkeeping, merge to main, delete perf/sidebar-session-lists and push main as explicitly authorized for this task. Preserve the unrelated next-env.d.ts edit.
