# Implementation Plan

Status: implementation, independent review, full automated checks, final build and browser acceptance complete on 2026-10-23. User approved commit, merge to main, feature-branch deletion and push on 2026-10-23.

## 1. Planning and Context

- [x] Read current model settings, credential persistence, runtime admission, transport, Pi public login/storage APIs, and official OpenAI documentation.
- [x] Prepare converged PRD, design, research, and real spec/research entries in both context manifests.
- [x] Obtain explicit approval of the final planning summary in a subsequent user message (“开始实现”).
- [x] Load Phase 1.4 detail, validate artifacts/manifests, and activate the task with `task.py start`.

## 2. Implementation Dispatch

- [x] Load Phase 2.1 detail and dispatch one Trellis implement agent. Start its prompt with `Active task: .trellis/tasks/10-23-openai-model-settings` and prefer native Codex context injection; require child-side loading as fallback.
- [x] Assign that agent the product/server/shared/UI/tests/fixture files below. State that it is not alone in the codebase, must preserve others' changes, and must not revert `web/next-env.d.ts`, commit, push, alter real credentials, or restart the user's service.
- [x] Main session owns task artifacts, specs, final integration/browser evidence, and final reporting. Use sequential implementation/review to avoid shared-contract conflicts.

## 3. Ordered Vertical Slices

1. [x] Add shared safe OpenAI authorization capability, request, prompt, state and result decoders. Keep provider/attempt IDs and revision checks explicit; no raw Credential values on the wire.
2. [x] Implement an installation-owned bounded authorization-attempt service using an injected Pi driver and staging credentials. Support idempotent begin, read-only polling, callback prompt input, timeout, cancellation, terminal-state retention, listener cleanup, and stable installation identity.
3. [x] Add validated short OAuth persistence/local sign-out operations to the existing settings coordinator/provider layer. Use the public Pi CredentialStore seam with a narrowly scoped Pi-compatible file adapter (AuthStorage is not a package-root export), target rechecks under its shared lock, provider-busy admission, and confirmed saved-with-warning semantics. Preserve unsupported overrides and existing API-key behavior.
4. [x] Connect settings HTTP routes and strict validators/origin policy. Add a transport/service cleanup seam and call it during production and fixture shutdown. Verify unrelated commands remain responsive while the browser flow waits.
5. [x] Add the OpenAI / ChatGPT panel in Settings → Models. Reuse existing ConfirmDialog, inputs, buttons, alerts, notices, safe API client, form pending-close, and catalog-replacement path. Support explicit authorization link, manual callback fallback, cancel/retry, reconnect, and confirmed local sign-out.
6. [x] Add service/transport/settings tests for the acceptance matrix; add an isolated deterministic browser fixture using the same production composition seam. Never initiate actual OpenAI login or inference from automated checks.

## Expected Files and Responsibilities

| Files | Why |
| --- | --- |
| `web/shared/provider-authorization.ts` (new), `web/shared/installation-settings.ts` | One safe public contract/decoder boundary and provider capability projection. |
| `web/server/provider-authorization.ts` (new), focused OAuth credential-store adapter if needed | Attempt lifecycle, injectable Pi interaction bridge, and Pi-compatible guarded storage through the public CredentialStore seam. |
| `web/server/provider-configuration.ts`, `installation-settings.ts` | Guarded OAuth persistence/removal and confirmed catalog/status refresh. |
| `web/server/scoped-transport.ts`, `server.ts` | Installation endpoints, narrow test injection seam, and cleanup. |
| `web/features/settings/openai-authorization.tsx` (new), `api.ts`, `dialog.tsx` | User-facing auth interaction within Models and existing save/read/pending plumbing. |
| `web/app/globals.css` or existing settings feature CSS | Only small auth-panel layout rules if existing settings classes are insufficient. |
| `web/server/provider-authorization.test.ts` (new), `installation-settings.test.ts`, `settings-dialog.test.ts`, relevant transport tests | Meaningful cancellation, persistence, admission, secret, interaction and regression coverage. |
| Focused isolated browser fixture, existing fixture cleanup callers | Real DOM acceptance without modifying the user's installation. |
| `README.md`, `.trellis/spec/kiva-web/frontend/global-settings.md` | Describe the explicit OAuth action and its boundary from passive settings reads. |

RuntimeManager should not need structural changes: only call its existing short mutation admission. Do not add a generalized auth framework, dependency upgrade, or account-specific remote catalog unless new evidence requires a revised scope review.

## 4. Quality Gates

- [x] Run focused tests for authorization/service/transport/settings after their corresponding slices.
- [x] Run `pnpm typecheck`, `pnpm test`, `pnpm web:build`, and `git diff --check`; there is no configured root lint command. Preserve the pre-existing `web/next-env.d.ts` change when build tooling touches generated files.
- [x] Dispatch the Trellis check agent sequentially with the active task path and full manifests for spec, cross-layer, tests and self-fixes. Repeat only checks warranted by new fixes.
- [x] Complete browser acceptance against an isolated no-model/fake-auth fixture: desktop and 390px/320px, light/dark, discoverability, link/manual fallback, status transitions, error/cancel/retry, focus/pending dismissal, confirmation, sign-out, catalog refresh and unchanged defaults.
- [x] Record exact validation and any unavailable real-account test in task verification notes. Do not claim a mocked flow establishes real provider access.

## 5. Completion and Rollback

- [x] Update the canonical global-settings spec to permit explicit OpenAI OAuth actions while preserving passive-read prohibitions and advanced-auth protection; document concurrency, local sign-out and cleanup.
- [x] Review the complete diff and leave only task-owned product/spec/task changes.
- [x] Load the required Phase 3 workflow/finish-work instructions before commit/archive/journal actions; honor user authorization and required concrete review gates.

Before commit, rollback is reverting only task-owned changes. After credentials are persisted, code rollback must preserve the Pi-compatible auth file; never delete credentials as a side effect of reverting UI code. Real-account authorization remains a user acceptance action, not an automated test prerequisite.

## Final Verification and Commit Gate

- Final combined independent check after user follow-ups:361 tests (11 root + 350 Web), root/Web typecheck and diff-check pass.
- Final production build passes; all original next-env bytes are preserved.
- Isolated final Chromium: 30 layout cases, 7 normal flow groups and 3 recovery groups; zero page errors or response credential leaks. Actual 9495 smoke: 1440/390/320, no API mutations and correct mobile focus restoration.
- Actual Web server was gracefully reloaded with the same command/environment only after all four sessions were confirmed dormant/idle/unqueued. Four history-file hashes are unchanged.
- [x] Obtain one-shot approval of commit-plan.md (“提交，合并到main，删除临时分支，推送”).
- [x] Create the two task work commits and fast-forward merge them to main (4dd0279,3aae5da).
- Post-archive operations authorized by the user: delete the merged temporary feature branch and push main.
- Finish-work archive/journal bookkeeping follows the two confirmed work commits.

User follow-up: OAuth `agent_name_hint` is now exactly `KivA`; existing focused9-test authorization suite passes. The currently pending real OAuth flow was preserved, so runtime reload/new authorization is required for that new query value.

## User Follow-up: Close-Web Command

- [x] Add `pnpm clear-web`, scoped positive process discovery and graceful stop, plus README guidance. Expected boundary: package.json, bin/clear-web.mjs, an optional focused src helper and test/web-process.test.mjs; no Web UI/auth refactor.
- [x] Verify real isolated child shutdown, idempotent no-server behavior, other-installation/unrelated survival and failure outcomes.
- [x] Independent review, appropriate focused/root/typecheck checks, spec/verification/commit-plan sync. Preserve the actual user Web process and pre-existing next-env.
