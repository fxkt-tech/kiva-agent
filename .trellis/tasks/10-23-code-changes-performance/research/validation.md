# Integrated verification

Completed 2026-10-24 on perf/code-changes-loading. Implementation was explicitly approved after the final plan; no code commit has been made.

## Quality checks

- `pnpm typecheck`: pass (root and web).
- `pnpm test`: pass. Root 6 passed, 5 skipped, 0 failed; Web 376 passed, 0 skipped/failed.
- `pnpm web:build`: pass (production compilation, typecheck and route generation).
- `git diff --check`: pass.
- `python3 .trellis/scripts/task.py validate .trellis/tasks/10-23-code-changes-performance`: pass; five real entries per context manifest.
- No lint command is configured; existing react-test-renderer deprecation notices remain.

## Review fixes and compatibility

Trellis check coordinated these local fixes before final verification: exact/global view query validation, pre-open regular-file checks plus nonblocking open to prevent FIFO hangs, and deadline checks after shared-read follower revalidation. The shared resource hook preserves successful same-URL mutations across refresh generations rather than discarding them. The untracked preview path avoids duplicate immediate containment validation while retaining final root/path validation.

The FIFO test rejects nonregular ordinary file reads and preserves legacy clean/no-diff behavior for Git-ignored pipes. Root replacement, no fallback walk for changes projection, source/output overflow, total budget, partial stdout rejection, coalescing/freshness and no-HEAD compatibility have focused coverage.

List read failure retains existing whole-resource recovery; preview errors alone retain the loaded tree. This task does not add two independent error panes or a new error recovery UI.

## Real browser acceptance

Production Next UI with server/fixtures/workspace-mode-server.ts; all Git/session mutations stayed in fresh temporary directories. Deterministic adapter, no Pi/model acquisition, no user-server restart. Python Playwright Chromium 143.0.7499.4. Reproducible script: research/browser-check.py.

```sh
python3 /Users/justyer/.codex/skills/webapp-testing/scripts/with_server.py --server 'PORT=19497 pnpm --dir web exec tsx server/fixtures/workspace-mode-server.ts' --port 19497 --timeout 60 -- python3 .trellis/tasks/10-23-code-changes-performance/research/browser-check.py
```

Verified:
- Changes list uses only workspace?view=changes and omits files; expected changed leaves remain selectable.
- Staged-only, mixed staged+working edits, deletion, rename destination, literal bracket and Unicode untracked names, and tracked binary summaries render expected content.
- Oversized untracked preview reports an error without disabling the loaded tree.
- Actual App Router Back/Forward and reload preserve selected preview.
- Same-path shell refresh via a real sidebar session rename keeps the route: hold the preview request, verify refresh feedback and no stale patch, then release it and verify changed disk contents.
- Current-branch session sees source contents; owned-worktree session sees its own edit and never the source patch.
- Ordinary files route still previews/reloads source contents after async shared-helper migration.
- 1440/light, 390/dark and 320/light screenshots visually inspected; no horizontal overflow or pageerror events. Artifacts: /tmp/kiva-changes-browser/changes-{width}-{color}.png and result.json.

with_server.py stopped only its fixture-owned processes. The existing web/next-env.d.ts contents were saved before build and restored byte-for-byte after Next regeneration; that unrelated change stays excluded from commits.

## Performance

See performance.md/performance-results.json. Baseline fixed at c0ad5c7, final AFTER rerun after production review fixes with the same saved fixtures; each case uses 5 warmups/30 measured samples. This is warm-process HTTP plus controlled delayed-Git measurement, not full-page/cold-start timing.

10k/four-change list transfers 287,366 -> 398 bytes, four equivalent diffs run 4 -> 1 processes, and 300 ms delayed-Git ping P50 improves 346.71 -> 0.68 ms. Single-request regressions remain disclosed: near-bound patch +18.4%, multiline untracked +11.5%, clean preview +10.0%, many-change list +2.9% at P50 in this run. No isolated causal attribution or guarantee that every diff is faster. Synchronous registry/sidebar/session ownership costs remain out of scope.

## Completion state

Implementation, spec sync, static review and integrated verification are complete. User explicitly approved this task’s work commit, merge to main, temporary branch deletion and push on 2026-10-24. Finish-work bookkeeping follows the work commit.
