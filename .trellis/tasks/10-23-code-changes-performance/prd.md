# Optimize code changes loading and diff preview

## Goal
Reduce time to the usable code-changes list and selected diff on project/session `/changes` routes, without changing comparison semantics or tree interaction. The user approved the final planning summary and requested implementation on 2026-10-24.

## Confirmed background
- The previous directory task already removed bootstrap work and stabilized tree inputs. Do not repeat that refactor. `web/features/files/workspace-browser.tsx:19` still requests full WorkspaceData for both files and changes; `web/server/workspace-reader.ts` runs ls-files even when only changes are displayed.
- `web/server/workspace-files.ts:17-38` executes blocking Git diff and conditional status commands without a timeout. It returns stdout before checking exit status (:25), allowing a failing process with partial output to appear successful. Untracked preview reads/splits a whole file synchronously; its synthesized output can exceed the source file bound.
- `web/features/files/workspace-browser.tsx:21` does not pass refresh version to preview useResource. Its URL remains unchanged when refreshing the selected file, so the list refreshes independently of its displayed diff. This is a code-derived finding, not a measured latency result.
- Current comparison is tracked content relative to HEAD (combined staged/unstaged final working content), plus synthesized untracked additions. It does not provide separate index/worktree patches or historical comparisons.

## Requirements
- R1: Load only branch/status metadata and changed leaf paths for the changes tree; avoid enumerating/transferring all project file paths. Preserve full file-view behavior.
- R2: Execute diff Git commands asynchronously with explicit time/output bounds. Failed/oversized/timed-out work must not return partial success. The diff path must not synchronously read a multi-megabyte untracked file.
- R3: Refresh updates the selected diff as well as the list; fast selection/scope changes cannot display an old response as the new file. Keep current tree memoization, expansion, focus and deep links.
- R4: Reuse validated in-flight work for equivalent same-root/path reads where applicable, without caching completed diffs or bypassing project/session/path validation. Later completed-read refreshes observe external changes.
- R5: Preserve existing HEAD semantics, staged/unstaged/untracked coverage, renamed/deleted paths, literal filenames, workspace subdirectory boundaries, both session modes and passive runtime behavior. Unsupported repository/binary/large-file states remain explicit.
- R6: Record paired before/after measurements for change-list reads, selected tracked/untracked diffs and concurrent requests; separately measure other-request responsiveness while a diff is delayed. Report remaining registry/sidebar ownership costs and limits of the experiment.

## Acceptance criteria
- AC1 (R1): Changes page performs no git ls-files or filesystem fallback walk. Its list response has no full files array; normal file view remains complete. Nested untracked entries remain individual selectable leaves.
- AC2 (R2): Delaying a diff Git process does not synchronously stall an independent lightweight fixture route. Timeout/overflow/nonzero exit with partial stdout produce visible errors, never a successful patch. Source/response bounds apply to untracked additions too.
- AC3 (R3): After changing a file and explicitly refreshing the same selected path, its diff updates. Delayed old-path/old-scope responses cannot overwrite new selection; preview failures leave a loaded tree usable; list failures retain the existing resource-level recovery view.
- AC4 (R4): Equivalent concurrent reads share bounded work after validation; different roots/paths do not share content, and failed operations release their slots. A later fresh read is not served a completed cached result.
- AC5 (R5): Existing path and scope tests pass, plus fixtures for staged-only, unstaged-only, mixed, untracked, deletion, rename and tracked binary summary. HEAD comparison stays unchanged; no-HEAD/non-Git handling keeps its current preparation/recovery behavior and supported untracked preview compatibility.
- AC6 (R6): Save reproducible fixture sizes, commands, sample counts, P50/P95, subprocess counts, payload bytes and event-loop responsiveness evidence. No unsupported full-page/cold-start speed claim.

## Out of scope
Visual diff redesign, syntax highlighting, split panes, staged/unstaged tabs, patch application/staging/commit actions, historical comparisons, persistent caches, watchers, history indexing, global registry conversion and virtual scrolling. No change to ordinary file-preview UX; shared internals may require compatible async call-site/test adaptation.

## Planning status
No blocking product questions for this performance-focused proposal. Runtime timings and exact performance gains are unmeasured. Final plan approval received on 2026-10-24; execution is authorized.
