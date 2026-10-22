# Design

## Contracts and compatibility

`shared/workspace-contract.ts` owns `SessionWorkspaceMode = "current-branch" | "worktree"`, DEFAULT_SESSION_WORKSPACE_MODE="current-branch", and isSessionWorkspaceMode(unknown). Add optional CreateSessionInput.workspaceMode. Keep OwnedWorkspace (optional mode:"worktree" to read old records) and add CurrentBranchWorkspace (mode:"current-branch"), sharing existing identity/path/Git/state fields. Only OwnedWorkspace has managedRoot. SessionResource.workspace becomes their union. Omitted persisted mode means worktree; omitted create mode means the new current-branch default. Do not confuse these defaults.

CurrentBranchWorkspace records the exact project executionRoot, source checkout treeRoot/repositoryRoot, commonDirectory, selected projectSubdirectory, creation baseCommit/branch and state. Resolve against the registered project identity, canonical directory, Git common directory and checkout root. The mode follows the directory's current branch without checking it out; preserve the original commit as creation metadata, refresh visible branch from current Git capability where practical. ExecutionWorkspace's existing worktree proof/removal stays specific to OwnedWorkspace; current-branch needs an explicit separate resolve path. Clients never submit filesystem paths.

`creationInput` validates workspaceMode centrally for create and continue. Repository also validates direct callers. Persist the selected mode with initial creation intent, keep it on retry and reject an explicitly conflicting mode for an operation. Worktree old-record retries remain worktree even with omitted new defaults. Current-branch creation writes only normal session metadata/history, never source Git index/content/branch or a managed worktree.

## Settings and request flow

Extend WebPreferences.conversation.workspaceMode through its normal decode/reset/store path. One shared enum/default drives both browser and server fallbacks. Shell createSession captures `{operationId, workspaceMode}` per project operation; retries retain the captured mode even if preferences change. Continue captures the mode similarly. UI uses existing Select/SettingRow and says current-branch sessions share project files. No save endpoint or global backend setting is introduced; as with other conversation defaults this preference belongs to this browser.

Existing-session workspace selection always comes from persisted metadata. File/diff endpoints and Pi descriptor resolve the same actual directory. Current-branch continuation notice describes the current project files; worktree notice retains the pinned committed base.

## Deletion

Current-branch previews represent a non-removable shared directory, use removeWorktree=false and mode-aware recovery text. A true cleanup request for current-branch is a conflict before history/deletion intent side effects. UI hides checkbox even during loading/error paths. Only a proven OwnedWorkspace reaches Git cleanup or interrupted-removal reconciliation. Existing worktree deletion behavior stays intact.

## Ownership

Root owns shared workspace contracts, scoped transport + tests, specs/task artifacts, integration/build/browser verification. Backend implementer owns execution-workspace.ts, session-repository.ts and their focused tests (plus direct caller fixture updates such as session-jsonl tests). Frontend implementer owns shared/web-preferences.ts, conversation settings, shell/composer/conversation/collections/workspace-browser and related UI/preference tests. No parallel owner edits shared contract or transport. All agents preserve pre-existing generated next-env.d.ts and other owners' changes; no commits, pushes, user-server restarts or real API mutations during implementation.

## Validation and rollback

Use temporary real Git repos to prove no current-branch checkout mutation, dirty contents retained, exact cwd/file roots and history-only deletion. Existing isolation tests must request worktree explicitly as the creation default has changed. Browser UI checks intercept writes; any server integration uses an isolated fixture server. Do not restart the live 9495 server while it owns work. Rollback is code-only; do not delete or migrate user session metadata/worktrees.
