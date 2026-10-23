# Changes loading and preview design

## Boundaries and API
Keep project/session URLs and selection query unchanged. Preserve metadata and normal file-view contracts established by project-files-performance.

Add `GET .../workspace?view=changes` for both project and session scopes. Return shared `WorkspaceChangesData = { renderedAt, project: { name, path, branch, dirtyFiles, changes } }`, with no files field. The existing workspace request without view still returns WorkspaceData. Validate unsupported/duplicate view parameters explicitly rather than silently choosing a projection. No persistent schema migration is needed; update server/client/fixtures together.

Changes list reads status, execution-root prefix and current branch, avoiding ls-files. Preserve raw NUL filename parsing and rename source/destination logic in one shared parser; do not duplicate the old reader. For non-Git/missing-Git changes views return the existing unavailable/preparation UI without a directory walk; unavailable roots remain errors. Do not accidentally convert a Git failure into an empty clean list. Unborn-repository restrictions remain the current preparation behavior.

Extend WorkspaceReader with typed changes projection (e.g. readChanges(root, capability?)), factoring shared root validation/status parsing. Include projection in the in-flight key because full workspace and changes-only payloads differ. No completed cache. A full workspace and changes-only request need not share every subprocess; prioritize not scanning all files for the changes view.

## Diff service
Replace blocking diff execution behind the existing `.../changes?path=...` endpoint with a bounded asynchronous reader. Preserve `{path, content}` success shape and visible comparison to HEAD. Tracked differences still show final working content versus HEAD; retain literal pathspecs and disabled external diff/textconv. Use the existing async argument-array runner where appropriate, with explicit expected exit behavior and safe error projection. Avoid exporting new general process abstractions solely for this task.

Use a proposed 15-second total preview deadline, not an unbounded sequence of per-stage waits. Preserve 2,000,000-byte text-source bound and apply a 2,000,000-byte diff-content bound to both Git and synthesized untracked output. Never return accumulated stdout after a failed/overflowed command. Distinguish legitimate untracked/no-HEAD fallback from arbitrary Git failures; retain existing supported untracked preview tests and non-Git recovery behavior.

Use asynchronous bounded file reads for untracked preview. Reuse raw path validation, containment/symlink checks and text/binary validation. If async conversion of shared path/text helpers also changes readProjectFile to a Promise, adapt its file-preview transport/tests together while retaining its existing response and size/binary behavior; no unrelated file feature redesign. Avoid maintaining two independent traversal validators. Revalidate root identity as needed across asynchronous boundaries; deleted tracked targets remain valid diff paths when existing ancestors are contained.

A preview reader owned by transport may coalesce in-flight validated reads keyed by canonical root, filesystem identity and exact relative path. Validate every scope before joining; no cross-root result reuse or completed cache. Retain work until every associated command ends; failure/timeout cleans up. Client cancellation must not kill shared work for another consumer; the total deadline bounds orphaned work. Coalescing does not promise atomic snapshots during external edits.

## Client changes
Choose the changes-only URL for kind=changes and the existing full workspace URL for files. Use shared response types with type-safe narrowing; no type assertions to pretend a files array exists. Keep tree input memoization from the prior task.

Pass the shell refresh version to selected preview reads so explicit refresh reloads the same path. Maintain URL/revision guards for selection and project/session switches. During a refreshed diff show a truthful loading/refresh state; do not label previous diff contents as freshly confirmed. Avoid replacing the global resource cache model or adding completed diff caching. Preview errors stay within the preview so a loaded tree remains usable. List errors retain the existing whole-resource recovery view; retaining a patch after a failed list read is not a new UI requirement.

## Compatibility and residual costs
Preserve project/current-branch/worktree ownership, passive GET behavior, raw UTF-8 filename strings, subdirectory prefix handling and safe deleted-path previews. Existing registry capability and session ownership work remain unchanged and may still block independently. Sidebar history indexing and project picker optimization are separate follow-ups, as measured in the prior task.

Ordinary diff semantics and layout remain unchanged. Bounded failures become explicit rather than accepting partial stdout; oversize untracked generated content is now rejected consistently. No patch truncation mode or partially complete patch is introduced.

## Rollout and rollback
Ship typed workspace projection, diff reader and browser adaptations together. Use temporary repositories and deterministic adapters for baseline/after tests; do not restart a live user server or invoke paid prompts. Revert coordinated code changes as one unit if required; no data rollback. Preserve pre-existing web/next-env.d.ts edits.
