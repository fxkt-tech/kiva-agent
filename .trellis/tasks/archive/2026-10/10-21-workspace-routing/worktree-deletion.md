# Session deletion and optional worktree cleanup

Status: converged planning contract, not implementation approval. The user selected result-management A with an explicit exception: no integration UI, but deletion offers default-checked removal of the corresponding worktree. They selected dirty-removal A: block cleanup until local changes are handled or cleanup is unchecked. No worktrees, branches or histories have been removed by this task.

## Confirmed scope

- Deletion offers `removeWorktree`, initially checked. Unchecked means recoverably trash the session history and retain its worktree. The default is a UI selection, not permission to discard dirty files or abort active tasks.
- Archive, route departure, browser closure and runtime eviction never remove a workspace.
- Retain branch refs/committed results. Worktree removal is not branch deletion or change integration.
- History recovery and workspace recovery are different: restoring a transcript does not itself restore removed working files. Disclose this before confirmation and record retained/removed workspace state.

## Existing evidence

- `web/components/kiva-workbench.tsx:272` uses a single `window.confirm` and cannot express a checkbox or preview.
- `web/server/server.ts:229` validates the old delete action; line 232 handles session actions using one global runtime.
- `web/server/session-catalog.ts:44` moves JSONL into recoverable trash only. It does not remove worktrees or branches.
- Git's supported `remove` operation refuses an unclean worktree unless forced. Locked worktrees and submodules introduce further safeguards; do not override them implicitly. Reference: https://git-scm.com/docs/git-worktree.

## Candidate UI and ownership contract

Replace `window.confirm` with a focused confirmation dialog during implementation. Display the exact session, owned canonical workspace, execution/local-change status, effect on history and whether code removal is recoverable. A legacy conversation without an application-owned worktree has no deletable original-root workspace. Never offer a project root, another registered root, another session's workspace or an externally substituted/symlinked path as a cleanup target.

The workspace module proves metadata ownership against Git worktree registration and canonical containment before removal; transport receives identity and explicit `removeWorktree`, not an arbitrary directory. Use Git's supported worktree-removal operation, not recursive deletion of user-derived paths. Creating managed session branches is the candidate mechanism to preserve committed results rather than leaving a detached-only tip. If external branch/detached/lock/submodule state prevents safe removal, return an actionable conflict rather than overriding safeguards.

## Runtime exclusion and stale confirmation

Deletion preflight and execution need shared session lifecycle exclusion with prompt/tool/runtime acquisition. A running/waiting/queued/retrying owner is not safe to delete; require the user to stop/finish it instead of implicitly aborting it. Stop/release an idle writer before moving its history or removing its cwd. Bind confirmation to the inspected target/state and revalidate at mutation time; changed ownership, Git state or a newly started task rejects stale consent.

Inspect staged, unstaged, untracked and ignored local contents across the entire owned worktree, not only a registered project subdirectory, rather than equating a simplified clean indicator with no potential file loss. The selected policy blocks cleanup when those contents would be discarded. The dialog offers cancel, handling files first or unchecking cleanup for history-only deletion; there is no forced-removal path or second-confirmation override. If cleanup is selected and blocked, do not silently downgrade to history-only deletion or move history before returning the preflight conflict. Revalidate again under lifecycle exclusion immediately before mutation.

## Partial failure and recovery

Git removal and history-trash moves are not one atomic operation. Persist intent and per-step outcomes, block new commands during deletion, make retries resource-scoped/idempotent and show partial failure honestly. Never report that everything remained intact if the directory was already removed, or claim cleanup succeeded while leaving an unreported workspace behind.

Preserve transcript recovery and workspace retained/removed metadata separately. Restoring history does not recreate lost worktree files or reset another workspace; surface missing/removed-workspace status and preserved branch/location for explicit recovery instead of silently executing in the source root. No integration/standalone cleanup UI or branch-removal workflow is included.

## Required validation cases

- Default-checked option, unchecking, cancel, clean removal and history-only deletion.
- Legacy conversations with no owned worktree; original project root never becomes a removal target.
- Running/waiting/queued/retrying task protection and a task starting after preview.
- Ownership, symlink, Git registration, locked/submodule/external-state and path-identity mismatch.
- Staged/unstaged/untracked/ignored content blocks cleanup, including changes appearing after preview; no force option is offered. Unchecking cleanup preserves all files and permits history-only deletion after task quiescence.
- One session's deletion cannot remove another workspace, branch or runtime.
- Git removal failure, history move failure, interrupted deletion and idempotent retry report truthful outcomes.
- Transcript restoration reports retained versus removed code honestly and does not silently rebuild/reset a workspace.
