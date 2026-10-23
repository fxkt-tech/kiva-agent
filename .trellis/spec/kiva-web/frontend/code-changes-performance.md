# Code changes resources

## 1. Scope / trigger

Use when changing changes-tree loading, diff previews or shared resource refresh state. Preserve HEAD-versus-working-content semantics and project/session ownership. This builds on workspace-files-performance.md; directory, sidebar and registry costs remain distinct.

## 2. Signatures

- Project/session `GET .../workspace?view=changes` returns `WorkspaceChangesData = { renderedAt, project: Omit<WorkspaceData["project"], "files"> }` from shared/types.ts. The existing request without view still returns complete WorkspaceData.
- `WorkspaceReader.readChanges(root, capability?)` performs the changes-only projection. `read(root, capability?)` retains full workspace behavior.
- A transport-owned `ProjectDiffReader.read(root, relativePath)` returns `Promise<{path, content}>`; `readProjectDiff` is a standalone async compatibility helper. `GET .../changes?path=...` awaits the transport-owned reader.
- `readProjectFile(root, relativePath)` is async, returning the existing `{path, content, size}` shape; transport and tests must await it.
- `useResource(url, version)` exposes `loading` and `refreshing`. The selected preview passes shell version to this hook.

## 3. Contracts

Only `view=changes` is a supported explicit workspace projection; absent view means full workspace. Unsupported views, duplicate views and using view outside workspace resources are rejected. Project/session resolution and safe path validation precede each in-flight lookup, including requests that join shared work.

The changes projection reads status, execution-root prefix and live branch; it never calls ls-files or walks the filesystem fallback. Preserve NUL-delimited raw paths, individual untracked leaves, scoped rename handling and status meanings. Non-Git/missing-Git changes views retain preparation/unavailable presentation without scanning the directory. Actual Git failures do not become clean results. Projection participates in the workspace pending key.

Diffs compare HEAD to final working content for tracked files, including staged and unstaged changes; they do not show separate index/worktree patches. Untracked text additions keep the existing synthesized representation. Tracked binary Git summaries remain displayable; untracked binary files remain unsupported. External diff/textconv are disabled and pathspecs are literal argument-array entries.

Preview work uses a 15-second total processing budget, passed as remaining time to each Git command and checked across asynchronous path/file stages. Normal-file and untracked text reads, and successful diff output, are bounded to 2,000,000 bytes, including synthesized headers and added-line prefixes. A larger tracked source remains supported when its Git patch fits the output bound. Async reads use bounded chunks and reject growing files beyond the limit. A failed Git process with partial stdout never returns a successful patch. Only a proven absent HEAD permits the existing untracked/no-HEAD compatibility fallback.

Share only pending diffs by canonical root, filesystem identity and exact relative path. Revalidate each caller's path/root, validate root identity again after work and remove the matching Promise on completion/failure. No completed patch cache or atomic filesystem snapshot is promised. One browser's cancellation must not kill shared work for others; the backend budget bounds work.

Preserve a single path-validation owner across normal file and diff reads: reject traversal/nested encodings/escaping target or ancestor symlinks, but permit contained paths and deleted diff targets. Reject nonregular files before opening; use nonblocking open and repeat the regular-file check on the descriptor so a FIFO replacement cannot hang the shared helper. Validate opened-file identity after async reads. Normal file-preview size/binary behavior remains compatible.

On shell refresh retain same-resource tree data but mark selected preview as refreshing and hide the old patch until confirmation/error. URL/revision guards prevent late old-path/scope reads from overwriting current selection. Confirmed `replace` writes remain scoped to their captured URL, stamp the current refresh version and invalidate outstanding GETs; an unrelated version refresh must not discard a successful same-resource mutation.

## 4. Validation and error matrix

| Condition | Behavior |
| --- | --- |
| Duplicate/unsupported view | HTTP 400; no projection fallback |
| Changed project/session or unsafe path | Existing scoped/path error before sharing; no source-root fallback |
| Git failure or nonzero exit with partial output | `diff_read_failed`; no partial success |
| Missing/non-readable Git repository | `diff_requires_git`; preparation guidance |
| No HEAD and supported untracked text | Existing untracked addition preview |
| No HEAD with tracked preview | `diff_requires_head`; prepare first commit |
| Git/synthetic output exceeds bound | `diff_too_large`, HTTP 413 |
| Source text exceeds bound | `file_too_large`, HTTP 413 |
| Untracked binary text preview | `file_binary`; explicit unsupported state |
| Directory, FIFO or other nonregular text target | `file_not_regular` before a potentially blocking read |
| Total budget/child timeout exhausted | `diff_timeout`, HTTP 503 |
| Root or opened-file identity changes | `workspace_replaced`; retry/reload |
| Preview error while list loaded | Error stays in preview; tree remains usable |

## 5. Good / base / bad cases

Good: 10,000 files with four changed leaves transfers only status metadata; selecting a tracked file runs a bounded async diff. Base: changing disk content and refreshing the same selected path fetches and displays its new patch. Bad: sending all files to a changes-only tree, treating a failing Git command's stdout as a complete patch, or caching a completed patch without a freshness contract.

## 6. Tests required

Cover full versus changes-only projection, invalid/duplicate views, no ls-files or fallback traversal, raw scoped changes, projection sharing/isolation and failure cleanup. Use real Git for staged-only, unstaged-only, mixed, additions, untracked/no-HEAD, renamed/deleted, clean, binary and literal names. Verify timeout across stages, Git/synthetic overflow, nonzero partial output, source limits, root/path safety, concurrent same/different paths and freshness after completion.

Routed tests cover same-path refresh, truthful pending feedback, retained stable trees, independent preview errors, old path/scope races and successful same-URL writes across version changes. Browser acceptance uses actual App Router, both session modes, file-view compatibility, Back/Forward and desktop/mobile layouts. Benchmark list/diff latency and bytes separately, and prove an independent lightweight route remains responsive while Git is delayed. Do not claim this removes synchronous registry/sidebar ownership work or guarantees full-page cold latency.

## 7. Wrong vs correct

Wrong: synchronous HEAD diff in the HTTP handler, return stdout before inspecting failure, and refresh only the list because preview URL stayed unchanged.

Correct: await a scoped bounded ProjectDiffReader, reject partial failures, load the changes-only projection and pass refresh version to the preview resource while preserving its URL/revision and confirmed-write guards.
