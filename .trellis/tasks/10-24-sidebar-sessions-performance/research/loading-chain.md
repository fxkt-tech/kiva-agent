# Sidebar session-list evidence

Static inspection 2026-10-24, baseline 86fc5ce. No new runtime benchmark performed during planning. Prior relevant benchmark is available under archive/2026-10/10-23-project-files-performance/research/performance.md.

1. shell.tsx ProjectGroup calls useCollections before expansion rendering, default expanded=true, hides rows with HTML hidden rather than unmounting the fetch. All visible registry projects mount a group.
2. collections.tsx useCollections always GETs /api/projects/:id/sessions. SessionCollectionFeature independently uses the same hook, so sidebar and page do not share data or pending work. Search is local across name+preview; no existing row cap should be introduced.
3. scoped-transport.ts sessions GET validates collection but ignores it in response computation, invoking repository.list(active), list(archived), list(trash).
4. session-repository.ts list() calls projectRoot, registry.resolve, catalog(projectId) and records(projectId), whose nested helpers resolve the registry again. Each list call runs catalog.all(), scanning all collection histories, then resource() per ID before filtering.
5. resource() replays projectTranscript for each persisted session; projectTranscript rereads the file, parses/migrates entries and builds the full Pi projection to obtain controls. This explains six full byte passes per three-list GET: three catalog summary passes and three per-row full projection passes. Resource also checks partial owned-worktree removal; do not put those deep checks into sidebar formatting.
6. SessionCatalog.readSession preserves the last session ID record, latest session_info name and latest user preview, deriving a default name from the first user preview. It scans full files, including non-newline EOF records; malformed lines are ignored. Metadata can override name and latest updatedAt.
7. session-jsonl.ts independently implements the full-file ID rule and cross-collection ambiguity detection; filenames/header-only IDs cannot replace it. New summary parsing must preserve these semantics.
8. SessionRows needs identity, display timestamps/name/preview, collection, workspace mode for deletion copy and deletion status for retry menus. It does not display model/thinking controls. Menu actions and JSONL use authoritative target endpoints; summary metadata must never authorize cleanup/execution.
9. Previous fixture measured 20,293,730 source bytes, 121,762,380 read bytes, 120 transcript reads, 65 synchronous Git calls and P50 596.65 ms. It did not measure this user's live sidebar or prove a specific new speedup.

Recommended first phase: exact once-per-project inventory+summary scan, lightweight DTO and collection response, async/streaming read with cooperative yields, shared demanded client lists and scoped invalidation. Persistent exact indexes and caches are separate follow-up choices after measuring this simpler fix.
