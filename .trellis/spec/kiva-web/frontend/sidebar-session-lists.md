# Sidebar session lists

## 1. Scope / trigger

Apply to sidebar/collection-page loading, list DTOs and their invalidation. Lists are presentation resources; session detail, controls, JSONL, execution and lifecycle previews/actions retain authoritative identity and workspace validation. Do not accelerate a sidebar by bypassing those checks for actions.

## 2. Signatures

- `GET /api/projects/:projectId/sessions?collection=active|archived|trash` returns `SessionListResponse = { collection, sessions: SessionListItem[] }` from shared/workspace-contract.ts. Duplicate/invalid collections are rejected.
- The request without collection retains legacy `{ active, archived, trash }` SessionResource arrays. New UI consumers use the scoped form.
- `SessionListItem` contains SessionSummary display fields, project/collection identity, createdAt, legacy/source metadata, deletion status and a workspace metadata subset (mode/state/executionRoot/treeRoot/branch). It has no transcript controls, messages or executable authority.
- `SessionRepository.listSummaries(projectId, collection, registeredProject?)` reuses the route's validated project context and delegates to a repository-owned `SessionListReader.read(project)`.
- `SessionSummaryAccumulator` and `parseSessionRecord` are shared format/validation owners for legacy and new read paths.
- Client `SessionListStore`, `SessionListsProvider` and `useSessionList(projectId, collection, enabled)` own scoped list state. Shell `refreshProject(projectId)` preserves ordinary resource-version refresh while invalidating only that project's lists; no-arg `refresh()` remains a global refresh.

## 3. Contracts

One uncached project snapshot enumerates active/archive/trash history inventory and metadata once. Stream each history once and merge by ID maps. Preserve last matching in-file ID/name records, filename fallback only when no valid ID record exists, first-user derived default name, latest user preview, nameOverride and timestamp ordering. A complete final record without newline remains readable; malformed/partially written records retain existing tolerance. Equal timestamp ordering must remain stable with legacy collection ordering.

Exact identity requires full-file scans across collections; a scoped active request still reads archived/trash identity bytes. Do not substitute a header/tail cutoff or pretend I/O scales only with returned rows. Cross-collection duplicates are explicit errors. The list path never invokes projectTranscript/buildSessionProjection or per-row live Git/workspace inspection. Current-branch display metadata may reuse already validated project capability without further Git calls; list metadata never authorizes execution or cleanup.

History reads use bounded concurrency (four files), 64 KiB chunks and cooperative yields. No completed server cache, TTL, persistent index, GET-created metadata or runtime acquisition. A very large single JSON record may still take CPU to parse; do not claim every parse is nonblocking. History inventory skips symlink entries as the legacy catalog does; unsafe roots/ancestors, metadata symlinks, nonregular files and substitutions are rejected. Validate descriptor and path identities, initial-size boundaries and shrink/replacement. Appends beyond a captured boundary appear in a fresh scan.

Pending project snapshots share canonical root identity and mutation epoch across collection requests. Remove pending entries after all descriptor-owning workers settle, on success/failure. Metadata saves, collection moves, partial lifecycle outcomes and accepted runtime transcript/session updates advance the affected project's epoch. A post-action/event read must not join a pre-change snapshot even if that older read is still pending. Epoch invalidation does not change authority, exclusion or cleanup semantics.

The client shares data/error/refresh state for project+collection+generation between sidebar and content. Retain confirmed rows until invalidation; no arbitrary row cap or changed search semantics. Only expanded/visible consumers register demand; preserve existing default expansion. Reference counts prevent one collapse/unmount from cancelling another consumer's request. Current-project demand is queued first and background starts are bounded (two); do not promise background projects are never read when all are expanded.

Local session changes invalidate all collections of the captured project, including failure/settled paths where a mutation may already have persisted effects. This includes create/continue, rename/archive/trash/restore, runtime/session notifications, controls changes and project import/hide integration. Unrelated project lists retain confirmed rows. Global refresh remains available, and non-list file/diff refresh effects remain intact. Abort/revision/generation guards prevent late pre-mutation or old-scope responses from restoring stale rows.

## 4. Validation and error matrix

| Condition | Behavior |
| --- | --- |
| Invalid/duplicate collection | HTTP 400; no fallback collection |
| Unknown/unavailable/mismatched project | Existing scoped/project error; no alternate root |
| Duplicate transcript IDs within/across collections | `ambiguous_session`; do not pick an arbitrary match |
| Unsafe history/metadata ownership or nonregular file | Explicit ownership error; no following external paths or blocking FIFO open |
| Corrupt metadata | `metadata_corrupt`; no empty-success substitution |
| History/root shrink, replacement or move during scan | Recoverable list-changed/unavailable error; retry using fresh identity |
| Invalid/partial JSONL record | Existing per-record tolerance; never rewrite history |
| Collapsed group with no other consumer | No new/refetch list request |
| One consumer collapses while page still subscribes | Keep the shared request/data for remaining consumers |
| Mutation fails after persistence or runtime appends during pending scan | Invalidate captured project epochs/generations; newer reads/results outrank old snapshots |
| List error | Shared visible error/retry through refresh or renewed demand; do not present a clean empty list |

## 5. Good / base / bad cases

Good: one expanded sidebar and collection page share the active-list request; the server scans each project history once without building controls. Base: 150 legacy sessions remain searchable, including IDs differing from filenames. Bad: invoking three full collection lists for a sidebar, caching a failed-create list indefinitely, or joining pre-append work after the final runtime notification.

## 6. Tests required

Assert exact ID/name/preview semantics, duplicate identities, complete EOF/partial records, metadata-only sessions, stable ordering and override precedence. Cover symlinks/FIFO/corruption, append/truncate/replacement, one-pass byte counters, zero full projections, same-project different-collection sharing, distinct roots, failure cleanup and mutation/runtime event epoch invalidation. Existing detail/controls/JSONL and both-workspace-mode deletion safety tests remain authoritative.

Client tests cover shared requests, refcounts, collapse/reopen, current-project queue priority, bounded background starts, full search beyond 100 rows, all affected collections and late responses, partial-failure invalidation, unrelated-project retention and explicit full refresh. Browser acceptance checks row menus/JSONL, archive/trash/restore, route/search, current/owned workspaces, file/diff refresh and desktop/mobile layouts.

Measure fixed before/after fixtures, P50/P95, bytes/passes, Git/projection calls, concurrency and independent responsiveness. For real sidebar DOM-ready timing capture the attachment timestamp with MutationObserver/performance.now; assertion polling must not become the measured timestamp. Disclose full identity-scan and large-record CPU limitations plus remaining registry/detail costs.

## 7. Wrong vs correct

Wrong: `sessions GET -> three repository.list calls -> catalog scans + full resource projections`; one useCollections per mounted group/page regardless of demand, with global refresh invalidating every project.

Correct: scoped summary response from one validated pending project snapshot; a feature-owned demanded list store shares rows and project generations, while detail/runtime/action endpoints continue to perform their existing exact validation.
