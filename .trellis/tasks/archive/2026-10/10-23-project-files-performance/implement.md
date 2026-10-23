# Execution plan

Implementation approved on 2026-10-23 after the final planning summary. Task status is in_progress; implementation/check use scoped Trellis sub-agents.

## Sequence
- [x] Capture baseline on current code using isolated repositories and a deterministic/no-model server. Report Node/OS/storage, file counts, history counts/bytes and registered-project counts. Use 5 warm-up and at least 30 measured samples per repeatable case; distinguish process-cold from filesystem-cold without claiming OS-cache eviction.
- [x] Cover small, >1,000-file and 10,000-file repositories, wide/deep trees, large histories and multiple registrations. Measure single and concurrent reads: HTTP P50/P95, subprocess counts, transcript bytes, tree builds and duration. Real first-usable-tree behavior is browser-verified; paired cold/browser-first-usable timings were not collected and are explicitly excluded from performance claims. Separate global picker/sidebar from workspace work.
- [x] Introduce shared WorkspaceData and async reader, preserving NUL/status/subdirectory parsing. Remove silent truncation and distinguish empty, non-Git, missing-Git and failed-Git paths.
- [x] Implement scope-validated in-flight sharing with cleanup, isolation and retry checks; do not cache completed results.
- [x] Update transport, shell/browser and fixtures together. Remove bootstrap-only history/model/recent-project work and replace sidebar timestamp dependency.
- [x] Stabilize map/entries references and preserve tree scope, selection, expansion and refresh behavior.
- [x] Run focused tests, required checks, isolated production browser acceptance and the same benchmark cases. Record actual results and remaining bottlenecks; reopen planning if further optimization changes scope.
- [x] Update workspace resource specs and complete review. Preserve unrelated changes and live runtime owners.

## Meaningful verification
Extend existing workspace/bootstrap, scoped transport, workspace-tree and routed interaction suites. Use temporary roots and no paid prompts.

Verify exact Unicode/newline/space names, literal pathspecs, nested untracked files, cross-subdirectory renames and deleted previews; empty/unborn/non-Git/missing roots; permission, timeout, overflow and command failure; complete >1,000-file listings. Verify same-root coalescing, different-root isolation, failed-read retry, external change followed by fresh read, cancellation ownership and route races.

Verify one directory enumeration per navigation and zero history reads in metadata/workspace resources; independent sidebar reads are counted separately. Verify stable trees across selection/preview, rebuild on changed data, sidebar relative time, keyboard/focus/expansion, Back/Forward and passive scope semantics.

## Commands
Run from repository root:

```sh
pnpm typecheck
pnpm test
pnpm web:build
git diff --check
python3 .trellis/scripts/task.py validate .trellis/tasks/10-23-project-files-performance
```

Use isolated fixture composition for real App Router navigation after build: refresh, Back/Forward, selected-file links, project and both session workspace modes, populated/empty trees and desktop/mobile. Stop only fixture-owned processes. Do not restart the user server to obtain a benchmark.

## Review and rollback
Review async parsing/errors before transport integration. API/type/shell/browser migration is one rollback unit. In-flight sharing must never bypass scope validation or let one cancelled client fail others. No persistent data changes require rollback. Broader registry conversion, lazy loading and history indexing remain deferred.

## Outcome
Implementation and validation complete; see research/validation.md and research/performance.md. Work commit, merge to main, branch deletion and push were approved by the user on 2026-10-23; finish-work bookkeeping follows the work commit.
