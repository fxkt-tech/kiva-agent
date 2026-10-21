# Routing investigation and candidate architecture

Status: converged research supporting final planning review, not implementation approval. Confirmed choices: concurrency C; worktree isolation B; committed starting contents A; explicit legacy continuation A; browse-only non-Git compatibility A; result-management A with default-checked optional worktree removal during deletion; dirty-removal A (block cleanup, no force). PRD and design.md own the final contracts; implement.md owns execution order. No runtime, worktree, branch or business code has changed during planning.

## 1. Evidence and existing seams

| Concern | Evidence | Consequence |
| --- | --- | --- |
| Page ownership | `web/app/page.tsx:6`; `web/components/kiva-workbench.tsx:65` | One entry point and a 539-line workbench own several unrelated views. Extract behavior-owning feature modules, not only JSX fragments receiving all of the old state as props. |
| View identity | Workbench `workspaceView` / `sessionView` / `selectedId` | URL state and active navigation currently cannot survive direct entry or browser history. |
| Project identity | `web/server/workspace-registry.ts:5` | Registry needs stable IDs mapped to canonical directories; names are not unique. |
| Global runtime | `web/server/server.ts:18`, `:25`, `:129` | Reusing global `switchProject()` during route rendering would stop other work and broadcast a different project to every tab. |
| Eager state reads | `web/server/runtime-hub.ts:67` (`snapshot` calls `ensureStarted`) | A cold history view must not reuse this read as if it were a passive project/session lookup. |
| Event identity | `web/server/event-stream.ts`; `web/lib/use-runtime.ts:33` | Reconnect cursors must be resource-scoped; a global stream cannot safely mix projects/sessions. |
| Session lookup | `web/server/session-catalog.ts` | Existing sessions already have IDs; its limited list response must not become the only resolver for older bookmarked IDs. |
| File containment | `web/server/workspace-files.ts` | Existing relative-path checks need review for target/ancestor symlink escapes when exposed through direct links. |
| Execution/history coupling | `web/server/pi-adapter.ts:8` | One `repoRoot` supplies both Pi `cwd` and `.kiva/sessions/`; worktree execution needs separate roots without duplicating session catalogues. |
| Non-Git compatibility | `web/server/workspace-registry.ts:68` | Registration accepts arbitrary existing directories; do not silently convert them into Git repositories or weaken the selected isolation policy. |
| Existing lifecycle | `web/server/session-catalog.ts:27`, `:44` | Archive/trash move JSONL files only; worktree and branch retention need independent ownership. |
| Legacy conversation continuation | Installed Pi `dist/core/session-manager.d.ts:5`, `:394`; `dist/core/session-manager.js:1374` | A session header stores `cwd`, not a complete historical source snapshot. Supported `forkFrom` copies dialogue into a new-ID session with target `cwd`; it does not restore source files and must not be presented as doing so. |
| Existing draft lifetime | `web/components/kiva-workbench.tsx:70`, `:72` | Unsent text/attachments live in React memory, with no persistent storage. Preserve navigation retention with scoped ownership; refresh restoration would be a separate new capability. |
| Empty sessions | Installed Pi `dist/core/session-manager.js:691`, `:794` | A fresh ID/path can exist without a JSONL until the first conversation message. A stable empty-session URL needs explicit durable creation/resolution, not only current-process memory. |
| Cancelled transitions | Installed Pi `docs/rpc-commands.md` (`new_session`, `switch_session`) | RPC success can contain `cancelled: true`; URL changes must wait for confirmed identity and respect extension cancellation. |

The installed Pi 1.3.0 exports `SessionManager`, `NewSessionOptions.id`, `SessionHeader`, `CURRENT_SESSION_VERSION` and `RpcClient`. Its CLI accepts --session-id with --session-dir, and main.js:344–351 resumes an exact match or creates that ID; RpcClient forwards supplied args. Pi may delay JSONL persistence until a conversation exists. design.md uses durable application metadata plus these exact-ID supported surfaces, with an isolated no-prompt compatibility probe before production wiring. Keep JSONL ownership in one module; no fake messages/private persistence or existing-history rewrites.

## 2. Proposed URL contract

| View | Candidate URL | State |
| --- | --- | --- |
| Known-project entry | `/projects` | Registered projects; preserve the existing folder-picker behavior |
| Project conversation entry | `/projects/[projectId]/sessions` | Existing sidebar sessions plus project welcome; GET never creates a session |
| Specific conversation | `/projects/[projectId]/sessions/[sessionId]` | Exact session identity |
| Session files | `/projects/[projectId]/sessions/[sessionId]/files?path=src/main.ts` | Selected file relative to the session's worktree, optional path |
| Session changes | `/projects/[projectId]/sessions/[sessionId]/changes?path=src/main.ts` | Selected diff in the session's worktree, optional path |
| Project-root inspection | `/projects/[projectId]/files` or `/changes` with optional `path` | Explicit original-directory inspection, distinct from a session workspace |
| Archive | `/projects/[projectId]/archive` | Archived session collection |
| Trash | `/projects/[projectId]/trash` | Deleted session collection |

- Use opaque persistent project IDs and actual session IDs, never display names or absolute filesystem paths as identity. Rename does not change a URL. Canonical directories deduplicate symlink aliases.
- `/` remains a supported entry point and resolves to a valid remembered view or the known-project entry. Per-tab navigation preferences do not change server-wide runtime selection.
- Ordinary navigation uses Link/router push; default-entry redirects and canonicalization use replace so Back is useful. Search typing uses replace/debounce rather than adding a history entry per keystroke.
- Page identity comes from route params/search params; remove duplicate `workspaceView`, `sessionView` and mutable selected-session sources of truth. Async responses are keyed/validated against their requested identity and old responses cannot overwrite a newer route.
- A new-session POST returns a confirmed durable identity before navigation to its URL. Existing JSONL stays unchanged. Missing/deleted resources show explicit not-found/recovery UI, not a fallback to another session. Archived sessions open read-only or through their collection's supported view until restored.
- A legacy session URL remains a view of that original conversation. Its explicit continuation is a mutation returning a different session ID/URL, not a redirect that mutates the meaning of the original ID. Navigating or prefetching that legacy URL cannot allocate a worktree or automatically fork its dialogue.
- With worktree policy B selected, the session ID is part of file/diff route identity, not an implicit last-selected session. Sidebar navigation from a conversation retains that session ID. Without session context, any supported project-root view must clearly identify the original directory and must not pretend to be a session's workspace. The project-root/session routes reuse feature modules rather than duplicate implementations.

## 3. Proposed frontend ownership

```text
web/app/(workspace)/
  layout.tsx                         shared workspace shell and persistent client state
  projects/page.tsx                  known-project entry
  projects/[projectId]/
    layout.tsx                      resolve project metadata; no global activation
    page.tsx                        project-entry redirect
    sessions/page.tsx                session entry/welcome
    sessions/[sessionId]/page.tsx    conversation module
    sessions/[sessionId]/files/page.tsx    session-worktree files
    sessions/[sessionId]/changes/page.tsx  session-worktree changes
    files/page.tsx                   explicit original-project files
    changes/page.tsx                 explicit original-project changes
    archive/page.tsx                 archived-session module
    trash/page.tsx                   trashed-session module

web/features/
  workspace/                        shell, sidebar/project picker, scoped client stores
  sessions/                         timeline, composer, session actions and draft ownership
  files/                            file list/preview and file-loading state
  changes/                          change list/diff and change-loading state
```

Archive/trash reuse one session-collection module with collection-specific operations; do not duplicate the whole page. Existing message rendering, shadcn primitives, CSS tokens and font configuration remain reusable. Route files stay thin, while feature modules own behavior and a small interface; avoid a generic workbench provider exporting every setter to every page.

| State | Owner |
| --- | --- |
| Project/session/view/file/filter selection | URL; derive navigation highlighting from it |
| Loaded session history, live messages, model/context/queue and reconnect cursor | Resource-keyed session store; backend is authoritative |
| Unsent text/attachments | Draft module keyed by project + session (or explicit new-session draft key), isolated per tab |
| Drawer, disclosure, menu, project picker and context popover | Their local UI module |
| Pi process, prompt/tool work and extension request | Backend runtime owner, independent of page mount/unmount |

Draft-retention scope after inspecting the existing baseline: preserve text and attachments in memory across in-app navigation, isolated per tab and keyed by project/session. Full reload/closure does not promise unsent-draft recovery, matching the existing React-memory lifetime. The earlier unapproved sessionStorage proposal is withdrawn to avoid adding durable content storage to a routing refactor. Do not persist credentials/attachments, put drafts in URLs or silently synchronize editor drafts across tabs. Surface the retention limit in final review. Durable history does not imply guaranteed recovery of an interrupted model run after server restart.

The persistent shell/provider must sit above `[projectId]` if cross-project client state is to survive navigation. Project layouts can remount on project changes; a server task's lifetime must never depend on those mounts. Retain the existing client-only interactive rendering seam while introducing routes; do not combine the refactor with an unnecessary full SSR rewrite or remove legacy Service Worker retirement/recovery.

## 4. Proposed backend modules and interfaces

- Project registry module resolves stable IDs to canonical registered roots and project metadata. Version/migrate `.kiva/web-workspace.json` atomically with a backup; preserve old active/recent directories and all project histories. Render/GET/prefetch paths do not perform registration/migration writes.
- Session repository module owns ID-to-managed-file resolution, passive history projection, empty-session creation and archive/trash transitions, including orchestration of explicit deletion outcomes. Read the full applicable catalogue when resolving an ID; do not assume it is in the latest 100 rows or concatenate a URL ID into an arbitrary path.
- Runtime manager module owns explicit target selection, per-session command serialization, Pi ownership, event streams and bounded lifecycle. Keep the existing RuntimeHub/Pi adapter as implementation pieces rather than replacing the backend framework. Concurrency C is selected: active sessions have separate execution owners, not one owner per project.
- Execution-workspace module owns the durable session-to-worktree association, safe setup/recovery, deletion preflight/removal and resolved execution root. Its interface takes a resolved project/session target; callers do not construct directories or duplicate Git/worktree lifecycle logic. Pi execution and file/diff reads consume the same resolved workspace. Resource provisioning/removal is an explicit mutation, never a route-rendering side effect.

Investigated transport shape (final scoped contract is in design.md):

```text
GET  /api/projects
POST /api/projects                                  register explicitly selected directory
GET  /api/projects/:projectId/sessions?collection=active|archived|trash
POST /api/projects/:projectId/sessions               create; return confirmed sessionId
GET  /api/projects/:projectId/sessions/:sessionId     passive session/history/state
POST /api/projects/:projectId/sessions/:sessionId/commands
POST /api/projects/:projectId/sessions/:sessionId/actions
POST /api/projects/:projectId/sessions/:sessionId/deletion-preview   inspect exact owned workspace; no removal
GET  /api/projects/:projectId/sessions/:sessionId/files?path=...
GET  /api/projects/:projectId/sessions/:sessionId/changes?path=...
GET  /api/projects/:projectId/files?path=...          explicit original-root inspection
GET  /api/projects/:projectId/changes?path=...        explicit original-root inspection
WS   /api/projects/:projectId/sessions/:sessionId/events?stream=...&since=...
```

The HTTP/WS transport resolves and validates scope once, then passes a resolved target to the owning module. Never mutate the old global active-root pointer and subsequently execute against whatever happens to be active. Route rendering, GETs and automatic Link prefetch do not create sessions, send prompts or switch/abort other work. Check same-origin restrictions and scope for mutations, upgrades and extension-dialog responses.

Event envelopes/caches identify project + session + streamId + seq. Reuse RuntimeEventStream's sequencing/resync logic per owner rather than inventing per-tab sequence generators. Unsubscribe on route departure without stopping its backend task; subsequent visits get an authoritative snapshot plus replay/resync. A stopped/evicted runtime must be resumed from the exact managed session, not start a replacement blank conversation.

Model/thinking/context and confirmation/extension request IDs belong to the selected session's scope. Renames preserve IDs. File paths stay project-relative and reject encoded traversal, NUL/absolute paths and escaped symlink targets; missing/deleted diff paths require safe ancestor resolution rather than blindly requiring a currently existing file.

Candidate error cases: invalid input/path 400; unknown or mismatched project/session 404; execution ownership/extension cancellation conflicts 409 with actionable identity; explicit runtime-capacity exhaustion 503. These are proposed interface contracts, not implemented endpoints.

## 5. Confirmed runtime concurrency decision

The user selected C, explicitly requiring independently running sessions even within a single project, and subsequently selected B for independent Git worktrees. The reference to other coding tools expresses the desired product behavior; this document does not assume those tools' process or worktree internals. Read isolation, execution concurrency and per-session worktree ownership are required; worktrees do not constitute a security sandbox.

| Choice | Execution behavior | Trade-off |
| --- | --- | --- |
| One global running task (not selected) | Other sessions can be browsed; conflicting execution receives an explicit busy result | Smallest resource footprint, but unrelated projects block each other |
| One running session per project (not selected) | Different projects can run independently; another session in the same project is viewable but cannot replace a busy owner | Lower per-project resource use, but does not meet the user's selected behavior |
| Independent running sessions (C, selected) | Multiple sessions, including within one project, can execute concurrently | Needs session-level process ownership, bounded resource capacity and an explicit execution-directory policy |

The runtime manager is keyed by project ID + session ID and protects one owner per canonical session file. First acquisition uses a single-flight startup so simultaneous tabs cannot spawn duplicate writers. Each active session owns its Pi subprocess, RuntimeHub, queue, health/recovery and scoped event stream; different sessions never reuse one mutable Pi active-session context. Commands are ordered within that scope, without holding a lock until model completion that would block abort/steer. Process health/recovery for one owner must not reset another owner's streams or state.

Opening pages does not eagerly create one Pi process per route. Lazy acquisition has bounded configurable capacity; running owners are not silently evicted, aborted or queued behind a project-wide execution lock. Resource exhaustion returns a clear capacity outcome. Multiple tabs viewing the same session share its owner, not their editor drafts. A client disconnect is not an execution-cancellation signal. An owner waiting for extension input, queued work, compaction or automatic retry is not eligible for idle eviction merely because a simplified streaming flag is false. Release an idle owner only after durable session state is recoverable.

### 5.1 Confirmed execution-directory isolation decision

`createPiAdapter(repoRoot, installationRoot)` currently uses `repoRoot` both as `cwd` and as the location of `.kiva/sessions/`. Independent runtime objects do not alter that shared working directory. Concurrent sessions can therefore overwrite or observe each other's file edits even when their messages and command targets are isolated.

| Candidate policy | Effect | Additional product scope |
| --- | --- | --- |
| Shared project directory (not selected as default) | Every session operates in the original directory; smallest workflow change | Cannot provide independent working-file changes |
| Managed Git worktree per session (B, selected) | Sessions have separate working directories/HEAD/index while sharing the repository's object storage/refs | Session workspace identity, base revision/dirty-change handling, branch/change integration, non-Git behavior and non-destructive cleanup |

Reference: https://git-scm.com/docs/git-worktree. Worktrees are not security sandboxes and do not prevent merge conflicts or arbitrary tools from accessing other paths. Selection B authorizes planning the default isolation policy, not running Git mutations during planning. The subsequent delete-time cleanup exception is also a planning decision, not permission to remove current files. Automatic source-branch checkout/reset, stashes, commits, merges, pushes and unrelated cleanup remain outside scope.

Separate canonical project identity, project-owned session-history location and per-session execution root in the owning interface; do not accidentally create a second session catalogue inside every temporary tree. File/diff navigation identifies the relevant session workspace rather than silently showing the original project's files. Worktree deletion cannot be coupled to closing a tab, archiving a conversation or releasing a Pi process; only explicit session deletion may request it using the selected checkbox. Discarding dirty files needs a separately selected policy and truthful recoverability warnings.

Candidate workspace metadata includes project/session IDs, canonical execution root, ownership marker, base commit, associated branch/detached state and provisioning state. Keep this separate from Pi's existing JSONL so migration does not rewrite history. Allocate outside the source working tree to avoid nested file traversal and unintended tracking; the exact managed location remains an implementation detail to validate. Never derive a writable filesystem target directly from route text or reuse a pre-existing directory/branch without proving ownership.

Provisioning and runtime startup are single-flight for the same session. Persist enough intent and outcome to recover interrupted creation without a second worktree or silent fallback to the source root. A missing/moved worktree produces an explicit recovery state; it is not a reason to recreate it from a newer commit and lose the session's code state. Existing worktree registrations, non-root project folders, unborn repositories and submodules require capability checks rather than assumptions about a `.git` directory.

### 5.2 Confirmed committed starting contents

The user selected A: a new session starts from the registered root's current committed revision, not from a copy of its local uncommitted changes. Resolve `HEAD` to a commit ID at explicit creation and persist that immutable base with the new session/workspace identity. If provisioning is lazy or must retry, use that same pinned commit instead of resolving a newer `HEAD` at first prompt or retry. Branch names are descriptive metadata, not an immutable revision.

Do not copy staged/unstaged/untracked/ignored files from the source working directory, including local environment files or dependency directories. Normal checkout still includes whatever files are committed; this policy is not a guarantee that the repository contains no secrets. Do not stash, auto-commit, clear the index or require discarding source-directory edits merely to create the isolated worktree. Inform the user when excluded local changes exist. Dependency/environment setup must be explicit rather than silently copying arbitrary local data or running installation hooks during navigation.

Reconnecting or reacquiring an existing session uses its existing worktree and current state; its pinned initial base is not an instruction to reset subsequent work. Changes in the source branch after creation do not automatically merge, rebase or update the session workspace. Test branch movement between identity reservation, worktree provisioning and first command, plus dirty-source fixtures and failure recovery.

### 5.3 Confirmed legacy-session continuation

The user selected A for legacy compatibility: keep old root-executed conversations viewable, with an explicit continuation action that creates a new-ID session inheriting their dialogue in a new independent worktree. Do not keep a hidden shared-directory execution mode for legacy conversations or bulk-convert them when registering a project. This policy concerns execution/continuation, not removal of existing archive/trash/history browsing capabilities.

The installed Pi package exposes `SessionManager.forkFrom(sourcePath, targetCwd, sessionDir, options)` and sets a new ID/header/target `cwd` while copying non-header history entries. Use the supported surface in the project-owned session repository and validate it through an isolated no-prompt probe before choosing its final orchestration. Avoid manually rewriting the original JSONL or treating `cwdOverride` as permission to retarget an old conversation silently. Keep continuation histories in the registered project's session catalogue, not inside the worktree.

At the continuation action, pin the registered root's current commit using the same starting-content policy as a new session. Dialogue/tool output may mention old absolute paths and historical code; show an explicit notice about the new working directory/current committed code and provide equivalent agent-facing workspace context. This is not restoration of the original code state, and worktrees are not a filesystem security sandbox. Do not copy source-directory uncommitted files or replay old tool actions.

The session repository owns the source/child relationship and creation outcome; transport callers navigate only after confirmed creation. Handle duplicate submissions and source archive/trash transitions without guessing a file from its former relative path. Failed/cancelled continuation must preserve the original route and transcript, expose retry/recovery and never send a prompt in the source directory as fallback. Any partially provisioned child/workspace is recorded for recovery instead of being silently abandoned or deleting potentially modified files.

### 5.4 Confirmed non-Git compatibility

The user selected A: non-Git directories and repositories without an initial commit can be registered and browsed for files/existing history, but cannot create a new or legacy-continuation execution session until the user prepares Git with a usable commit. The application must not run `git init`, create an initial commit, request that changes be discarded or quietly fall back to execution in the original shared directory.

Represent execution capability explicitly in the passive project read model, distinguishing non-Git, no-commit, missing-Git and operational failures rather than presenting a non-Git folder as an ordinary detached repository. New/continued-session mutations recheck capability because filesystem/Git state can change after rendering. Return an actionable failure without allocating a child runtime/worktree or replacing the selected conversation. After external Git preparation, refresh capability under the same stable project ID. Preserve project-root file/history browsing and show an unsupported-state explanation on Git-diff views rather than inventing empty successful diffs.

### 5.5 Confirmed result-management scope and deletion exception

The user selected A for this iteration's scope: routing, concurrency, independent worktrees and location/branch visibility, without an in-product integration/merge workflow. They explicitly amended retention: the session-deletion dialog must offer removal of the corresponding worktree and check that option by default. Unchecking it preserves the worktree while the transcript enters recoverable trash. Archive, navigation, tab closure and runtime eviction still preserve workspaces. Do not re-ask the checkbox default or infer branch deletion from worktree deletion.

Deletion UI, ownership checks, runtime exclusion, state revalidation and partial-failure/recovery details are recorded in [worktree-deletion.md](./worktree-deletion.md), included in both manifests. Dirty-removal A is now confirmed: local contents block cleanup, with no forced-removal/second-confirmation override; the user can handle files or uncheck cleanup.

### 5.6 Converged decision inventory

| Decision | Evidence / product consequence | Status |
| --- | --- | --- |
| Worktree starting contents | A is selected: pin the registered root's current commit at explicit new-session creation; never copy local uncommitted contents or reset an existing worktree on resume. | Resolved; see section 5.2. |
| Existing-session execution | A is selected: legacy conversations remain viewable; explicit continuation creates a separate isolated session with inherited dialogue and code from the current committed revision. | Resolved; see section 5.3. No shared-directory legacy execution exception. |
| Non-Git/unborn roots | A is selected: browsing allowed, but new/continued execution requires user-prepared Git with an initial commit. | Resolved; see section 5.4. No automatic initialization/first commit or shared-root execution mode. |
| Result-management scope | A is selected with an explicit exception: no integration UI, but session deletion offers `removeWorktree` checked by default. Unchecked preserves it; archive/navigation never remove it. | Resolved; see section 5.5. Preserve branches and separate history recovery from workspace removal. |
| Uncommitted contents during deletion | A is selected: staged/unstaged/untracked/ignored local contents block cleanup. Handle files first, cancel, or uncheck cleanup for history-only deletion after task quiescence. | Resolved. No force or second-confirmation override; no automatic downgrade to history-only deletion. |
| Text/attachment retention | Inspected memory-only React state, no existing durable draft storage. Keep scoped drafts/attachments across in-app navigation; no refresh/closure recovery promise. | Baseline-preserving scope, not a new product default. Withdraw the unapproved sessionStorage proposal; include the non-durable lifetime in final review. |

All product decisions have converged. Draft retention preserves the inspected memory-only lifetime. design.md and implement.md now capture the selected contracts and gates; present their final summary and wait for subsequent approval before task activation or business-code edits.

## 6. Proposed delivery sequence

These are candidate vertical slices, not an approved execution checklist:

1. Final-review gate: product choices and PRD have converged; design.md and implement.md are present. Include non-durable draft lifetime, no-force deletion and workspace-removal recovery limits in the final summary. Do not start until the user approves it in a later message.
2. Introduce stable project IDs, scoped passive lookup and session resolution/empty-session recovery. Verify migration fixtures and target containment first.
3. Establish the execution-workspace module, explicit legacy-dialogue continuation and scoped command/event ownership before wiring production URLs to them. Test worktree setup/recovery, inherited history/new identities, shared history roots, races, separate execution roots and cancellation/failure without orphaned state or shared-directory fallback. Then verify runtime/event isolation and capacity outcomes.
4. Extract the shared shell and conversation module with a real session route. Complete a direct-entry/refresh/Back/Forward multi-tab vertical slice while retaining current presentation and draft/attachment behavior.
5. Move files, changes, archive and trash into their route-owned modules; convert sidebar/session/project navigation to links and post-confirmed resource redirects. Add deletion preview/confirmation with default-checked owned-worktree cleanup, explicit retained/removed outcomes, busy/dirty/ownership protection and partial-failure recovery tests.
6. Cut over the root entry and remove obsolete view state and global mutation paths. Deploy client/backend together; if an old tab uses an unsupported unscoped command, require refresh rather than guessing a target.
7. Verify existing behavior plus deep links, URL encoding, stale responses, multi-tab isolation, in-flight navigation, empty histories, deleted/moved roots, hydration, cache retirement and desktop/mobile layout. Keep a rollback point per slice and avoid an unrelated dependency/framework migration.

Use existing `pnpm typecheck`, `pnpm test`, `pnpm web:build`, `git diff --check` plus browser checks. No paid prompts are necessary for routing/layout fixtures; Pi creation/resume probes should use isolated temporary roots and no model calls.

## 7. References

- Next.js layouts and pages: https://nextjs.org/docs/app/getting-started/layouts-and-pages
- Client navigation and prefetch: https://nextjs.org/docs/app/getting-started/linking-and-navigating
- Query-string ownership: https://nextjs.org/docs/app/api-reference/functions/use-search-params
- Git worktree semantics: https://git-scm.com/docs/git-worktree
- Project contracts: `.trellis/spec/kiva-web/frontend/visual-system.md` and `.trellis/spec/guides/cross-layer-thinking-guide.md`.
- Installed Pi 1.3.0: `node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`, `docs/rpc-commands.md`, `dist/core/session-manager.d.ts`, `dist/core/session-manager.js`, and `dist/modes/rpc/rpc-client.d.ts`.
