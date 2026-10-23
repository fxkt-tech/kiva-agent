# Execution plan

Implementation approved on 2026-10-24 after the final planning summary. Scoped Trellis implement/check agents execute the reviewed plan.

## Ordered work
- [x] Capture baseline at c0ad5c7 before code changes. Reuse/extend isolated benchmark composition where it serves actual changes endpoints. Use 5 warmups and at least 30 samples for repeatable HTTP cases; record OS/Node/Git, fixture sizes, counters and payload bytes.
- [x] Cover 10,000 files/few changes, many changed leaves, clean repository, tracked small/near-bound diff, untracked multiline file, concurrent same/different paths and delayed Git. Measure changes-list and diff P50/P95 separately. Probe an independent lightweight fixture endpoint while Git is deliberately held, separating async responsiveness from existing sync registry/sidebar work. Do not conflate these with complete browser-page latency.
- [x] Add shared WorkspaceChangesData and validated changes-only workspace query. Reuse reader ownership/coalescing/status parser; skip ls-files and fallback filesystem walk for this projection. Preserve default full workspace reads.
- [x] Implement bounded async diff process/file reads and consistent errors. Preserve literal pathspec/no-ext-diff/no-textconv and HEAD behavior, legitimate untracked fallback and deleted-path checks. Enforce total preview deadline/source/response bounds.
- [x] Add validated in-flight preview sharing and cleanup without completed caching. Keep cancellation/timeout ownership safe.
- [x] Adapt scoped transport and shared helper call sites/tests, then choose lightweight list response in WorkspaceBrowser and bind preview reads to refresh version. Preserve stable tree inputs, scope identity and preview-only loading/errors and existing list-level recovery behavior.
- [x] Run targeted tests, full quality checks and isolated production browser checks. Rerun identical benchmarks; document structural gains, measured timings and remaining sidebar/registry costs.
- [x] Update relevant resource specs and complete Trellis check. Present implementation/verification results before workflow-required commit confirmation. Task-specific commit/merge/push authorization received on 2026-10-24 after implementation review.

## Regression cases

Real Git fixtures: staged-only, unstaged-only, mixed staged+unstaged, staged addition, untracked nested text, deletion, rename, clean paths, tracked binary summary and untracked binary/oversize errors. Test raw Unicode/newline/space/literal-pathspec names, subdirectory rename boundaries, target/ancestor symlink escapes, missing/deleted roots and both session modes.

Injected or controlled process fixtures: total timeout, output overflow, nonzero exit with partial stdout, failed status, expected untracked/no-HEAD compatibility, coalesced success/failure, different roots/paths and new reads after completion. Prove changes-only requests invoke no ls-files or filesystem tree walk and do not hide Git errors as clean trees.

Routed/browser cases: unchanged selected path refreshed after disk edit, delayed preview/scope responses, list/preview errors independent, no repeated listing on selection, keyboard/expansion/Back/Forward/deep links, current-branch/worktree roots and full file-view compatibility. Validate ordinary file preview too if shared helpers become async.

## Required checks

```sh
pnpm typecheck
pnpm test
pnpm web:build
git diff --check
python3 .trellis/scripts/task.py validate .trellis/tasks/10-23-code-changes-performance
```

Use isolated deterministic production fixture and desktop/mobile light/dark browser acceptance. Stop only fixture-owned processes. Capture/restore the existing next-env.d.ts contents around Next build if regenerated.

## Review and rollback

Reader extraction, shared path handling and API projection are high-risk boundaries: review ownership/raw-path/error semantics and unchanged file-view behavior. Revert the coordinated API/client unit together; persistent data does not change. Reopen planning for UI redesign, new comparison semantics, history indexing or persistent cache requirements.

## Outcome
Implementation, spec sync and integrated validation completed on 2026-10-24; see research/validation.md and final performance.md. User approved commit, merge to main, temporary branch deletion and push on 2026-10-24; finish-work bookkeeping follows the work commit.
