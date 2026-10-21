# Project/session routing and workspace modularization

## Goal

Give every project, session and workspace section a reliable URL and independently maintained behavior. Direct entry, refresh and browser navigation must restore the requested resource without interfering with other tabs or running tasks. Preserve the accepted UI throughout the architectural refactor.

## Authorization and planning status

Implementation approved on 2026-10-21 by the explicit request `.trellis/tasks/10-21-workspace-routing，开始实现`. The selected behavior and acceptance criteria remain authoritative. Implementation and verification have now passed; see verification.md. Worktree/branch/history mutation during verification was confined to newly created temporary fixtures, with no paid prompts or user-server restarts. The user subsequently confirmed the work commit with `可以`; commit and bookkeeping are authorized, with no push.

## Confirmed background

| Concern | Repository evidence |
| --- | --- |
| Monolithic navigation | web/app/page.tsx:6 renders the workbench; web/components/kiva-workbench.tsx:65 owns the 539-line view, with workspaceView at :73 and sessionView at :89 rather than URL identity. |
| Global execution target | web/server/server.ts:18 and :25 hold one project/runtime; switchProject at :129 stops/replaces it and broadcasts to other tabs. |
| Project registration | web/server/workspace-registry.ts:5 has active/recent path strings rather than stable IDs; canonicalDirectory at :68 accepts existing non-Git directories too. |
| Unscoped transport | web/lib/use-runtime.ts:33 subscribes and commands without project/session scope. |
| Execution/history coupling | web/server/pi-adapter.ts:8 uses one root for execution and project .kiva/sessions; model/auth/extension resources are installation-local. |
| Files and changes | web/server/workspace-files.ts:7 and :17 operate on one supplied project root; paths and symlink containment need explicit workspace resolution. |
| History lifecycle | web/server/session-catalog.ts:27 and :44 archive/trash JSONL only; web/server/server.ts:229 validates recoverable history deletion, not worktree cleanup or integration. |
| Legacy continuation | Installed Pi dist/core/session-manager.d.ts:5 records ID/cwd, not a complete historical source snapshot; supported forkFrom at :394 can inherit dialogue into a new-ID session with target cwd. |
| Draft lifetime | web/components/kiva-workbench.tsx:70 and :72 keep unsent text/attachments in React memory, without refresh restoration. |
| Empty sessions | Pi may allocate an ID/path before writing JSONL. Stable empty-session URLs need durable application metadata, not fabricated messages or existing-history rewrites. |

## Requirements and confirmed decisions

| ID | Requirement |
| --- | --- |
| R01 | Use real App Router URLs for project, section and session identity; selected file/diff and shareable filters belong in query parameters. Stable opaque project IDs map to canonical registered directories; existing session IDs remain valid. Display names, absolute paths and JSONL filenames are not route identity. URL state is authoritative for active navigation/content. |
| R02 | Support direct entry, refresh and Back/Forward without stale-response flashes, duplicate navigation loops or implicit fallback to a different resource. Menus, popovers, disclosures and drawers remain local UI state. Reads, rendering, prefetch and subscriptions never create sessions/worktrees, change a global active runtime, abort work, send prompts or change models. |
| R03 | Extract behavior-owning workspace/session/file/change modules behind small interfaces and thin pages, not JSX fragments wired to every old setter. Preserve current visual design, project-row creation, composer/model/thinking/context controls, attachments, queue/abort, tool details, extension dialogs, file/diff browsing and archive/trash operations. |
| R04 | Concurrency C: independently execute multiple sessions, including within the same project, within explicit configurable capacity. Every read, command, extension response and event targets its project/session. Multiple tabs viewing one session share one execution owner; different sessions have independent model/thinking/context, queues, recovery and event streams. No global/per-project single-running restriction or silent eviction of active work. |
| R05 | Worktree policy B: new Git-backed sessions use independent managed Git worktrees. Separate project identity, project-owned history location and session execution directory. Pi tools and session file/diff pages resolve the same worktree; URLs retain session identity. A distinct original-project view must never masquerade as the session workspace. Show workspace location and branch. |
| R06 | Starting contents A: pin the registered root's current HEAD commit at explicit new-session creation. Do not copy staged/unstaged/untracked/ignored source contents, environment files or installed dependencies, nor auto-commit/stash source changes. First prompt, retry, refresh, source branch movement and runtime reacquisition do not silently advance the base or reset an existing workspace. |
| R07 | Legacy compatibility A: old root-executed conversations remain viewable, not executable in the original shared directory. Explicit continuation creates a new-ID isolated session inheriting dialogue through supported Pi interfaces and records its source relationship. Code starts from the current committed revision, not an inferred historical snapshot. Do not rewrite the original history, copy local code changes or replay old tools. |
| R08 | Non-Git compatibility A: allow directory registration, file/history browsing and actionable unsupported Git-diff states. Require user-prepared Git with an initial commit before creating/continuing an executable session. Never auto-initialize Git, make a first commit or fall back to shared-directory execution. Recheck capability after user preparation under the same project ID. |
| R09 | Navigation, subscriptions, tab closure and leaving a conversation do not stop backend tasks. Idle-runtime release must preserve durable recoverability; waiting extension input, queued work, retries and compaction are not idle merely because streaming is false. A failure in one owner must not reset others. Server restart does not imply automatic continuation of interrupted model/tool execution. |
| R10 | Preserve unsent text/attachments in memory across in-app navigation, keyed by project/session and isolated per tab. Full refresh/closure has the existing non-durable draft lifetime. No new draft/attachment storage, URL contents or cross-tab synchronization. |
| R11 | Preserve existing project directories and JSONL histories; registration migration is deterministic, versioned, backed up and non-destructive. Resolve older sessions independently of latest-N list limits. New empty sessions have durable identity/name/collection/workspace metadata and remain addressable across refresh/restart without inventing transcript entries. |
| R12 | Honor extension-cancelled creation/switching and confirmed identity before navigation; successful transport alone is not success when the result is cancelled. Late responses, missing/deleted resources and stale tab requests cannot target another resource. Unknown IDs do not register arbitrary filesystem roots. Validate relative file paths, encoded traversal, absolute/NUL paths and target/ancestor symlink escapes, including deleted diff paths. |
| R13 | Result-management A with deletion exception: no integration/merge UI this iteration. Session deletion offers “also delete the corresponding worktree”, checked by default; unchecked only moves history to recoverable trash and retains its worktree. Archive/navigation/tab closure/runtime release never remove workspaces. Keep branch refs/committed results; no implicit integration or branch deletion. |
| R14 | Dirty-removal A: block worktree removal when staged/unstaged/untracked/ignored local contents would be discarded. Let the user cancel, handle files, or uncheck cleanup and only trash history. No forced removal or second-confirmation override in this iteration. A default checkbox is not consent to lose files or abort active work. |
| R15 | Deletion dialog identifies the exact session, owned canonical workspace, execution/local-change status and recovery limits. Require tasks to stop/finish before deleting that session; never silently abort. Reject source/other-session roots, ownership/symlink mismatches and stale confirmations as cleanup targets. Legacy sessions without owned worktrees allow history-only deletion, never original-root cleanup. Revalidate at mutation time, quiesce idle writers, persist deletion progress and report partial failure/retry outcomes truthfully. History restoration does not itself recreate removed working files or silently start execution elsewhere. |

## Observable acceptance criteria

| ID | Requirements | Expected outcome |
| --- | --- | --- |
| AC01 | R01–R03, R12 | A bookmarked project/session/file/diff URL opens the exact resource after refresh or in another tab; Back/Forward restores content and highlights. Invalid/moved/deleted/mismatched IDs show explicit recovery/not-found UI, never another project's content. No prefetch/navigation mutation or hydration error. |
| AC02 | R03–R05, R09 | Two sessions in one project and sessions in different projects can run concurrently with separate messages, queues, models, context, abort and extension responses. Two tabs viewing the same session observe one owner. Closing/navigating a tab, recovering one worker or reaching capacity does not abort another task or revert to project-wide serialization. |
| AC03 | R05–R06 | Two new sessions have distinct worktrees; editing the same relative file in one does not alter the other's or the original working file. Session file/diff URLs, branch/location display and Pi execution agree. Creation with dirty source contents leaves them untouched and checks out the pinned commit; source branch movement, retry/reconnect/resume never resets session work. |
| AC04 | R07, R11–R12 | Legacy URLs remain passive views of the original dialogue. Explicit continuation returns a different session URL with inherited dialogue, source relationship and current-commit code notice. Cancellation/failure leaves the original view/history usable and never executes in its source directory. |
| AC05 | R08, R12 | Non-Git/unborn directories remain browsable without spawning Pi or changing Git state. New/continued execution reports an actionable block until user preparation, then works under the same project ID. Missing Git, permissions and setup failures never downgrade to shared-root execution. |
| AC06 | R10–R11 | Unsent text and attachments survive in-app project/session/section navigation only in their owning tab/session. Full reload preserves the existing non-durable draft behavior. Existing JSONL is unchanged by migration and old bookmarked IDs outside the first 100 rows still resolve. New empty sessions retain URL/name/collection/workspace identity across restart before any JSONL exists. |
| AC07 | R11–R12 | Malformed/encoded/traversing file paths, NUL/absolute paths and symlink/ancestor escapes are rejected, including deleted/renamed diff paths. Canonical project aliases deduplicate; unknown IDs cannot cause registration or arbitrary filesystem access. Stale responses/events never overwrite another route's state. |
| AC08 | R13–R15 | Delete dialog defaults cleanup on; cancel changes nothing. Unchecking retains the workspace byte-for-byte while history enters trash. A confirmed idle, owned, clean workspace is removed only when selected; its branch refs/transcript remain. Archive retains workspace. Legacy roots and other session/project paths are never cleanup targets. |
| AC09 | R14–R15 | Staged/unstaged/untracked/ignored local contents block cleanup without force, even if they appear after preview. Running/waiting/queued/retrying sessions block deletion. Users can uncheck cleanup for a history-only deletion after task quiescence. A stale preview or newly started task rejects the operation without silent data loss. |
| AC10 | R13–R15 | Git failure, history-move failure, disconnect/restart during deletion and repeated retries have explicit, idempotent outcomes. History restore distinguishes retained from removed worktree state; it does not claim to restore removed files, reset code or execute in a fallback directory. |
| AC11 | R03, R09 | Existing and new automated/browser checks pass: light/dark desktop/mobile, actual folder picker, creation controls while another session runs, composer/attachments, Markdown/tools/timestamps, scoped model/thinking/context/queue/abort, extension cancellation, hydration and legacy-worker recovery. No paid prompts are required for layout fixtures. |

## Out of scope and explicit limits

- UI redesign, Chinese font bundling, authentication/multi-user hosting, cloud sync, deployment/framework/dependency migrations, a database or distributed queue.
- Unlimited Pi processes, transparent recovery/replay of an interrupted model/tool run after server restart, or filesystem isolation from arbitrary external tools. Worktrees are not a security sandbox.
- Automatic source checkout/reset, commits, stashes, merges, pushes, Git initialization/initial commits, shared-root execution, implicit copying/installing local environment/dependency state, or historical-code reconstruction.
- In-product change integration, branch deletion, standalone/bulk cleanup, permanent transcript purging, forced dirty-worktree deletion, or cleanup tied to archive/navigation/idle eviction.
- Durable draft/attachment persistence, refresh draft restoration or cross-tab draft sharing. Retained workspaces and branch refs consume disk until explicitly handled.

## Artifact and review status

Product decisions have converged; there are no blocking product questions. design.md owns architecture/contracts/migration, implement.md owns ordered slices/validation, and research.md plus worktree-deletion.md preserve planning evidence and lifecycle detail. This task was activated after explicit implementation approval, and the coordinated route/runtime/workspace cutover has passed code and browser checks. verification.md records the acceptance evidence and approved commit scope.
