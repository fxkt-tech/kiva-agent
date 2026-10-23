# Integrated sidebar verification

Completed 2026-10-24 on perf/sidebar-session-lists. No product code commit has been made.

## Quality checks

- `pnpm typecheck`: pass (root and web).
- `pnpm test`: root 6 passed/5 skipped/0 failed; web 402 passed/0 skipped/0 failed.
- `pnpm web:build`: pass (production compilation, typecheck and generated routes).
- `git diff --check`: pass.
- `python3 .trellis/scripts/task.py validate .trellis/tasks/10-24-sidebar-sessions-performance`: pass, five real entries in each manifest.
- No lint command configured. Existing react-test-renderer deprecation notices remain.

## Review and regression results

Static review found and resolved two freshness gaps: runtime transcript notifications now advance server list epochs before publishing events; client mutation owners invalidate captured projects on settlement, including failure after persisted effects. Create/continue, rename/archive/restore, model saves and project hiding preserve existing candidates/errors/navigation while no longer caching stale rows after partial failure. Delete partial/error paths were already covered.

Focused regressions cover exact/late IDs, full scan duplicate protection, final EOF/malformed-tail tolerance, metadata overrides and stable ties, current-branch metadata without per-row Git, descriptor ownership/FIFO, changed files, pending sharing/failure cleanup and metadata-once reads. Actual repository/RuntimeManager tests block pre-mutation scans then prove post-save/move/append reads use fresh generations. Existing execution/controls/deletion safety suites pass unchanged in meaning.

## Production browser acceptance

Used real Next production build with server/fixtures/workspace-mode-server.ts, fresh temporary Git roots and deterministic adapter; no user server restart or paid model acquisition. Python Playwright Chromium 143.0.7499.4. Reproduce after build:

```sh
python3 /Users/justyer/.codex/skills/webapp-testing/scripts/with_server.py --server 'PORT=19499 pnpm --dir web exec tsx server/fixtures/workspace-mode-server.ts' --port 19499 --timeout 60 -- python3 .trellis/tasks/10-24-sidebar-sessions-performance/research/browser-check.py
```

Verified with 105 legacy histories plus two created metadata-only sessions and a second registered project:
- Initial active list issues one GET; the archive route and its sidebar share one initial archived GET and one post-restore refresh GET (two recorded total, not one per consumer).
- Current-project request starts first even after importing another project ahead of it in registry order.
- Source rename invalidates only its project's lists, leaves the other project's confirmed list untouched, and still does so while the other group is collapsed. Re-expansion works; default expansion stays unchanged.
- All 107 sessions remain available. Search finds the oldest renamed session beyond a first-100 cutoff.
- JSONL viewer opens through summary-only rows; raw text retains the true session ID.
- Rename, archive/restore, history trash/restore-deleted and subsequent list membership work through actual row menus.
- Current-branch and owned-worktree empty sessions remain visible. Authoritative deletion preview keeps owned cleanup checked and shared-directory cleanup absent; dialogs were cancelled, leaving workspaces intact.
- Session navigation and browser Back work. Renaming while a source diff is selected still refreshes that same diff; ordinary file preview remains compatible.
- Desktop 1440/light, mobile 390/dark and 320/light screenshots visually inspected; no horizontal overflow or pageerror events. Artifacts: /tmp/kiva-sidebar-browser-check/sidebar-{width}-{color}.png and result.json; request/results also copied to browser-check-results.json.

The automation initially used generic delete-dialog and trash-restore labels; those test selectors were corrected to the existing UI strings. No product change was required for these harness issues. with_server.py stopped only fixture-owned processes.

## Paired performance

See performance.md/performance-results.json for API source provenance, fixtures and exact counters. The 20-history fixture improves HTTP P50 599.67 ->105.81ms, history bytes125.52 ->20.92MB, full projections60 ->0, synchronous Git65 ->5. Different-collection requests share a pending project scan; metadata-only files are read once.

See browser-performance.md and browser-{baseline,after}-results.json for separately paired production sidebar DOM readiness on the exact same 20,725,500-byte fixture: P50 940.60 ->482.70ms, P95 987.10 ->492.30ms (5 warmups/30 samples). MutationObserver timestamps exclude assertion polling. No competing heavy checks ran during captures.

Cold reads still scan all identity-relevant collections, and one giant JSON record can still take CPU; there is no completed server cache or persistent index. Registry picker and authoritative session detail/lifecycle costs remain out of scope. Results are fixture-specific, not OS-cold or all-feature readiness guarantees.

## Working tree

The pre-existing web/next-env.d.ts contents were saved before build and restored byte-for-byte after Next regeneration; exclude that unrelated change from all task commits. No project histories/registry schema or summary index migration was introduced. Implementation/spec/verification complete. User explicitly approved the work commit, main merge, temporary branch deletion and push on 2026-10-24; archive/journal bookkeeping follows the work commit.
