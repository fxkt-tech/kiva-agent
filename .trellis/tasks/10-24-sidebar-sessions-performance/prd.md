# Optimize sidebar session list loading

## Goal
Make the left sidebar's session rows available sooner and keep list loading from monopolizing other requests. Preserve existing visible sessions, search, ordering, menus, default project expansion and passive runtime behavior. User approved the final planning summary and requested implementation on 2026-10-24.

## Background and evidence
- Prior isolated benchmark: 20 transcripts / 20,293,730 bytes produced 120 transcript reads / 121,762,380 bytes and 65 synchronous Git calls per sessions GET, P50 596.65 ms. Source: archive/2026-10/10-23-project-files-performance/research/performance.md; this is a prior fixture result, not a current live-project measurement.
- `web/server/scoped-transport.ts` validates collection but always calls repository.list for active, archived and trash. `web/server/session-repository.ts:32-41` scans every collection for each call, then creates full SessionResource objects before filtering.
- `web/server/session-repository.ts:266-303` calls projectTranscript per transcript to resolve model/thinking controls. `projectTranscript` at :366 rereads and fully projects the history. Sidebar rows do not display those controls.
- `web/features/workspace/shell.tsx:169-219` mounts one useCollections per project before checking expansion. `SessionCollectionFeature` in collections.tsx also issues its own all-collection request; no shared list data owner exists.
- Raw history identity is not necessarily its filename: SessionCatalog and session-jsonl.ts honor session ID records across the full file. Cross-collection duplicates are errors. A head/tail-only summary would change this existing identity contract.

## Requirements
- R1: Separate list-item projection from authoritative session detail/runtime/lifecycle projection. Listing must not replay full conversation/control projections or perform per-row Git capability/workspace inspections.
- R2: Build a project list snapshot once: enumerate all identity-relevant collections, read each transcript at most once and metadata once, merge by maps and select the requested collection. Preserve full-scan identity/duplicate semantics, naming overrides, preview, timestamps, sort order, empty metadata sessions and retry visibility.
- R3: Add a collection-scoped list response and migrate sidebar/collection pages to it. A page and its sidebar share the same project/collection/generation data. Collapsed groups do not start new reads; preserve default expansion and all-session visibility/search.
- R4: Prioritize the current project's list and bound background expanded-project requests. Local session mutations invalidate the affected project's collections; unrelated project lists remain confirmed. Explicit global refresh and browser reload retain complete refresh behavior.
- R5: Use asynchronous history I/O with streaming/limited concurrency and cooperative parsing batches. Preserve complete-record semantics, partial-write tolerance, ownership guards and errors. No metadata/index writes or runtime acquisition on GET.
- R6: Generation guards prevent pre-mutation/old-scope results from restoring stale rows. No completed server snapshot cache in this iteration; later completed reads inspect current disk state. Existing actions/details retain authoritative validation.
- R7: Measure cold/repeated list latency, bytes/read counts, Git calls, concurrent same-project reads, multi-project readiness and independent-request responsiveness. Compare identical fixtures and disclose residual costs.

## Acceptance criteria
- AC1 (R1): The new list path makes zero projectTranscript/buildSessionProjection calls; Git work does not grow with the number of rows. Opening a session and performing lifecycle actions still use authoritative existing validation.
- AC2 (R2): One uncached project snapshot reads each transcript at most once, including cross-collection identity checks; it never reads every history six times. Duplicate IDs across collections and filename/header mismatches retain existing behavior. Maps avoid per-row full-array lookup loops.
- AC3 (R3): An expanded sidebar and collection page for the same project/collection/generation share one request/result. A collapsed project does not issue/refetch a list; re-expansion obtains the current generation. No new arbitrary row cap, pagination or truncated search.
- AC4 (R4): Current-project list is scheduled ahead of queued background projects; background concurrency is bounded. Rename/create/archive/trash/restore refresh affected collections and retain correct rows/selection elsewhere without refetching unrelated project lists.
- AC5 (R5): Async filesystem waits do not block a lightweight fixture route. Streaming parser preserves complete last records, ignores malformed/partially written lines as before and does not substitute filename identity for a valid in-file ID. Inventory never follows symlink entries (preserving the catalog skip policy); unsafe/substituted roots, nonregular histories and corrupt metadata fail explicitly.
- AC6 (R6): A late pre-archive/rename result cannot overwrite newer data; no completed server cache can hide external appends, renames, truncations or replacements on subsequent reads. Deletion preview/cleanup, legacy read-only sessions, raw JSONL and both workspace modes remain correct.
- AC7 (R7): Record reproducible commands/environment, fixtures, five warmups/30 repeated samples, P50/P95 and structural counters. Include current-project first-ready timing and delayed-I/O responsiveness. Do not claim all collection directories are skipped or every CPU parse is nonblocking.

## Out of scope
Persistent summary indexes, TTL-only caches, filesystem watchers, incremental append indexes, pagination/virtual scrolling, default collapse changes, session-detail/history viewer optimization, model control semantics, project picker/Git-registry rewrite and UI redesign. These require new evidence before broadening this task.

## Planning status
No blocking product questions for this proposal. It preserves current visible behavior; benchmarks will determine gains and remaining bottlenecks. Final summary approval received on 2026-10-24; execution is authorized.
