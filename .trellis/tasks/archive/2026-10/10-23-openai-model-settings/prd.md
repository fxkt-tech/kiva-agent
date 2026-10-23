# OpenAI authorization in Settings → Models

## Goal

Let a Kiva user connect their ChatGPT subscription from Settings → Models, then select an OpenAI model without opening the terminal or manually editing credentials.

## Background

- Kiva pins Pi 1.3.0. Its `openai` provider supports API keys and Sign in with ChatGPT; `openai-codex` remains a built-in legacy OAuth provider.
- The settings UI currently offers API-key editing only. Existing OAuth credentials are intentionally read-only (`web/server/provider-configuration.ts:91`).
- The installation catalog already recognizes OAuth credential presence without resolving tokens (`web/server/model-catalog.ts:21`). Pi RPC processes share installation `.kiva/agent/` configuration (`web/server/pi-adapter.ts:12`).

## Requirements

- R1: Make ChatGPT authorization discoverable and usable inside Settings → Models, with OpenAI's current Sign in with ChatGPT flow as the primary path. The user-visible OAuth `agent_name_hint` must be exactly `KivA`.
- R2: Let the user open the provider authorization page, observe progress, supply a callback URL when required, cancel a pending attempt, and retry after a clear failure or timeout.
- R3: Reflect successful authorization in the provider status and installation model choices without requiring a Web-server restart. Model and thinking defaults change only through the existing explicit save actions.
- R4: Keep OAuth credentials on the server in the installation-owned Pi auth store. Do not expose access/refresh tokens through API responses, UI state, diagnostics, browser storage, or raw errors.
- R5: Opening settings and reading status must not start authorization, refresh OAuth tokens, write configuration, start Pi processes, or send model requests. Cancellation/failure before credential commit preserves the prior credential.
- R6: Keep existing API-key/provider editors and stored legacy Codex credentials compatible. Explicitly confirm any authorization action that will replace another stored credential.
- R7: Authorization waiting must not block unrelated sessions or settings reads. Credential commit must respect existing provider-busy admission and external-edit protection; active tasks are never stopped by authorization.
- R9: Provide the user-requested root command `pnpm clear-web` to gracefully stop Web server processes belonging to this installation. It must recognize existing development/production server processes, handle no running server successfully, preserve configuration/history/workspaces, and avoid stopping other installations or unrelated processes.
- R8: Support explicitly confirmed local sign-out for the connected OpenAI OAuth credential so the user can reconnect or return to the existing API-key editor. Sign-out does not claim to revoke the grant at OpenAI or restore a previously replaced key.

## Acceptance Criteria

- AC1 (R1–R2): A user can initiate OpenAI ChatGPT authorization from Settings → Models, open its authorization URL, and see pending/success/failure states without terminal commands.
- AC2 (R2, R5): Cancel, timeout, retry, repeated clicks, and late completion have deterministic outcomes; abandoned attempts cannot later replace credentials.
- AC3 (R3): On success, the provider reports OAuth and the existing model picker refreshes. Existing session controls and saved defaults retain their previous values until explicitly changed.
- AC4 (R4–R5): Offline tests prove no credentials/raw auth errors escape, no passive read causes network or writes, and rejected/cancelled attempts preserve the prior configuration.
- AC5 (R6–R7): Existing API-key flows remain functional, stored legacy OAuth remains usable, busy-provider/conflict cases provide retryable feedback, and unrelated session operations continue during browser authorization.
- AC6: Relevant server, transport, and settings interaction tests, typechecking, build, and isolated browser checks pass. Real account login/inference is reported separately from deterministic validation.
- AC8 (R9): The command stops an isolated installation-owned server, leaves another installation/unrelated process running, reports already-stopped success, and reports real discovery/permission/timeout errors without force-killing.
- AC7 (R8): Confirmed sign-out removes only the selected stored OAuth credential, respects busy/conflict checks, refreshes safe metadata/catalogs, and leaves model defaults untouched.

## Out of Scope

- Replacing Pi execution with Codex CLI/app-server or adding another agent backend.
- Importing credentials from a global Codex installation, multi-account management, or adding OAuth for unrelated providers.
- New login UI for the legacy `openai-codex` backend. Existing legacy credentials remain readable and usable; the new primary login uses `openai`.
- Automatic inference/connection tests, automatic default-model changes, and account-specific remote model discovery. Refreshing model choices means refreshing the existing offline Pi catalog; listed models do not certify account entitlement.

## Approved Behavior

- Provide a dedicated OpenAI / ChatGPT authorization section in Settings → Models, using Pi's current public Responses API path.
- Include login, reauthorization, cancellation, retry, and explicit local sign-out. Keep advanced command-backed/configuration auth protected from replacement.
- Confirm before replacing an existing simple stored API key or OAuth credential. A failed or cancelled authorization preserves the old credential.
- Keep the current offline catalog and explicit model/default selection behavior. Live account-specific model discovery is deferred.

## Artifact Status

The user approved the final planning summary on 2026-10-23 with “开始实现”. PRD, design, implementation plan, research, and both context manifests are approved for implementation.
