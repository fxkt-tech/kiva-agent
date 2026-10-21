# Workspace routing and isolated execution design

Status: implemented and verified on 2026-10-21 following the user's explicit start request. Implements PRD R01–R15 / AC01–AC11; see verification.md. The user subsequently confirmed the work commit; no push is authorized.

## 1. Architecture and ownership

The URL identifies a resource; the backend owns its execution; a page only observes or explicitly commands that resource. Keep the existing Next App Router, shadcn/Tailwind presentation and Node HTTP/WebSocket + Pi RPC stack. Do not move the same global mutable workbench into a giant provider.

~~~text
App Router URL
  -> feature module / scoped client store
  -> validated HTTP or WebSocket target
  -> project registry + session repository
  -> execution-workspace module + runtime manager
  -> exact Pi owner / exact worktree
~~~

| Module / seam | Small interface | Hidden implementation and invariants |
| --- | --- | --- |
| Project registry | list, register, resolve | Stable IDs, canonical-root aliases, capability, backed-up config migration; registration is explicit. |
| Session repository | list/read, create/continue, act | Full ID resolution, durable empty records, Pi transcript projection, collections and deletion orchestration. |
| Execution workspace | prepare, resolve, inspectRemoval, remove | Pinned Git base, owned directory/branch, Git capability, setup/recovery, containment and cleanup safety. |
| Runtime manager | read, command, subscribe | One owner per project/session/canonical transcript, single-flight startup, capacity, scoped streams, recovery and lifecycle exclusion. |
| Workspace shell | route-derived selection and feature slots | Sidebar, picker, mobile drawer, reserved right panel and scoped draft/cache lifetime. |
| Session/files/changes modules | resolved resource identity and user actions | Feature loading/errors, commands/previews and local interaction state; reuse collection logic for archive/trash. |

RuntimeHub, RuntimeEventStream, existing projections, rendering and shadcn primitives stay useful implementation pieces. Inject the existing Pi adapter factory and filesystem/Git operations at the owning module's test seam; do not invent a generic plugin framework or pass filesystem/RPC details through page props.

The custom HTTP server is the runtime-manager composition root. Next's separately bundled server modules must not construct a second execution manager. Thin pages parse route input and render feature entry points; scoped reads use the single transport/owning module, never a module-global “active project”. Do not form internal fetch origins from an untrusted request Host.

## 2. Route and navigation contract

| Resource | URL |
| --- | --- |
| Registered projects | /projects |
| Project session entry | /projects/[projectId]/sessions |
| Session conversation | /projects/[projectId]/sessions/[sessionId] |
| Session files | /projects/[projectId]/sessions/[sessionId]/files?path=src/main.ts |
| Session changes | /projects/[projectId]/sessions/[sessionId]/changes?path=src/main.ts |
| Explicit original-project files | /projects/[projectId]/files?path=src/main.ts |
| Explicit original-project changes | /projects/[projectId]/changes?path=src/main.ts |
| Archived collection | /projects/[projectId]/archive |
| Trash collection | /projects/[projectId]/trash |

- Opaque project IDs and real session IDs are identity; names, paths, branch names and transcript filenames are not. Renaming keeps the URL.
- Root / restores a valid per-tab remembered route or replaces it with /projects. A project-only URL replaces to its sessions entry. Invalid remembered links recover explicitly, not through a global runtime switch.
- Link/router push owns ordinary navigation. Use replace for canonical/default redirects and debounced search updates. Selected file/diff/filter belongs in query params; reject malformed/duplicate identity parameters rather than guessing a target.
- Sidebar files/changes links retain the session segment when the current URL contains a session. Without session identity, link to clearly labeled original-project inspection. Do not infer a session from another tab or mutable last-selected backend state.
- New-session/continuation actions navigate only to a confirmed returned identity. Cancelled/failed actions retain their previous route and show scoped feedback. Direct GET/prefetch never starts creation or follows an implicit continuation.
- Collections reuse one session-collection module. Archived/trash content is read-only until supported restoration; legacy original sessions are always non-executable and offer explicit continuation where applicable.
- Unknown IDs, wrong project/session pairs, moved roots or missing/removed workspaces have separate not-found/unavailable/recovery states. File errors are inline and cannot flash another session's preview.

These use standard App Router layouts/pages and client navigation rather than synthetic URL updates: [layouts/pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages), [navigation](https://nextjs.org/docs/app/getting-started/linking-and-navigating), [search params](https://nextjs.org/docs/app/api-reference/functions/use-search-params). The installed Next version is 16.3.8; verify against it rather than adding APIs from a newer documentation release.

## 3. Frontend shape and state

~~~text
web/app/(workspace)/
  layout.tsx
  projects/page.tsx
  projects/[projectId]/
    layout.tsx
    page.tsx
    sessions/page.tsx
    sessions/[sessionId]/
      page.tsx
      files/page.tsx
      changes/page.tsx
    files/page.tsx
    changes/page.tsx
    archive/page.tsx
    trash/page.tsx

web/features/
  workspace/       shell, sidebar, picker, scoped read stores
  sessions/        conversation, composer, drafts, collection actions
  files/           scoped list and preview
  changes/         scoped status and diff
~~~

Keep the persistent shell/client draft store above [projectId]; project layouts may remount. Thin routes resolve the URL and delegate to behavior-owning modules, with page-specific loading/error/not-found handling. Do not mount a separate connection/draft owner for each JSX fragment.

| State | Owner / lifetime |
| --- | --- |
| Project/session/section/file/filter | URL, not parallel workspaceView/sessionView/selectedId setters |
| History, live messages, controls, queue and replay cursor | Store keyed by project/session; backend authoritative |
| Unsent text/attachments | Per-tab memory map keyed by project/session (explicit entry draft key if needed) |
| Popovers, disclosure, menus, drawer | Local UI state |
| Pi work, extension requests, execution lifecycle | Backend owner, independent of React mounts |

Cancel/ignore stale reads at the feature seam and verify returned scope/version before applying data. Event reducers consume one typed wire decoder/projection. Async send failure restores its captured draft only to its source session, not whatever page is selected later. Drafts survive in-app navigation; refresh/closure does not restore them. No new storage dependency or draft bytes in URLs/localStorage/sessionStorage.

Retain the current client-only interactive rendering seam from kiva-workbench-client.tsx during extraction, placing dynamic ssr:false inside a Client Component. Do not add time/random/window-dependent server markup or combine routing with an SSR rewrite. Root font variables, semantic colors and network-HTML legacy-worker recovery remain unchanged.

The accepted visual system still governs presentation. Its old functional rule disabling the project plus merely because the current session is running is intentionally superseded by concurrency C: another session may be created while one runs, subject to capability/pending-operation/capacity checks. Likewise, session selection becomes URL navigation, not a mutable Pi switch. Update only those stale functional spec statements during implementation; do not restore removed labels, global creation, header content or right-panel settings.

## 4. Durable data and migration

### Project registration

Version installationRoot/.kiva/web-workspace.json to hold stable project IDs, canonical roots and recent navigation hints. Migrate old active/recent path strings once at explicit controlled startup/registration, with a backup and atomic replacement. Keep a single migration record so restarts reuse IDs. Missing roots remain recoverable records; do not reassign their IDs to a different directory or silently overwrite malformed config.

Canonical symlink aliases of one registered directory share its ID. Linked worktrees/subfolders need Git repository-root/common-dir capability checks; do not assume .git is a directory. Preserve the selected project subdirectory as relative execution context if applicable; file access remains contained in that resolved context.

### Session catalogue and metadata

Keep Pi JSONL under registeredProjectRoot/.kiva/sessions, including existing archive/trash layouts. Add application-owned versioned session metadata under registeredProjectRoot/.kiva/web/sessions, outside execution worktrees. Fields include project/session IDs, collection, name/timestamps, optional exact transcript path, legacy/source relation, base commit, owned workspace/branch and lifecycle/provisioning/deletion outcome.

The repository merges metadata with existing transcript discovery. Read the full applicable ID index, not the last 100 list rows; paginate/cap presentation separately. Reject ambiguous duplicate IDs instead of selecting an arbitrary JSONL. Legacy histories without owned-workspace metadata are classified as non-executable originals, not silently associated with the registered root as their worktree.

For an empty session, metadata is the durable identity until Pi writes a conversation. No fake user/assistant message, private _persist call or original-history rewrite is needed. Persist empty name/collection/base/workspace and confirmed model/thinking preference state so refresh/restart/archive/trash resolve the same resource. Reconcile successful control changes with Pi's authoritative state; do not let metadata blindly override newer transcript settings. Rename/collection operations on legacy or empty sessions use repository-owned metadata and must not start execution in the old directory.

### Managed workspaces

Use a managed root outside source trees, configurable as KIVA_WEB_WORKTREE_ROOT; the initial candidate default is a sibling .kiva-worktrees directory namespaced by installation/project/session IDs. Persist its resolved location rather than recomputing it after moves. Validate against registered roots and Git ownership; reject conflicting placement rather than nesting into a source tree or deleting broad directories.

Create an owned named branch such as kiva/session/<sessionId> at the pinned commit; never reset an existing branch or reuse an unrelated directory. Keep administrative metadata outside the worktree so it does not itself create ignored/untracked content that blocks cleanup. Each workspace records the Git common directory, tree root, selected project subdirectory, base commit, branch and provisioning state.

Git branches/objects are shared, while working directories/index/HEAD are separate. Worktrees do not provide a security sandbox or prevent arbitrary agent commands/external editors from touching other paths. Preserve branch refs during workspace removal. External detach/rebranch/move/lock/submodule states require validation/actionable recovery, not force.

## 5. Creation, continuation and execution

### Explicit creation

1. Resolve project/capability and reserve a session ID plus operation identity. Pin current HEAD to a commit immediately; record descriptive source branch separately.
2. Persist a provisioning intent; allocate only the exact owned branch/worktree, without source-local copying, dependency installation, stash or commit.
3. Record ready empty-session metadata, or persist a failure/recovery state. A retry uses the same operation/base rather than another UUID/newer HEAD.
4. Return the confirmed identity/location. A ready resource does not imply a Pi process was started; passive reads can project an empty session from metadata.

No creation on GET, subscription or prefetch. If setup partially succeeds, retain enough owned state to retry/inspect; never recursively erase an unknown or possibly modified directory as compensation.

### Exact Pi identity and empty recovery

Change createPiAdapter's inputs from one repoRoot to an explicit descriptor: installationRoot, historyRoot, executionRoot, projectId, sessionId and optional exact transcript path. Auth/model/extension configuration remains installation-local; history/cache ownership is explicit and separate from cwd.

Installed Pi 1.3.0 accepts --session-id with --session-dir and creates a missing exact ID; --session opens a managed existing transcript. RpcClient passes supplied args to CLI. Use these supported surfaces for exact startup and assert returned session identity/cwd before accepting commands. The metadata record makes an empty session durable even if no JSONL has yet been flushed.

Before wiring production behavior, run isolated no-prompt integration probes for exact-ID creation/restart, empty name/collection retention, forkFrom, worktree cwd and history root. Probe the installed extension lifecycle/cancellation paths too. If supported RPC/SDK behavior cannot meet the contract, stop that slice, record the technical incompatibility and revise the plan; do not synthesize transcript records or bypass cancellation using lower-level file manipulation.

A dormant session is a real resource, not a fabricated running snapshot. Passive state uses history/metadata and the active owner's last authoritative state if available, marked with lifecycle/freshness. Do not call RuntimeHub.snapshot to implement a cold read because it starts Pi. Model/control data must have explicit provenance; an explicit control action/initialization may acquire its owner when live options are needed. Revalidate options on mutation.

### Legacy continuation

Explicitly fork dialogue to a new-ID session through supported SessionManager.forkFrom with the project-owned session directory and new execution root. Pin the current committed code just as for creation, link source/child IDs and show that code is not restored from the old conversation. Supply corresponding workspace context to the new agent because inherited tool output may mention old absolute paths.

Respect cancelled:true wherever a supported lifecycle operation reports cancellation; do not treat transport success as creation success. Coordinate source archive/trash and duplicate submissions with repository ownership. Failed/cancelled continuation keeps the old view/history and records partial child state without executing in the original directory.

### Runtime manager

- Key owners by project/session and protect canonical transcript writer identity across aliases. Use single-flight acquisition and one Pi/RPC/RuntimeHub/queue/health owner per active session, shared by all its observing tabs.
- Serialize session command acceptance/lifecycle changes, not an entire model run; abort/steer/follow-up and extension responses must remain deliverable while running.
- Separate sessions have no project-wide execution lock. A brief repository-management lock may protect Git provisioning/removal metadata only, never serialize their model/tool runs.
- Use bounded configurable capacity (initial engineering default: 4 owners). Reclaim only provably idle, durably recoverable owners; otherwise return an explicit capacity result. No silent abort or fallback to one worker per project.
- Waiting UI input, queued work, retries, compaction and pending RPC are active states. A disconnected subscriber is not a stop signal. Keep streams/projection available while a task continues without a page.
- One worker failure/recovery changes only its scoped state/stream incarnation. Resume the exact session/workspace; never create an unrelated blank replacement. Server restart preserves histories/workspaces, not automatic replay of interrupted tool/model work.
- Legacy identity-changing new_session/switch_session commands are not accepted on a scoped owner's public command interface; resource creation/continuation belongs to the repository. Exact transcript switching may be a private startup operation only. If an extension unexpectedly replaces the active Pi session, detect/quarantine the identity drift before accepting snapshots/events as the old resource, preserve evidence and surface recovery; never silently rebind the route or leak another history into it. Exercise supported extension lifecycle behavior in the no-prompt gate.

## 6. Transport, validation and event contract

Retain Node HTTP/WebSocket ownership; no framework swap. These are the planned scoped transport paths:

~~~text
GET  /api/projects
POST /api/projects                                      explicit registration
GET  /api/projects/:projectId
GET  /api/projects/:projectId/sessions?collection=...
POST /api/projects/:projectId/sessions                   create
GET  /api/projects/:projectId/sessions/:sessionId         passive state/history
POST /api/projects/:projectId/sessions/:sessionId/continue
POST /api/projects/:projectId/sessions/:sessionId/commands
POST /api/projects/:projectId/sessions/:sessionId/actions
POST /api/projects/:projectId/sessions/:sessionId/deletion-preview
GET  /api/projects/:projectId/sessions/:sessionId/files?path=...
GET  /api/projects/:projectId/sessions/:sessionId/changes?path=...
GET  /api/projects/:projectId/files?path=...              original-root inspection
GET  /api/projects/:projectId/changes?path=...            original-root inspection
WS   /api/projects/:projectId/sessions/:sessionId/events?stream=...&since=...
~~~

The local-directory picker remains an explicit browse interface, separate from interpreting unregistered route IDs. Registering a directory is a POST; resolving an unknown ID must not turn it into a filesystem path.

Decode/validate request and wire data once at the seam into shared discriminated types. Target identity comes from route resolution, not a mutable global pointer or a caller-supplied absolute path. The owning filesystem/Git module rechecks mutable path/ownership conditions at use time. Preserve same-origin mutation/upgrade checks, body limits and safe subprocess argument arrays. Passive per-resource responses must not be cached across targets.

Event envelope: protocol version, projectId, sessionId, streamId, seq and typed event. Reuse RuntimeEventStream ordering/replay, one stream per session execution scope. New process incarnation rotates streamId; old cursors cannot replay another session. Snapshot + subscription/replay needs an ordered handshake so events between reading snapshot and attaching listener are not lost or applied twice. Route departure unsubscribes without cancelling execution.

Examples of typed errors: malformed input/path 400; forbidden origin 403; unknown/mismatched resource 404; cancelled/busy/dirty/stale-confirmation/ownership conflict 409; capacity exhaustion 503. Include a stable code, target and actionable state, without leaking credentials. Explicit partial-operation outcomes carry operation ID and history/workspace state rather than a generic misleading “nothing happened”.

File reads/diffs resolve the selected execution context once. Normalize URL encodings, reject NUL/absolute/traversing paths, validate real target or nearest existing ancestors for missing/deleted paths, and block symlink escapes. Bound preview/diff sizes and retain untracked/deleted/renamed handling.

## 7. Deletion and restoration

The full safety/recovery detail lives in worktree-deletion.md; selected behavior is mandatory:

- A focused dialog shows history/workspace effects and a default-checked removeWorktree. Unchecked retains all working files and only trashes history.
- Preview is non-destructive and returns target/lifecycle/workspace revision plus local-content status. An explicit deletion mutation supplies its choice and fresh confirmation identity, not a directory.
- Under per-session lifecycle exclusion, reject running/waiting/queued/retrying sessions and stale ownership/Git state. Quiesce an idle writer before moving history/removing cwd; do not implicitly abort.
- If local staged/unstaged/untracked/ignored contents would be removed, return a blocking conflict before history moves. Inspect the entire owned worktree, not only a registered project subdirectory. No --force, destructive override or automatic downgrade to history-only deletion. User must handle files or uncheck cleanup.
- Remove only a proven application-owned clean worktree using supported Git operations. Keep branch refs and source/other-session roots untouched. Reject externally changed/detached-unprotected/locked/submodule states that cannot be safely handled.
- Record intent and per-step outcomes for history move/Git removal, which cannot be atomic together. Retry idempotently and expose partial success/failure. A preflight block is not partial deletion.
- History restoration preserves its original ID but clearly reports retained versus removed workspace. It does not recreate files on GET or resume in the source root. A missing workspace has explicit recovery/continuation guidance and preserved branch/location; no automatic rebase/reset/recreation from current HEAD.

The selected option default does not authorize deleting current user worktrees during planning or testing. Integration/merge UI, branch deletion and standalone/bulk cleanup remain out of scope.

## 8. Migration, rollout and rollback

1. Introduce stable IDs/passive repositories and versioned metadata alongside current UI, with migration fixtures and no history rewrites.
2. Add exact workspace/Pi ownership and scoped transport behind the new module seam; verify independently using isolated fixtures.
3. Add the routed conversation vertical slice, then files/changes/collections and deletion UI. Avoid a mixed page issuing unscoped commands.
4. Cut over root/sidebar/client/backend together. Retire unsafe unscoped commands with an explicit refresh-required response; never guess a target from “active”.
5. Keep old config backup and commit/slice checkpoints. Reverting code must not delete worktrees, reset branches or automatically overwrite migrated config. Restore old registration config only with the server stopped and explicit operational direction; retain new session/workspace metadata and code for recovery.

Shutdown drains/stops owned processes deliberately, not by tab navigation. Upgrade deployment must not silently kill in-flight tasks; stop/restart is an explicit operator action, with no promise of mid-tool restart continuation.

## 9. Validation and technical gates

All acceptance outcomes map to implement.md. Test module interfaces using actual scoped transport hooks where relevant; mocks do not replace a real end-to-end route/worktree/Pi identity slice.

Required gates: full-ID/empty-session metadata and extension lifecycle probes; Git setup/cwd and no-dirty-copy fixtures; same-project concurrent owners and duplicate-tab single ownership; bounded capacity and scoped failure; URL navigation/stale responses; symlink/deleted paths; deletion content/ownership/race/partial-failure protection; existing visual/hydration/legacy-worker browser regressions.

No paid model calls are required for layout fixtures or Pi creation/state/fork probes. Use isolated temporary repositories for mutation/deletion tests, never the current project or another user's working tree. If technical evidence requires changing selected behavior, return to planning instead of silently weakening it.

## 10. Source and decision authority

PRD is authoritative for product requirements; this design is the implementation contract after final approval. research.md records code/package evidence; worktree-deletion.md records focused deletion invariants. Official references: [App Router](https://nextjs.org/docs/app/getting-started/layouts-and-pages), [navigation](https://nextjs.org/docs/app/getting-started/linking-and-navigating), [Git worktrees](https://git-scm.com/docs/git-worktree). Existing visual-system.md applies except the explicitly superseded singleton-execution functional rules above.
