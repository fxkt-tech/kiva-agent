# Redesign model settings workflow

## Goal

Let a user open Settings → Models and immediately understand which models can be selected, how to add a model, where to configure a provider, and how to set the new-session default.

## Background and confirmed constraints

The current category stacks the available catalog, defaults, ChatGPT login, provider/model definitions, and API-key forms in one scrolling page (`web/features/settings/dialog.tsx:78`). Repeated table/group-card/row cosmetic changes did not solve the user's configuration-path confusion. The user approved a workflow redesign and task creation after reviewing the proposed separation of model home, Add Model, provider management, and defaults.

The existing installation APIs support this frontend redesign. New providers require at least one model before a definition can be saved; model definitions and credentials have separate confirmed outcomes. Metadata distinguishes definition editability, credential editability, and authorization capability. Built-in/advanced definitions cannot be treated as editable custom providers. Evidence: `research/configuration-flow.md`, especially `web/shared/installation-settings.ts:7`, `:22`, and `web/server/provider-configuration.ts:50`/`:180`.

## Requirements

### R1 — A model home with a clear next action

- Opening the category shows a flat list of every model in the confirmed available installation catalog, its exact model ID, its provider, and a restrained default indication. Equal model IDs from different providers remain distinct.
- Add Model is the primary action on the available-models settings row; Manage Providers is the action on its own ordinary provider settings row. A compact explicit “ChatGPT / Codex 订阅” home entry opens the subscription authorization view directly, so restoring hierarchy does not hide the existing login capability. Endpoint, API-key, full provider-definition and ChatGPT authorization forms are not spread across home.
- Offer model/provider search for larger catalogs and actionable loading/empty/read-failure states. Do not label a static catalog entry as remotely tested or verified.

### R2 — An explicit Add Model path

- Start by choosing an editable existing custom provider or New Provider. The user sees the chosen provider context while entering model details.
- An existing-provider addition preserves every pre-existing model and connection setting. Duplicate model IDs within that provider and the supported model count limit prevent submission.
- A new-provider addition collects connection information and its first model before any persistence. Duplicate existing/built-in provider IDs prevent unintended overwrite.
- Optional advanced model capabilities remain available through existing disclosures rather than overwhelming the initial fields.
- Definition save and credential save remain explicit separate actions. After successful definition save, the flow retains confirmed identity and offers authentication if needed. It may truthfully show “已保存，待配置认证”; it must not claim that a saved definition is already usable.
- A key failure retries the failed credential operation without re-creating the provider or duplicating the model. Saved-with-warning states retain successful persisted work and offer reload.
- New Provider and Add Model from provider details enter this same flow.

### R3 — Provider management by provider identity

- Manage Providers lists configured and unconfigured providers with their truthful authentication state, including providers with no available models. Selecting one opens its details.
- Provider details contain supported connection/model editing, authentication controls, and ChatGPT login only for the matching capable provider. The dedicated subscription view and provider detail reuse the same authorization operation; navigating there is passive and does not show the generic API-key editor.
- Definition, credential, and authorization capabilities are honored independently: read-only built-in definitions do not hide supported credential/login actions. Unsupported cases display the reason and a usable route to provider management or a new compatible custom provider.
- Built-in models become selectable through supported provider authentication, not manual rewriting of Pi-managed model definitions.

### R4 — Explicit defaults

- A dedicated compact row shows the confirmed new-session model and thinking level, with an explicit Change action.
- Editing uses the existing complete model/effort selection. Save persists the pair; Cancel restores the confirmed values.
- Adding a model, saving a key, or completing login never silently changes the default or existing session controls.

### R5 — Editing and async continuity

- Inner and category navigation preserve unsaved candidates and active authorization. Leaving a dirty form prompts for discard; a pending save cannot be duplicated or silently abandoned.
- Authorization remains one operation with reachable progress/cancel controls, retained across view changes. Overall settings dismissal continues to honor dirty/pending guards.
- Explicit revision-conflict reload permits retry with the retained candidate and refreshed confirmed revision. Older reads cannot overwrite successful saves.
- Typed keys are never persisted in browser storage or echoed, and are cleared on save/cancel/owner disposal. Advanced configuration and unrelated providers remain intact.

### R6 — Consistent presentation and bounded scope

- Match the actual structure of Appearance/Conversation: one existing settings-section-heading (h3 + explanation), followed by continuous ordinary SettingRows with actions on the corresponding row’s right. Home has no bespoke navigation/action header, secondary h3 section headings or styled section wrappers around compact rows. Reuse normal row spacing/borders rather than suppressing last-row borders with a special override. Keep the existing typography, responsive fields, semantic themes, feedback, overlay/focus behavior, and one outer settings scroll surface.
- Do not use browser testing, CUA, screenshots, Playwright, real-account authorization, or provider inference probes. Validate with code tests, typecheck, build, diff checks, and code review.
- Preserve earlier unrelated working-tree edits from this session and user-owned files.

## Acceptance criteria

- **AC1 (R1):** Home shows exact catalog/provider identity, the default summary, Add Model, Manage Providers and a discoverable subscription-login entry, while connection/key/login forms are absent from the visible home. Empty/error states retain a working setup/reload path; opening any passive view creates no write, runtime or login attempt.
- **AC2 (R2):** Adding to an editable provider sends one valid definition operation preserving its old models/connection. Blank/duplicate IDs, duplicate new-provider identity and model-limit violations cannot submit.
- **AC3 (R2):** New-provider connection/model steps produce no writes until Save Model. Confirmed definition success advances to the saved provider identity and, if required, its separate authentication step. Key failure/retry preserves saved work, uses the confirmed credential revision, and never repeats provider creation.
- **AC4 (R3):** Provider management can open an unconfigured built-in provider and offer its supported authentication while its model/connection definition remains read-only. Advanced/OAuth restrictions and reasons remain accurate; ChatGPT / Codex subscription login is reachable directly from home and through its provider detail; both retain one operation, pending/cancel state, existing replacement/logout confirmation and exact capability reasons.
- **AC5 (R4):** The default pair changes only through its explicit Save. Cancel, model add, key save and authorization success leave prior defaults/current-session controls unchanged.
- **AC6 (R5):** Inner/category navigation, dirty discard, pending saves, authorization cancellation, conflict reload, partial success and late metadata/catalog responses retain their correct identities and candidates; only one form/auth owner reports each state.
- **AC7 (R6):** Meaningful settings/provider/auth regression tests, typecheck, production build and diff checks pass or have explicit unrelated-failure evidence. No browser interaction/test is performed and no visual-browser validation is claimed. Existing shared settings primitives own the visual language.

## Out of scope

New backend APIs, schema/storage migrations, live remote model discovery, connection/inference tests, model/provider deletion, editing unsupported advanced definitions/auth, automatic default selection, composer/session/runtime redesign, other settings categories, and earlier session-shell changes.

## Risks and deferred work

- Local definition/credential persistence cannot certify remote account entitlement. The existing catalog stays authoritative for model selection.
- Definition and credential writes are intentionally separate; partial completion is a normal recoverable state, not a multi-file transaction.
- Without browser QA, layout/focus behavior is reviewed through existing component contracts and code. No new visual system is introduced.

## Planning artifacts and review status

`design.md` defines screens, contracts and state ownership. `implement.md` defines ordered steps and code-only verification. `research/configuration-flow.md` records code-backed constraints and source anchors. `implement.jsonl` and `check.jsonl` curate the same relevant specs/research for the upcoming agents.

Requirements have converged with no unresolved product question. The user approved the final planning summary with “开始实现” on 2026-10-26; task status is in_progress. Browser testing remains forbidden.
