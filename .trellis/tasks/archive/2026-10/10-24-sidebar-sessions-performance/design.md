# Sidebar session list design

## 1. Read boundary and DTO
Introduce a passive list-summary read path distinct from SessionRepository.resource/read/resolveExecution and their model/history projections. Suggested DTO `SessionListItem` contains the fields consumed by SessionRows/dialog subjects: id, projectId, name, preview, updatedAt, createdAt, collection, persisted/legacy, workspace metadata needed for current-branch labels, and deletion/retry metadata. It excludes transcript-derived controls, messages and execution authority. Adapt menu/dialog subject types to their real field needs; SessionResource detail callers may still pass structurally compatible subjects.

Do not call the heavy resource method merely to build a lightweight row. Workspace/deletion detail checks remain in existing preview/action endpoints. Keep current visible retry-menu decisions and naming/ordering semantics; a list row never authorizes cleanup or execution.

Add `GET /api/projects/:id/sessions?collection=active|archived|trash` -> `{ collection, sessions: SessionListItem[] }`. Collection is validated (including duplicates); identity remains in the route. Existing no-collection response retains its legacy `{active, archived, trash}` shape for compatibility. New UI consumers all use the scoped form. No disk schema migration is required. Coordinate shared type, transport and client changes together.

## 2. One project snapshot, exact identities
Resolve the target registered project once for the new read path and reuse that validated context; avoid repeated registry.resolve in projectRoot/catalog/metadataRoot and per-row helpers. Preserve canonical history/metadata ownership checks; do not bypass lifecycle workspaces' independent checks.

Enumerate active/archived/trash history inventory once and metadata once. Stream each owned regular transcript once into an authoritative summary accumulator: session ID records, session_info name, first-user derived default name, latest user preview and filesystem timestamp. Preserve current last matching ID/name record behavior, whitespace/preview formatting, filename fallback when no ID record exists, partial malformed-record tolerance and metadata nameOverride precedence. Use a shared parsing/merge owner to prevent synchronous legacy and new async readers from drifting.

Cross-collection ID collision checks require full identities. Therefore an active-list request still scans identity-relevant archived/trash bytes in this first iteration; it does not replay their full Pi projections or return their rows. Do not optimize by reading an arbitrary prefix/tail or inferring all IDs from filenames. Keep ambiguity failures instead of picking an arbitrary match. Use ID maps for transcript and record merging, not repeated array filter/find per row.

One uncached snapshot is O(total project history bytes + record/entry count), rather than six full byte passes plus repeated conversation projection and lookup overhead. Filtering the response by collection reduces unrelated wire/UI work; it does not make cold I/O proportional only to the target collection. A persistent exact identity/summary index could later change this tradeoff, but is deliberately deferred.

## 3. Async execution and in-flight sharing
Use async traversal/open/read/stat with bounded file concurrency and streaming chunks. Parse complete records with carry-over across chunk boundaries, preserving the final complete non-newline record and existing invalid/partial-line tolerance. Yield cooperatively between bounded batches so a set of ordinary records cannot monopolize the event loop. A single unusually large JSON record can still consume CPU; benchmark it and disclose limits rather than promise a fully nonblocking parser or add a silent truncation limit.

Preserve catalog inventory policy by skipping symlink entries, while rejecting unsafe roots/metadata and never following symlinks to outside data. Snapshot file identity and initial length; use contained, non-symlink, nonregular-safe descriptor reads. Recheck root/file identity and handle shrink/replacement/moves with bounded retry or explicit recoverable failure. Appended complete records after the captured read boundary appear on the next refresh. Do not turn unreadable/corrupt history or metadata into an empty list; retain established malformed-record tolerance separately from I/O/ownership failures.

Coalesce pending project snapshots by canonical root identity and repository mutation generation; simultaneous different collection requests may project from the same scan. Drop matching pending entries after completion/failure. No completed server cache, TTL or GET-created index files. Create/rename/archive/trash/restore and relevant metadata changes invalidate the project generation around mutations so post-action reads cannot join a pre-action snapshot. Existing failed/partial deletion outcomes remain visible; a generation guard is not a replacement for authoritative action validation.

## 4. Shared client lists and scheduling
Create one feature-owned list-data provider/store above project groups and collection pages. Keys include project ID, collection and invalidation generation. This is a session-list resource owner, not a rewrite of the general useResource/settings cache. Share confirmed rows, in-flight reads, errors and refresh state between sidebar and content consumers; reference-count consumers so one collapse/unmount does not cancel another consumer's request.

Only expanded sidebar groups and visible collection pages register demand. Preserve default expanded state; collapsed groups may retain old hidden data but must not start reads, and re-expansion checks the current generation. Preserve all rows and local case-insensitive name/preview search; do not introduce first-100 slicing.

Schedule current-project demand ahead of queued other projects, with a proposed limit of two active background list fetches. Do not cancel already useful reads solely to reorder a queue; avoid starvation. Switching route, expanding/collapsing, removing a project and navigation races must clean up demand correctly.

List invalidation is project-scoped. A session move invalidates all loaded collection keys for that project (both source and destination), while unrelated projects keep confirmed rows. Integrate mutation hooks at their actual owners, preserving existing non-list shell refresh effects such as file/diff refresh. An explicit full refresh can invalidate all demanded lists. Use generation/revision guards to reject late pre-mutation reads; confirmed writes continue to outrank stale GETs.

## 5. Compatibility and known residual work
Keep current session order (latest record/transcript timestamp descending), name override, latest user preview, empty sessions, legacy sessions, partial deletion menu and route/search behavior. Exact detail/JSONL access must remain independent of list presentation and retain cross-collection identity/ownership guarantees. Both current-branch and owned-worktree actions still use their existing previews and cleanup guards. Do not change controls precedence to accelerate a sidebar that does not consume controls.

Registry listing/project picker and detail/session ownership reads remain separate synchronous costs. Default-expanded many-project UI still eventually reads each demanded project; priority and bounded concurrency improve current-project readiness rather than pretend those requests disappear. Cold scans still read complete histories once; if that dominates after this change, measure a follow-up validated summary index/cache rather than silently broadening scope.

## 6. Rollout and rollback
Ship scoped endpoint, DTO, parser/read path and consumers together. Keep legacy unscoped response and direct repository detail/mutation APIs compatible. Test using temporary roots and deterministic adapters, no paid prompts or live user server restart. Revert the coordinated API/client unit if needed; no persistent index/migration requires data rollback. Preserve existing web/next-env.d.ts edits.
