# Workspace routing verification

Date: 2026-10-21. Branch: `feat/workspace-routing`. Starting commit: `b8681b8`.

Implementation is complete. The full-scope Trellis reviewer reported no unresolved code findings after corrections. The user confirmed the proposed work commit with `可以` on 2026-10-21. The work hash is recorded in task/session bookkeeping; no push is authorized.

## Automated gates

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 5 CLI + 100 Web tests |
| `pnpm web:build` | Passed: production compile, types and all scoped routes |
| `git diff --check` | Passed |
| `python3 .trellis/scripts/task.py validate 10-21-workspace-routing` | Passed: 7 implement / 7 check context entries |

No lint script is configured. Existing macOS temporary-path expectations were corrected to canonical paths. Generated `next-env.d.ts` matches its original production shape.

## Acceptance evidence

| Acceptance | Evidence |
| --- | --- |
| AC01, AC06, AC07 | Real App Router direct session/file URLs, refresh, Back/Forward, route highlights, unknown-resource recovery, scoped draft/attachment memory and full-reload loss; delayed response/event and captured-source restoration regressions. |
| AC02, AC09 | Real browser same-project and cross-project concurrent owners, duplicate session tabs, navigation/closure without abort, scoped extension input surviving reopen, queue/abort isolation. Runtime/transport tests cover capacity, long RPC, pending events, retries/compaction and lifecycle exclusion. |
| AC03, AC05 | Real temporary Git worktree creation, pinned committed base, dirty-source exclusion, subdirectory context and independent file/diff reads. Non-Git browser files work, creation is disabled and changes explain required Git preparation. |
| AC04, AC06 | Legacy dialogue is passive; explicit browser continuation returns another ID with inherited dialogue/source linkage and current-code notice. Full-ID lookup beyond 100 rows, empty controls/collections/restart and unchanged original history are tested. |
| AC07 | Tests cover absolute/NUL/multiple-encoded traversal, target and ancestor symlink escape including deleted paths, Git literal pathspec, deleted/renamed files, Unicode/newline/whitespace query round-trips and selected-subdirectory path normalization. |
| AC08, AC09 | Real browser deletion cancel/default-checked/clean removal/dirty block/unchecked retention/history restoration. Real Git tests cover staged/untracked/ignored content, assume-unchanged/skip-worktree, ownership, registered roots, locked/substituted trees, stale previews and branch retention. |
| AC10 | Persisted history/Git/acknowledgment partial failures, fresh-repository restart/preview/retry, original-choice lock, new dirt before retry and trash retry UI regressions. Restored removed workspaces remain explicitly unavailable. |
| AC11 | Light/dark desktop 1440px and mobile 390px/320px, actual picker, title-free header/mobile drawer, composer/model/thinking/context, attachments, tools/copy/timestamps and first-party local Geist verified in Chromium. No horizontal overflow, hydration or uncaught page errors. |

## Installed Pi and production browser gates

Installed Pi 1.3.0 tests use supported CLI/SDK surfaces and extension commands without model requests. Verified full exact empty ID across stop/restart before JSONL, observed extension `ctx.cwd` and session cwd, external history ownership, existing transcript resume, supported forkFrom, extension UI response, lifecycle cancellation and identity drift quarantine.

An additional real production-server browser flow created an isolated worktree/session, confirmed dormant reads, explicitly initialized the actual Pi owner, checked the same session ID/idle state and empty transcript, and opened/refreshed its scoped README URL. No prompt was sent and no model call occurred.

The browser matrix used the actual scoped transport/session repository/Git workspaces with an injected deterministic adapter for running-task scenarios. Both this fixture and the real production server used new temporary installation/project roots on ports 30243/30244. Both servers were stopped after verification; no user server was restarted or user workspace migrated.

## Legacy worker and typography

Installed the actual `@agegr/pi-web@0.12.2` Service Worker in an isolated browser profile, seeded stale CSS and unrelated cache/worker/localStorage/sessionStorage/cookie sentinels, then loaded the production HTML recovery flow. Legacy registration retired; the next document swept a cache recreated by an old in-flight request; repeated reload stayed current. Unrelated storage and worker registration remained.

Chromium's rendered-font inspection reported custom local `Geist` with first-party WOFF2 responses while Google font services were blocked. Tool summaries measured 34px at every tested width/color scheme, native disclosure/copy worked, and narrow composer context popovers stayed within the viewport.

## Root causes corrected during review

- Async identity validation and authoritative snapshots could project a committed message twice. Stable event ordinals now reconcile with snapshots without collapsing distinct identical messages.
- Recycled message ordinals after settled compaction could inherit old tool activity; settled snapshots clear transient ownership.
- Partial deletion could lose its retry entry after refresh or change its cleanup choice; preview/UI now recover the persisted operation and original choice with fresh safety checks.
- Git status can hide local modifications behind index flags; cleanup now blocks when those flags prevent proof of cleanliness.
- Git display-path quoting/newline/arrow parsing and root-relative porcelain paths corrupted file URLs; NUL records preserve exact names and normalize to the selected project context.

Temporary fixture histories/worktrees and branch refs were retained for inspection. Clean worktree removals occurred only for explicitly created test sessions; branch refs and recoverable history remain. No application/user source tree, history or branch was removed.


## Approved work commit

Message: `feat(web): route project resources and isolate session workspaces`.

One coordinated commit includes the exact 73 paths below. The worktree was clean before implementation. A subsequent Next development run generated a separate `web/next-env.d.ts` import-path change; it is preserved outside this approved commit. No push is proposed. Archival/journal bookkeeping follows the work commit.

```text
.trellis/spec/kiva-web/frontend/index.md
.trellis/spec/kiva-web/frontend/visual-system.md
.trellis/spec/kiva-web/frontend/workspace-routing.md
.trellis/tasks/10-21-workspace-routing/check.jsonl
.trellis/tasks/10-21-workspace-routing/design.md
.trellis/tasks/10-21-workspace-routing/implement.jsonl
.trellis/tasks/10-21-workspace-routing/implement.md
.trellis/tasks/10-21-workspace-routing/prd.md
.trellis/tasks/10-21-workspace-routing/task.json
.trellis/tasks/10-21-workspace-routing/verification.md
README.md
web/app/(workspace)/error.tsx
web/app/(workspace)/layout.tsx
web/app/(workspace)/not-found.tsx
web/app/(workspace)/projects/[projectId]/archive/page.tsx
web/app/(workspace)/projects/[projectId]/changes/page.tsx
web/app/(workspace)/projects/[projectId]/files/page.tsx
web/app/(workspace)/projects/[projectId]/layout.tsx
web/app/(workspace)/projects/[projectId]/page.tsx
web/app/(workspace)/projects/[projectId]/sessions/[sessionId]/changes/page.tsx
web/app/(workspace)/projects/[projectId]/sessions/[sessionId]/files/page.tsx
web/app/(workspace)/projects/[projectId]/sessions/[sessionId]/page.tsx
web/app/(workspace)/projects/[projectId]/sessions/page.tsx
web/app/(workspace)/projects/[projectId]/trash/page.tsx
web/app/(workspace)/projects/page.tsx
web/app/globals.css
web/app/page.tsx
web/components/kiva-workbench-client.tsx
web/components/kiva-workbench.tsx
web/features/changes/changes.tsx
web/features/files/files.tsx
web/features/files/workspace-browser.tsx
web/features/sessions/collections.tsx
web/features/sessions/composer.tsx
web/features/sessions/conversation.tsx
web/features/sessions/drafts.ts
web/features/workspace/project-picker.tsx
web/features/workspace/projects.tsx
web/features/workspace/resources.ts
web/features/workspace/restore-route.tsx
web/features/workspace/route.ts
web/features/workspace/shell.tsx
web/lib/use-runtime.ts
web/server/bootstrap.test.ts
web/server/bootstrap.ts
web/server/event-stream.test.ts
web/server/event-stream.ts
web/server/execution-workspace.test.ts
web/server/execution-workspace.ts
web/server/fixtures/deterministic-adapter.ts
web/server/fixtures/runtime-probe.ts
web/server/hydration.test.ts
web/server/pi-adapter.integration.test.ts
web/server/pi-adapter.ts
web/server/runtime-hub.test.ts
web/server/runtime-hub.ts
web/server/runtime-manager.test.ts
web/server/runtime-manager.ts
web/server/scoped-transport.test.ts
web/server/scoped-transport.ts
web/server/server.ts
web/server/session-catalog.test.ts
web/server/session-catalog.ts
web/server/session-repository.test.ts
web/server/session-repository.ts
web/server/workbench-interactions.test.ts
web/server/workspace-directories.test.ts
web/server/workspace-files.test.ts
web/server/workspace-files.ts
web/server/workspace-registry.test.ts
web/server/workspace-registry.ts
web/shared/runtime-types.ts
web/shared/workspace-contract.ts
```
