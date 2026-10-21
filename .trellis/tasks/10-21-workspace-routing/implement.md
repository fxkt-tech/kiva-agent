# Implementation plan: scoped workspace routes and worktrees

Status: final planning review only. All product decisions are resolved, including dirty-removal A. Do not run task.py start or edit business code until the user explicitly approves the latest final summary in a subsequent message.

## 0. Approval and execution preflight

- [ ] Receive approval of the final summary including default-checked optional worktree removal, blocking dirty cleanup, legacy continuation and non-Git limitations.
- [ ] Read the current task/workflow and trellis-before-dev for the affected package before business-code edits. Recheck dirty worktree and preserve unrelated user changes.
- [ ] Reconfirm package/script versions and actual installed Pi CLI/RPC interfaces; no dependency/framework migration.
- [ ] Keep this as one coordinated migration task with ordered slices: URL, transport and execution identity cannot be safely released as unrelated changes.
- [ ] Record the approved plan revision, then activate the task through the normal workflow. Do not treat a planning-choice answer or task-creation consent as this approval.
- [ ] Use no subagents unless later instructions expressly authorize them; the current plan does not require delegation.
- [ ] Capture baseline validation and identify isolated fixture roots/ports. Do not restart the user's server, switch its project or run paid prompts to gather layout evidence.

## 1. Stable project/session identity and passive storage

Primary seams: workspace-registry, session-catalog, bootstrap, shared resource types.
Requirements: R01, R02, R08, R11, R12. Acceptance: AC01, AC05–AC07.

- [ ] Introduce one typed resource/identity decoder and stable project registry; deduplicate canonical directory aliases, not display names.
- [ ] Version and migrate the existing active/recent config with atomic replacement and backup, preserving old paths/missing-root recovery and stable IDs across restart.
- [ ] Keep migration/registration writes out of render/GET/prefetch. Do not silently overwrite corrupt metadata or register unknown route IDs.
- [ ] Extract passive project/session read interfaces from singleton-runtime startup. Explicitly model Git capability: ready, non-Git, no commit, missing executable, unavailable root/permissions.
- [ ] Index/rescan all applicable transcript IDs independently of list limits; reject duplicate/ambiguous IDs and cross-project mismatches.
- [ ] Add durable application metadata for empty/new/legacy sessions, collections, workspace provenance, confirmed empty-session controls and operation state without rewriting existing Pi JSONL. Legacy rename/collection actions must not acquire an original-root runtime.
- [ ] Preserve project-owned session/archive/trash directories and installation-local auth/model/extension resources.
- [ ] Test old-registry migration, repeat startup, symlink aliases, missing/moved roots, malformed config, same-name projects, older-than-100 sessions, empty/no-JSONL records and non-Git capability refresh.

Checkpoint: existing UI can still function while scoped passive reads have independent tests. No new route is allowed to command a global active runtime.

## 2. Owned workspaces, exact Pi startup and legacy continuation

Primary seams: execution-workspace module, pi-adapter, session repository.
Requirements: R05–R08, R11–R12. Acceptance: AC03–AC07.

- [ ] Pin HEAD at explicit creation and reserve operation/session identity before Git work; retries retain that base and ID.
- [ ] Implement owned named-branch/worktree setup outside source roots, with durable provisioning intent, canonical ownership proof and explicit subdirectory/Git-common-directory handling.
- [ ] Keep application metadata/history/cache outside each execution tree; do not introduce ignored administrative files that make every workspace dirty.
- [ ] Never copy source staged/unstaged/untracked/ignored/dependency/env contents or auto-install, stash, commit, checkout/reset the source branch.
- [ ] Add isolated no-prompt Pi gates: exact --session-id/--session-dir empty creation, restart before JSONL, exact existing-session resume, name/collection retention, returned cwd/ID assertion, supported forkFrom and extension cancellation/lifecycle.
- [ ] Split adapter inputs into installation/history/execution identity. Prevent startup/resolver behavior from selecting another session or a new random blank session.
- [ ] Implement explicit legacy continuation as a new-ID dialogue fork/current-commit worktree with source linkage and agent/UI workspace notice. Keep original JSONL and working files untouched.
- [ ] Model setup/missing-workspace failures and idempotent retry without silently starting in the project root or discarding partial code.
- [ ] Verify two workspaces changing the same relative fixture file remain independent and the original working directory remains unchanged.
- [ ] Test dirty source trees, branch changes between reserve/setup/first command, duplicate submissions, unsupported Git states, child-fork failure, cancelled transitions and interrupted provisioning.
- [ ] If installed Pi cannot satisfy identity/cancellation contracts, stop this slice and return with technical evidence; do not manufacture transcript messages/private persistence or weaken behavior.

Checkpoint: a real isolated metadata/worktree/Pi identity flow is demonstrated without paid model calls. This is a technical compatibility gate, not a promise that it was already tested during planning.

## 3. Scoped runtime ownership, commands and events

Primary seams: runtime manager, RuntimeHub, RuntimeEventStream, server transport, scoped runtime hook/store.
Requirements: R02, R04, R09, R12. Acceptance: AC01–AC03, AC07, AC11.

- [ ] Compose the only manager in the custom HTTP server; avoid an extra manager from Next server bundling.
- [ ] Implement project/session/canonical-transcript ownership with single-flight startup, per-session command/lifecycle exclusion and independent queues/health/recovery.
- [ ] Keep abort/steer/follow-up/extension responses responsive while a task runs; do not hold an execution-wide lock or serialize by project.
- [ ] Add explicit bounded capacity and idle eligibility; waiting UI/queue/retry/compaction/RPC states are not idle. Never evict a running owner to satisfy another request.
- [ ] Implement passive cold reads and scoped subscription without ensureStarted; initialize runtime only for explicit actions. Label cached/dormant control data honestly and revalidate mutations.
- [ ] Add scoped HTTP/WS request decoders, origins/body limits and typed status/error results. Reject legacy identity-changing new/switch commands on public scoped owners; detect unexpected extension-driven session identity drift before projecting data into the old resource.
- [ ] Extend events/cursors with protocol/project/session/incarnation identity. Snapshot + replay subscription must not lose or double-apply events.
- [ ] Make route/tab unsubscribe independent of task lifetime; one process failure, stream reset or stale response cannot reset another session.
- [ ] Test same-project concurrency, cross-project concurrency, two-tab single ownership, races, capacity, idle eviction, delayed responses, cancellation, scoped extension dialogs and process recovery using deterministic adapters.
- [ ] Verify actual no-prompt Pi startup/state/cwd in isolated roots in addition to adapter tests. Server restart reports interrupted work rather than replaying commands automatically.

Checkpoint: scoped transport can run/observe the correct independent owners before any production URL is connected to it.

## 4. Routed shell and conversation vertical slice

Primary seams: app layouts/pages, workspace/session features, scoped draft/read stores.
Requirements: R01–R04, R09–R12. Acceptance: AC01–AC02, AC04, AC06–AC07, AC11.

- [ ] Introduce the persistent workspace shell above [projectId]; thin project/session route entry points derive scope from params/query.
- [ ] Keep client-only interactive loading where required; preserve root fonts, semantic CSS, transparent title-free header and network-HTML cache retirement.
- [ ] Route project/session navigation through Link/router, not a global runtime-switch command.
- [ ] Wire explicit creation/legacy continuation and navigate only after confirmed identity; preserve previous route on failure/cancellation.
- [ ] Extract timeline/composer behavior into the session module while retaining actual attachments, tools, queues, abort and model/thinking/context controls.
- [ ] Key drafts/attachments and async failure restoration by source project/session in per-tab memory. Do not add persistent draft storage.
- [ ] Keep each project row's plus/search/fold behavior; allow new session creation while another session runs, subject to scoped pending/capability checks. Preserve disabled-state reasoning and accessible names.
- [ ] Complete a browser vertical slice: direct session URL, refresh, Back/Forward, cross-project navigation, two sessions/tabs and navigation during a deterministic running task.
- [ ] Confirm late HTTP/WS results never flash/overwrite the newly selected resource. Old session URLs continue to show their original dialogue.

Checkpoint: the main conversation is a real route with correct backend identity, not a cosmetic pathname update.

## 5. File/change/collection routes and safe delete-time cleanup

Primary seams: file/change/collection features, workspace-files, session repository and deletion dialog.
Requirements: R01–R03, R05, R12–R15. Acceptance: AC01, AC03, AC07–AC11.

- [ ] Add session-scoped files/changes and explicit original-project inspection, sharing feature implementations without implicit last-selected-session state.
- [ ] Use query params for selected path/filter, correct push/replace semantics, safe relative path containment and stale-preview rejection.
- [ ] Verify deleted/renamed/untracked diffs, URL encodings, symlink ancestors, binary/size/error states and read-only unsupported Git views.
- [ ] Add archive/trash route pages using one collection module and stable IDs across moves.
- [ ] Replace window.confirm deletion with the exact session/workspace/status dialog and removeWorktree initially checked. For a legacy session without an owned worktree, do not offer root-directory cleanup.
- [ ] Implement deletion preview and target/state-bound confirmation; validate ownership and local contents again under lifecycle exclusion at mutation time.
- [ ] Block running/waiting/queued/retrying sessions; require explicit prior stop/finish. Quiesce idle writers before any history move.
- [ ] Block staged/unstaged/untracked/ignored-content removal across the entire owned worktree before side effects, not only a project subdirectory. No force/override option or silent history-only downgrade. Unchecking cleanup preserves all files.
- [ ] Use supported Git clean-worktree removal only for proven application-owned roots, retaining branch refs and rejecting unsafe detached/locked/submodule/external states.
- [ ] Persist multi-step deletion outcomes and idempotent recovery. Do not claim Git removal and history-trash moves are atomic.
- [ ] Restore history with truthful retained/removed-workspace state, preserved location/branch and explicit recovery guidance; never recreate/reset code or execute in the source root on read.
- [ ] Test cancel/default/unchecked/clean removal/dirty protection, all race checks, wrong roots, another session's ownership, partial failures, disconnects/restart/retries and history restoration.
- [ ] Keep integration/merge, branch deletion, permanent history purge and standalone/bulk cleanup out of scope.

Checkpoint: browser and transport tests prove the default checkbox behavior and dirty-file protection, using temporary fixtures only.

## 6. Coordinated cutover, documentation and full verification

Primary risky files: web/server/server.ts, runtime-hub.ts, pi-adapter.ts, workspace-registry.ts, session-catalog.ts, bootstrap.ts, workspace-files.ts, web/lib/use-runtime.ts, web/components/kiva-workbench.tsx, app entry/layout files and shared wire types.
Requirements/acceptance: all.

- [ ] Cut over root/sidebar and scoped client/backend together; remove duplicate workspaceView/sessionView/selectedId sources of truth and mutable global project/runtime paths.
- [ ] Retire unsupported unscoped mutation/WS paths with explicit refresh-required behavior, never compatibility routing through a global active project.
- [ ] Keep the existing legacy /sw.js retirement endpoint and HTML recovery upgrade path, including unrelated browser storage preservation.
- [ ] Update README for routes, creation, project selection, worktree location/branch, legacy/non-Git limits and deletion recovery behavior.
- [ ] Update the visual spec's singleton functional statements only where concurrency/routing intentionally supersedes them; preserve presentation contracts.
- [ ] Run trellis-check with full PRD/spec/cross-layer coverage during implementation, then execute the following checks and inspect actual results.

~~~sh
pnpm typecheck
pnpm test
pnpm web:build
git diff --check
python3 .trellis/scripts/task.py validate 10-21-workspace-routing
~~~

Browser matrix: light/dark at desktop and 320px/390px mobile; empty/populated conversations; real directory picker; exact URL navigation/refresh/Back/Forward; same/different project multi-tab runs; scoped controls and extension dialogs; attachments/drafts; tool summary/detail/copy and full timestamps; file/diff/collection views; deletion default/unchecked/blocked states; missing/removed resources; no hydration/nesting/resource errors; legacy worker/cache upgrade; no horizontal overflow. Use controlled fixtures, not paid model requests.

## Acceptance ownership

| Slice | Required acceptance |
| --- | --- |
| Identity/storage | AC01, AC05–AC07 |
| Worktree/Pi/legacy | AC03–AC07 |
| Runtime/transport | AC01–AC03, AC07, AC11 |
| Shell/conversation routes | AC01–AC02, AC04, AC06–AC07, AC11 |
| Files/collections/deletion | AC01, AC03, AC07–AC11 |
| Cutover/regression | AC01–AC11 |

Do not declare completion from lint/build alone: at least one real direct-link/worktree/runtime flow and real browser deletion choices must be verified.

## Rollback and handoff rules

- Keep a reversible source checkpoint after each passing slice; commits/pushes need appropriate user authorization.
- Data migration writes require backup/atomic replacement; do not rewind JSONL, branches or user code as source rollback.
- Run mutation/deletion tests only inside specifically created temporary repositories/workspaces, never installation/source/user project roots.
- Never use broad recursive cleanup or Git --force to “fix” a test. Preserve partial-operation evidence and report any actual removed material and recoverability.
- A code rollback does not imply deleting newly created worktrees or restoring old config over new metadata. Stop the server and obtain direction before an operational data rollback.
- Recheck this plan before task activation. Product/behavior changes found during a technical gate require renewed final review, not an unannounced fallback.
