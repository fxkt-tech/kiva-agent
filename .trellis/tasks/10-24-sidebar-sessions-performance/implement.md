# Execution plan

Implementation approved on 2026-10-24 after final planning summary; scoped Trellis implement/check agents execute the reviewed plan.

## Sequence
- [x] Capture fixed baseline 86fc5ce using closed source snapshots of transport/repository/catalog and list client behavior before edits. Reuse prior benchmark fixtures where meaningful. Record environment, source provenance and counters.
- [x] Trace row/dialog field consumption, list callers, exact ID/preview/name semantics, all repository mutations and shell refresh paths. Extract only shared parsing/validation needed for summary reads; leave execution/lifecycle authority intact.
- [x] Add shared SessionListItem and validated collection-scoped response. Add asynchronous single-scan summary/inventory/metadata read with maps, bounded concurrency, cooperative parsing and exact cross-collection duplicate detection. No full Pi projection in list reads.
- [x] Add pending project snapshot sharing and mutation generation invalidation; preserve fresh completed-read behavior and partial lifecycle recovery.
- [x] Introduce feature-owned shared list state for sidebar/content. Gate demand on expansion/visibility, prioritize current project and bound background requests. Keep current default expansion, complete rows and local search.
- [x] Integrate project-scoped invalidation at session mutation owners while preserving existing shell refresh behavior for other resources and explicit full refresh. Verify late reads cannot restore renamed/archived/removed rows.
- [x] Run focused tests, full checks, production browser acceptance and paired benchmarks. Document remaining cold scan, large-record CPU and registry/detail costs. Reopen planning before adding persistent indexes/cache, pagination or a new collapse default.
- [x] Update specs, run Trellis check, and present results before task-specific commit confirmation. Task-specific commit, main merge, temporary branch deletion and push approved on 2026-10-24 after implementation review.

## Regression coverage

Backend: empty project/empty metadata session; 20 MB histories; one large history and large record; legacy nested paths with ID different from filename and late ID/name records; duplicate IDs within/across active/archive/trash; nameOverride and updatedAt ordering; latest user previews, array text and whitespace; complete final no-newline record and partial trailing record; symlink/nonregular/metadata corruption; file append/truncate/replacement/move during scan; failure retry; same-project different-collection sharing; different-project isolation; successful/partial mutation invalidation. Existing detail/controls/JSONL/execution/deletion tests must remain unchanged in meaning.

Frontend: sidebar+collection page share rows/request; initial collapsed group does not request; collapse while another consumer remains; re-expand after invalidation; current project priority and bounded background activity; default expansion preserved; complete search beyond 100 rows; route/q/collection changes and Back/Forward; confirmed mutation beats delayed list; create/rename/archive/trash/restore/retry remove/add correct rows; hiding project cleans up demand; file/diff refresh behavior remains intact.

## Measurement

Use 5 warmups and at least 30 repeated samples for comparable HTTP cases. Include prior 20 histories / ~20 MB fixture, many small histories, one large transcript, large archived/trash collections, metadata-only sessions and multiple projects. Record cold snapshot and repeated reads separately (no completed server cache), transcript read counts/bytes, projection calls, Git calls, payload, P50/P95 and scan concurrency. Use delayed filesystem fixture plus independent lightweight ping and real-browser current-project first-ready measurements. Keep CPU-heavy tests/builds outside timing windows. Disclose full identity scanning of non-target collections and single-record parse limitations.

## Required checks

```sh
pnpm typecheck
pnpm test
pnpm web:build
git diff --check
python3 .trellis/scripts/task.py validate .trellis/tasks/10-24-sidebar-sessions-performance
```

Browser-check actual production App Router with deterministic adapter: project/session/files/changes, active/archive/trash collections, search, collapse/expand, all row menu actions and JSONL, both workspace modes, desktop/mobile light/dark, no overflow/hydration errors. Stop only fixture-owned processes. Save/restore the pre-existing next-env.d.ts edit around build if generated.

## Review and rollback

Highest-risk areas: exact identity/metadata merge, summary-versus-detail boundary, partial deletion visibility, generation invalidation and shared-client cancellation. Review them before completing verification. API/client changes revert together; there are no persistent-data changes to undo.

## Outcome
Implementation, spec sync and integrated verification complete on2026-10-24; see research/validation.md and paired API/browser reports. User approved commit, main merge, temporary branch deletion and push on 2026-10-24; finish-work bookkeeping follows the work commit.
