# Workspace directory reads

## 1. Scope / trigger

Apply when changing project metadata, workspace listings or file-tree inputs. Project-directory readiness must not depend on bootstrap transcript parsing or inspection of unrelated registered projects. Session-directory ownership resolution retains its existing history checks. Independent sidebar and global picker reads remain separate costs.

## 2. Signatures

- `GET /api/projects/:projectId` returns `{ project: ProjectResource }`; no bootstrap.
- `GET /api/projects/:projectId/workspace` and `GET /api/projects/:projectId/sessions/:sessionId/workspace` return `WorkspaceData` from `shared/types.ts`: `{ renderedAt, project: { name, path, branch, dirtyFiles, files, changes } }`.
- `WorkspaceReader.read(root, capability?)` returns `Promise<WorkspaceData>`. One reader belongs to each scoped transport. `runWorkspaceGit(root, args, { timeoutMs, maxBuffer })` uses async argument-array child processes.
- File and diff previews remain the separate `.../files?path=...` and `.../changes?path=...` resources.

For the changes-only workspace projection and async preview signatures, see [Code Changes Resources](./code-changes-performance.md).

## 3. Contracts

Project/session ownership resolution precedes every directory read and in-flight lookup. Session views use their recorded execution root, including current-branch/worktree identity checks; failure never substitutes the project root. Workspace reads are passive and do not acquire runtimes.

Only in-flight enumeration is shared by canonical root, filesystem identity and enumeration mode. Success/failure removes the matching Promise; subsequent refresh reads current data. A disconnected consumer must not cancel another consumer's shared work. Root replacement invalidates the read. No completed-result cache, TTL, persistent index or watcher is implied.

The WorkspaceReader enumeration stage excludes histories, model configuration and recent-project/capability enumeration; session ownership resolution before this stage may read histories. Git reads run asynchronously with optional locks disabled, 15-second command timeout and 8 MiB output bound. Independent commands run concurrently; wait for all commands to settle before releasing the in-flight slot. Preserve NUL-delimited literal filenames, status rename records and execution-root prefixes. Remove duplicate paths without changing their contents. There is no 1,000-file cutoff.

Empty Git output is a legitimate empty listing. Filesystem fallback applies only to an explicit non-Git/missing-Git case, not failed Git inspection. Fallback uses async traversal, skips `.git`, `.kiva`, `.next`, `node_modules` and symlinks, and enforces listing bytes/time limits. Git reads do not promise an atomic snapshot during concurrent edits.

The browser memoizes status and file-entry arrays by source data references so selection/preview updates reuse the tree. Listing/status changes replace inputs. Preserve tree scope keys, selected ancestors, expansion and keyboard focus. Sidebar relative times use a stable shell render/refresh clock, independent of workspace data. Branch display comes from live workspace data.

## 4. Validation and error matrix

| Condition | Behavior |
| --- | --- |
| Unknown/mismatched project/session or ownership failure | Existing scoped error; no fallback resource or shared-data bypass |
| Unavailable project directory | 404 recovery; no enumeration |
| Valid empty Git listing | Empty tree; no filesystem fallback |
| Non-Git or missing Git | Bounded filesystem browsing remains available |
| Child output/fallback listing exceeds bound | `workspace_read_too_large`, HTTP 413; never partial success |
| Command/traversal timeout | `workspace_read_timeout`, HTTP 503; retry available |
| Permission/Git inspection failure | Explicit `workspace_read_failed`; never empty/partial success |
| Root changes during inspection | `workspace_replaced`; reload/retry |
| Route changes while read/preview is pending | Old results cannot render under the new resource identity |

## 5. Good / base / bad cases

Good: one cold file-page navigation performs one workspace enumeration; concurrent equivalent reads share that operation, and a later refresh sees external file changes. Base: more than 1,000 files remain selectable within the response bound. Bad: restoring bootstrap to format sidebar times, caching completed results without an invalidation contract, or scanning ignored directories because Git returned no files.

## 6. Tests required

Use real temporary Git fixtures for exact names, subdirectory rename boundaries, nested untracked and >1,000 paths. Cover empty/unborn/non-Git/missing-Git, permission/overflow/timeout errors, concurrent same-root sharing, different-root isolation, root replacement, failed-read cleanup and later freshness. Transport tests must prove project metadata/workspace reads do not parse transcripts or list all projects; session ownership checks remain intact. Frontend tests verify stable entries across delayed previews, changed-data updates, real sidebar relative times and delayed cross-scope reads.

Run typecheck, tests, production build, diff/context checks and isolated real App Router acceptance (refresh, Back/Forward, deep links, project/current-branch/worktree, desktop/mobile). Benchmark identical fixtures before/after and separate registry/sidebar costs; structural subprocess/history reductions are not a claim that the entire request chain is nonblocking.

## 7. Wrong vs correct

Wrong: `GET project -> bootstrap -> Git + SessionCatalog.list + registry.list`; `files.map(...)` inline on every preview render; failed Git becomes an empty listing.

Correct: `GET project -> metadata`, `GET workspace -> validated async WorkspaceReader`; stable memoized entries feed the tree, and bounded read errors remain visible. The wire shape and consumers ship together; no persistent data migration is needed.
