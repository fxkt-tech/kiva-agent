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

The custom server binds loopback `127.0.0.1` on default port `9495`; `PORT` remains an explicit override. Next and HTTP/WebSocket allowed origins derive from the same resolved port, while browser requests/subscriptions use the current location rather than a hardcoded port. Changing this default must not alter registry/session storage or relax mutation origin checks.

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

Workspace file/status lists consume `git ls-files -z` and `git status --porcelain=v1 -z --untracked-files=all`; preserve raw path bytes represented as UTF-8 strings and parse rename source/destination as separate NUL records. Include individual untracked files rather than collapsed directory records, so both trees can select and preview each leaf. Newline splitting, Git's quoted display paths, arrow splitting and trimming can corrupt Unicode/newline/space filenames before URL encoding.

## 5. Good / base / bad cases

- Good: two sessions edit the same relative file independently, each deep link resolves its own worktree, and leaving either page preserves its running owner.
- Base: an old session outside the latest 100 list entries remains passively addressable and offers explicit isolated continuation.
- Bad: selecting a route switches one mutable Pi process, a cold GET starts a session, an old event overwrites a new route, or restoring history silently recreates/reset code.

## 6. Tests required

Use temporary Git/installation roots and no paid prompts. Cover deterministic backed-up registry migration, canonical aliases, empty restart resolution/full-ID lookup, no dirty-source copy, pinned-base retries, supported Pi exact-ID/cwd/fork and extension cancellation, independent owners/two-tab sharing/capacity, delayed responses and event replay, draft source ownership, deleted/renamed/literal-pathspec/symlink files, and cleanup default/unchecked/dirty/busy/stale/partial outcomes. Run `pnpm typecheck`, `pnpm test`, `pnpm web:build`, `git diff --check` and task context validation.

Browser verification must use real App Router navigation, refresh and Back/Forward; actual folder picker; same/different-project sessions; default-checked deletion and dirty blocking; populated Markdown/tools/timestamps; composer controls and attachments; desktop/mobile light/dark; font resources; no overflow/hydration errors; legacy-worker retirement with unrelated storage preserved. Use an injected deterministic adapter in test composition for running-task UI checks. When changing server binding, verify default `9495`, retained `PORT` override and origin-scoped HTTP/WebSocket behavior; safely reload the real server only after confirming no active owners/queues/extension requests.

## 7. Wrong vs correct

Wrong: `GET session -> runtime.snapshot() -> ensureStarted()`; `navigate -> switchProject(root)`; delete accepts a client directory; async draft restoration writes the current route's state.

Correct: `GET session -> repository.read(scope) + manager passive projection`; explicit scoped POST acquires one exact owner; deletion accepts scoped identity/confirmation/choice and the owning module resolves the directory; async completion writes its captured draft key.

## Project visibility

### 1. Scope / trigger

“移除” hides a registered project from presentation; it is not deletion, runtime termination or revocation of resource identity.

### 2. Signatures

- `POST /api/projects/:projectId/actions`, body `{ type: "remove" }`, returns `RemoveProjectResult = { projectId: string; projects: ProjectResource[] }`.
- `WorkspaceRegistry.remove(id)` persists visibility; `list()` returns visible projects, `listAll()` includes hidden registrations, `resolve(id)` resolves either, and `register(path)` restores a hidden canonical registration.

### 3. Contracts

Version-2 registration adds optional `hidden?: boolean` without rewriting IDs or changing the schema version. Missing means visible; invalid flags are corruption. Removal writes only the installation registry, is idempotent, and preserves directories, session metadata/JSONL, configuration, workspaces and running owners. Reimport of a canonical alias clears the flag and returns the original ID. A fully hidden registry is valid and startup must not resurrect the installation project. Passive bootstrap may still use installationRoot without registering it. Workspace reservation/cleanup ownership guards must use `listAll()`, because hidden source roots remain protected. Mutation origin checks apply; no new environment keys.

### 4. Validation & error matrix

Invalid action → 400; forbidden origin → 403; unknown project → 404; non-POST → 405. Unavailable registered directories can still be hidden by ID. Invalid registry flags → corruption error without overwriting the file. No failure may delete data or stop an owner.

### 5. Good / base / bad cases

Good: hide a running project, then reimport the same directory and see its original sessions. Base: hide the last project, restart, and retain an empty list. Bad: erase the registration, invoke session deletion, or make hidden workspaces eligible for cleanup.

### 6. Tests required

`workspace-registry.test.ts`, `project-visibility.test.ts`, scoped transport and routed workbench tests assert persistence/reload, canonical-ID restoration, exact data retention, unknown/unavailable/last-project behavior, unchanged running owner, hidden-root cleanup protection, cancellation/retry, late-route/create exclusion and scoped draft preservation. Use isolated roots for browser removal tests, never actual user projects.

### 7. Wrong vs correct

Wrong: filter a browser-only array or delete the registration/directory. Correct: persist `hidden: true`, filter `list()`, retain `resolve()`/`listAll()`, and clear hidden on explicit registration.

## Passive original JSONL

### 1. Scope / trigger

The session menu reads original JSONL independently of SDK-normalized conversation projection, across active/archive/trash collections and durable empty sessions.

### 2. Signatures

- `GET /api/projects/:projectId/sessions/:sessionId/jsonl` → `SessionJsonlDocument` in `shared/session-jsonl.ts`.
- `SessionRepository.readJsonl(projectId, sessionId)` and `readSessionJsonl(catalog, sessionId)` resolve exact owned history without acquiring Pi or modifying metadata/history.

### 3. Contracts

Response: `{ projectId, sessionId, fileName?: string, content: string, bytes: number, totalBytes: number, truncated: boolean }`; fileName is only a basename. `bytes` is returned UTF-8 size, `totalBytes` is the captured initial file size. Preserve BOM, CRLF, blank lines, malformed lines and incomplete trailing text. Empty `persisted: false` metadata returns an empty document without inventing a transcript. No client path, query parameters or environment keys are accepted; responses use no-store.

Identity resolution scans managed collections with Catalog-compatible filename fallback/last valid session-header rules and cross-file duplicate detection. Reject symlinks/nonregular files and revalidate canonical ownership/inodes using no-follow file opens. Scan only the initial fstat size so concurrent append cannot drift the snapshot. Read in 64KiB chunks; preview content is capped at 8MiB, preferably ending at a complete line. Full initial snapshots are scanned for identity (the cap is not a total-I/O limit). A single line exceeding 8MiB fails identity inspection rather than pretending a truncated parse proved ownership. Never route through SDK migration, runtime snapshot acquisition or a client-supplied filename.

### 4. Validation & error matrix

Invalid identity/query → 400; unknown/wrong project-session pair → 404; missing persisted history, duplicate identity, ownership substitution or an over-limit individual line → 409; invalid UTF-8 → 409 `session_jsonl_encoding`; non-GET → 405. Large multiline histories return a marked truncated preview, not a misleading complete document. Errors must not reveal unrelated file paths/content.

### 5. Good / base / bad cases

Good: inspect an archived original with malformed tail unchanged in raw view. Base: inspect a metadata-only session and show empty. Bad: start Pi to export normalized messages, silently skip corrupt rows, or claim the bounded preview is the full file.

### 6. Tests required

`session-jsonl.test.ts` and transport tests cover exact raw bytes/newlines/BOM, all collections, header/filename identity semantics, duplicate/missing/wrong pair, empty metadata, invalid encoding, symlinks/substitution, preview and individual-line limits, concurrent append snapshot, no-store and zero adapters/writes. Client tests cover scoped response validation and stale reads as specified in the visual-system contract.

### 7. Wrong vs correct

Wrong: `GET jsonl -> resource() -> SDK projection -> JSON.stringify(messages)`. Correct: exact registered scope → owned read-only file snapshot → unchanged UTF-8 content with explicit bounds → independent rendered/raw views.

## Installation model defaults

### 1. Scope / trigger

The combined model/thinking picker saves one installation-wide default pair for new sessions while preserving the settings of other existing sessions. This pair remains in Pi settings, never browser preference storage or an active-project singleton. The global settings dialog's installation endpoints, separate browser preferences, provider credentials and safe runtime refresh are governed by [Global Web Settings](./global-settings.md).

### 2. Signatures

- `ModelConfiguration = { provider: string; modelId: string; thinkingLevel: string }`; `isModelConfiguration` owns request shape/bounds validation in `shared/model-configuration.ts`.
- `GET /api/projects/:projectId/models -> ModelCatalog` returns sanitized models with Pi-supported `thinkingLevels` and optional `defaults`.
- `POST /api/projects/:projectId/models` accepts the complete configuration plus optional `sessionId`; returns the confirmed catalog/defaults. Project/session identities must resolve and mutation origin checks apply.
- Scoped `set_configuration` applies the complete pair in one runtime operation; ordinary Pi RPC `set_model`/`set_thinking_level` do not persist global defaults in Pi 1.3.0.

### 3. Contracts

`server/model-catalog.ts` reads options offline through public Pi `ModelRuntime`/credential APIs and obtains capabilities from the pinned `@earendil-works/pi-ai/compat` helper. Reads never start Pi, create histories, contact model services or write settings/credentials. Never expose API keys, provider URLs or unrelated settings.

Explicit save validates the available model and its thinking levels before side effects. If a session is supplied, apply only to that owner and persist its confirmed metadata controls. Guard the pair against interleaved prompts/control mutations; best-effort restore the previous pair on apply failure and report rollback failure honestly. A busy or invalid session cannot change defaults.

Persist through public Pi `SettingsManager` methods to `<installationRoot>/.kiva/agent/settings.json`, wait for `flush()` and check `drainErrors()`. Set `defaultProvider`, `defaultModel`, `defaultThinkingLevel` and the selected model's `modelThinkingLevels` entry, since a stale per-model override otherwise wins at startup. Pi owns file locking/merge behavior; preserve other fields, model overrides and credentials. Serialize complete default saves across tabs/projects. Runtime and disk writes are not atomic: if runtime application succeeds but disk saving fails, explicitly report that distinction and allow retry, never claim success.

New empty session creation copies current defaults into metadata only when controls are not already set; idempotent retries must not overwrite an existing choice. Existing snapshots/transcript/metadata controls take precedence over subsequently changed defaults. `useResource.replace` accepts server-confirmed catalog data only for its captured URL and invalidates older in-flight reads, so a late read/save cannot overwrite the confirmed pair or another project's active resource.

### 4. Validation / error matrix

| Condition | Result |
| --- | --- |
| Missing/invalid pair, non-string session ID | 400; no setting/runtime change |
| Unknown project/session or wrong pair | 404; defaults unchanged |
| Unavailable model/unsupported thinking level | 409; validate before applying/saving |
| Running/waiting session or overlapping pair application | 409; no interleaved prompt using half a pair |
| Malformed Pi settings | Actionable failure; preserve contents, do not expose contents |
| Default write failure after applying current pair | Error explicitly distinguishes current-session application from failed default persistence |

### 5. Good / base / bad cases

Good: confirm a pair once, refresh or open another project's entry and retain it; an existing session keeps its own pair. Base: no stored default leaves a selectable entry without creating a runtime. Bad: two immediate dropdown mutations, saving only to a draft/localStorage, overwriting other sessions or reporting save success without awaiting Pi's write queue.

### 6. Tests required

Cover passive catalog/secret projection, actual capability lists, unrelated-field preservation, unsupported/malformed/no-side-effect failures, cross-project defaults, creation-time pinning, current-session application, rollback/interleaving/busy protection, local candidate cancellation, pending save, failure/retry and late identity responses. Start real Pi offline with no prompt to verify new owners read back the saved pair and session-only RPC changes do not rewrite defaults. Browser-check served CSS/same-line trigger, floated panel, light/dark 1440px/390px/320px, persistence after refresh, current/other session independence and no paid model calls.

### 7. Wrong vs correct

Wrong: `onModelChange -> set_model`, then `onThinkingChange -> set_thinking`, assuming RPC also saved defaults. Correct: local candidate edits → one explicit complete-pair POST → validated scoped application → Pi settings flush/error check → confirmed catalog and success feedback.
