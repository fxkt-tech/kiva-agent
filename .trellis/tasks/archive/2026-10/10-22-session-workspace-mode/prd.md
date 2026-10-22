# Default session workspace mode

## Goal and authorization

Allow new sessions to execute directly in the current project directory or an isolated worktree. The user explicitly selected “改为当前分支默认” after the proposal to add Settings → Conversation → Default workspace, affect new sessions only and retain existing workspaces. This reply authorizes implementation of that scope.

## Background

New sessions currently always reserve and prepare a managed Git worktree. Browser preferences already persist conversation defaults. Session execution and file previews resolve persisted workspace metadata; deletion currently assumes any workspace is owned and removable. The only pre-existing dirty file is generated web/next-env.d.ts, which must be preserved and excluded from work commits.

## Requirements

- R1: Settings → Conversation exposes “默认工作区”, with “当前分支” and “独立 worktree”. Missing/invalid preference defaults to current-branch. Persist through existing browser preferences, reset with that group, and synchronize tabs normally.
- R2: All new-session entry points (sidebar, shortcut, entry first send and explicit continuation) capture the chosen workspace mode. Omitted API mode defaults to current-branch; reject unknown modes before side effects. Retry the same creation operation using its original mode.
- R3: Current-branch sessions execute and preview files/diffs in the registered project directory, including its uncommitted changes. Never create, switch, reset, stash or delete a branch/worktree for this mode. Explain that sessions share project files. Retain existing Git-ready admission and runtime concurrency policy.
- R4: Persist each session's chosen mode. Existing metadata with no workspace mode means worktree; changing the preference never migrates existing sessions. Current-branch resolution must prove the exact registered canonical path and Git repository identity; it must not silently fall back after substitution.
- R5: Worktree mode retains isolated checkout, creation-time commit, ownership proof, dirty/locked cleanup protection and retry semantics. Existing worktrees remain executable and removable under their original guards.
- R6: Current-branch deletion is history-only. Hide cleanup controls, return removeWorktree=false in previews and reject forged cleanup requests before history/filesystem side effects. Retain rename/archive/restore/JSONL and exact session identity.
- R7: Mode-aware labels, execution notices, branch/path and file-tree captions describe the actual directory; continuation inherits dialogue into the selected mode without claiming an isolated/pinned filesystem for current-branch mode.

## Acceptance criteria

- [x] Default/current/saved-worktree/reset/cross-tab preferences and all creation entry points are covered.
- [x] Direct API omission selects current-branch; explicit worktree creates isolation; invalid modes have no side effects.
- [x] Current-branch create/restart/execution/file/diff/continuation use the original dirty project directory without Git checkout mutations.
- [x] Legacy metadata with no mode still resolves its owned worktree. Changing defaults leaves all existing modes unchanged.
- [x] Idempotent retries preserve mode and IDs, including a preference change during a pending/failed create.
- [x] Current-branch delete cannot delete source files, even with a forged cleanup request; worktree cleanup safeguards continue to pass.
- [x] Typecheck, full tests, build, diff checks and theme/narrow browser settings checks pass with no paid prompts or real project mutations.

## Out of scope

Per-create override UI, moving existing sessions between modes, branch switching UI, merge/integration UI, non-Git execution support, new same-directory concurrency restrictions and automatic cleanup are not part of this change.
