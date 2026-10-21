# Scoped workspace resources

## 1. Scope / trigger

Use this contract whenever changing resource routes, session state, files, commands or lifecycle actions. The custom Node HTTP server owns the only RuntimeManager; App Router pages must not construct another manager or mutate an active-project singleton. Preserve the visual-system and legacy cache-recovery contracts during extraction.

## 2. Signatures

- `WorkspaceRegistry.initialize()` performs controlled startup migration; `list()`, `resolve(projectId)` are passive and `register(path)` is explicit.
- `SessionRepository.read(projectId, sessionId)` resolves a durable resource independently of presentation list limits. `resolveExecution(...)` returns an `ExecutionDescriptor` with distinct installation, history and execution roots.
- `RuntimeManager.read(scope)` and `subscribe(scope, listener, cursor)` never acquire a Pi process. `command(scope, command)` acquires an exact owner for explicit actions. `withIdle(scope, operation)` excludes concurrent command/lifecycle acceptance without holding a model-run lock.
- Wire resource types and errors live in `web/shared/workspace-contract.ts`; runtime event/command types and decoders live in `web/shared/runtime-types.ts`.
- Routes: `/projects`, `/projects/:projectId/sessions`, `/projects/:projectId/sessions/:sessionId`, optional session `/files` or `/changes`, project `/files`, `/changes`, `/archive`, `/trash`. File selection uses `?path=...`, shareable session filters use `?q=...`.

## 3. Contracts

Project IDs resolve registered canonical directories; session IDs identify existing Pi histories or durable empty metadata. Names, directories and filenames are never route identity. Invalid/mismatched resources show their own recovery state. Reads, prefetch and subscriptions never create, continue, switch, abort or initialize execution.

Session creation/continuation is an explicit POST returning confirmed IDs before navigation. Git worktrees pin creation-time HEAD, use owned named branches and stay outside registered source roots. Do not copy local source contents or install dependencies. Legacy conversations are passive; continuation forks dialogue to a new ID with current committed code. Non-Git/unborn projects require user preparation before execution.

`KIVA_WEB_WORKTREE_ROOT` optionally selects the managed worktree location. `KIVA_WEB_RUNTIME_CAPACITY` bounds independent session owners (default 4). One project/session has one owner shared by tabs; separate sessions can run concurrently, even in one project. Navigation/disconnect does not stop execution. Capacity may reclaim only durably recoverable idle owners; pending RPC, tools, queues, retries, compaction and extension input are active.

Each wire event carries protocol/project/session/stream/sequence identity. Route changes ignore old reads/events and reset replay cursors by scope. Client drafts and attachments remain in per-tab memory keyed by project/session above project layouts. Capture the source key before async submit/attachment operations, so failures cannot restore content into the newly selected session. No draft persistence or URL content storage.

Metadata lives at project `.kiva/web/sessions/`; Pi history remains in project `.kiva/sessions/`. Registry migration is versioned, backed up and atomically replaced at controlled startup/registration. Empty-session metadata must not require invented transcript entries. Use supported exact-ID Pi CLI/SDK surfaces and verify identity before projecting events.

Deletion previews bind confirmation to exact target, lifecycle and workspace revision. Cleanup starts checked; unchecked means history-only trash. Under idle exclusion, revalidate ownership and all local staged/unstaged/untracked/ignored contents across the whole worktree. Busy, dirty or substituted workspaces block before side effects. Never force cleanup, delete branch refs or fall back to the source directory. Persist history/workspace outcomes separately because their mutations are not atomic. Restore does not recreate removed files.

Git status alone cannot prove cleanup safety: tracked paths marked assume-unchanged or skip-worktree can hide modified contents. Reject cleanup when `git ls-files -v` reports lowercase or `S` index tags; leave those flags and files untouched. Pending/partial deletion must remain accessible after reload, preserve the original cleanup choice and expose its operation/history/workspace outcomes for revalidated retry.

## 4. Validation & error matrix

| Condition | Result |
| --- | --- |
| Invalid IDs/commands/duplicate identity query/path traversal | 400; no target mutation |
| Disallowed mutation or WebSocket origin | 403 |
| Unknown project, missing session or wrong pair | 404; no fallback resource |
| Non-Git/unborn execution, busy/dirty/stale/ownership conflict | 409 with actionable state |
| All owners active at capacity | 503; no silent eviction or abort |
| Deleted diff target | Validate existing ancestors and allow Git history diff |
| Absolute/NUL/encoded traversal or target/ancestor symlink escape | Reject before filesystem/Git read |
| Partial deletion or removed workspace restoration | Expose retained/removed state and retry/recovery; do not claim atomic success |

Git diff arguments use literal pathspecs with external diff/textconv disabled. Bound text and diff buffers; binary and oversized files render explicit errors. Project-root inspection and session-worktree inspection remain visibly distinct.

Workspace file/status lists consume `git ls-files -z` and `git status --porcelain=v1 -z`; preserve raw path bytes represented as UTF-8 strings and parse rename source/destination as separate NUL records. Newline splitting, Git's quoted display paths, arrow splitting and trimming can corrupt Unicode/newline/space filenames before URL encoding.

## 5. Good / base / bad cases

- Good: two sessions edit the same relative file independently, each deep link resolves its own worktree, and leaving either page preserves its running owner.
- Base: an old session outside the latest 100 list entries remains passively addressable and offers explicit isolated continuation.
- Bad: selecting a route switches one mutable Pi process, a cold GET starts a session, an old event overwrites a new route, or restoring history silently recreates/reset code.

## 6. Tests required

Use temporary Git/installation roots and no paid prompts. Cover deterministic backed-up registry migration, canonical aliases, empty restart resolution/full-ID lookup, no dirty-source copy, pinned-base retries, supported Pi exact-ID/cwd/fork and extension cancellation, independent owners/two-tab sharing/capacity, delayed responses and event replay, draft source ownership, deleted/renamed/literal-pathspec/symlink files, and cleanup default/unchecked/dirty/busy/stale/partial outcomes. Run `pnpm typecheck`, `pnpm test`, `pnpm web:build`, `git diff --check` and task context validation.

Browser verification must use real App Router navigation, refresh and Back/Forward; actual folder picker; same/different-project sessions; default-checked deletion and dirty blocking; populated Markdown/tools/timestamps; composer controls and attachments; desktop/mobile light/dark; font resources; no overflow/hydration errors; legacy-worker retirement with unrelated storage preserved. Use an injected deterministic adapter in test composition for running-task UI checks.

## 7. Wrong vs correct

Wrong: `GET session -> runtime.snapshot() -> ensureStarted()`; `navigate -> switchProject(root)`; delete accepts a client directory; async draft restoration writes the current route's state.

Correct: `GET session -> repository.read(scope) + manager passive projection`; explicit scoped POST acquires one exact owner; deletion accepts scoped identity/confirmation/choice and the owning module resolves the directory; async completion writes its captured draft key.
