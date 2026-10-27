# Research: Model settings configuration flow

- Query: What can be safely reused for a frontend-only redesign of usable-model discovery, Add Model, provider management, and explicit model/effort defaults?
- Scope: internal repository inspection only; no browser automation, network calls, real credentials, or product edits.
- Date: 2026-10-26

## Findings

### Files found

| File | Responsibility |
| --- | --- |
| `web/features/settings/dialog.tsx` | Settings category shell, metadata lifecycle, form guards, safe confirmed updates, notices |
| `web/features/settings/models-panel.tsx` | Available catalog, defaults state, provider/model/key candidates and current stacked forms |
| `web/features/settings/openai-authorization.tsx` | One persistent OpenAI OAuth owner, polling, generations, explicit auth/replace/logout |
| `web/features/settings/use-installation-models.ts` | Shared installation catalog; confirmed saves invalidate older reads |
| `web/features/settings/api.ts` | Existing decoded read/save/OAuth API boundary |
| `web/features/settings/preferences-panels.tsx` | Flat settings rows and established feature presentation |
| `web/components/shared/ModelConfigurationFields.tsx` | Complete model + supported-effort controlled composition |
| `web/shared/installation-settings.ts` | Safe metadata and strict save contracts |
| `web/server/provider-configuration.ts` | Capability projection, safe definitions, additive model merge, credential persistence |
| `web/server/installation-settings.ts` | Revision checks, runtime admission, independent save confirmation |
| `web/server/settings-dialog.test.ts` | Executable business-state and async/conflict/OAuth tests |
| `web/server/installation-settings.test.ts` | Offline reads, additive writes, unknown-field preservation, protected auth |

### 1. Existing contracts and capabilities

- `ProviderDefinition` requires an exact provider ID, API, base URL, and **1–200 models**. APIs are limited to `openai-completions`, `openai-responses`, `anthropic-messages`, and `google-generative-ai`; model fields are ID and optional name/contextWindow/maxTokens/reasoning/input. Model IDs must be unique per provider, not globally. Provider/model unsafe identity names are rejected. URL must be HTTP(S), trimmed, with no embedded credentials, query, or fragment. Integer limits are positive safe integers no larger than 1,000,000,000. Sources: `web/shared/installation-settings.ts:3`, `:19`, `:22`.
- **No empty-provider persistence** is available: a new-provider sequence must collect its connection details and first model before posting the definition. An intermediate provider-details step can be entirely local. Saving a definition cannot also save a key; `SaveProviderInput` and `SaveCredentialInput` are separate contracts (`web/shared/installation-settings.ts:12`).
- `ProviderSettings.editable`, `credential.editable`, `authorization.canLogin/canLogout`, and `InstallationSettings.canAddProvider` are authoritative capabilities. Do not infer editability merely from a provider's kind or presence in the available-model catalog (`web/shared/installation-settings.ts:7`).
- Built-in definitions are read-only and do not expose a simple `definition`. A configured provider is definition-editable only if it has a safe representable definition and no auth or a simple stored API key. OAuth and advanced/custom auth may make an otherwise representable custom definition read-only. Metadata has independent credential capability, e.g. a built-in provider can allow key configuration while keeping its definition read-only. Sources: `web/server/provider-configuration.ts:50`, `:80`, `:93`, `:102`.
- Safe definitions reject provider headers/authHeader/oauth/modelOverrides/command API keys and per-model routing/headers/compat/thinking/sampling overrides. Unknown innocuous provider/model fields and costs are omitted from the safe UI projection but retained by backend merge. Do not flatten an advanced definition into the simple wizard (`web/server/provider-configuration.ts:50`).
- The explicit new-provider UI rejects IDs already present in metadata; the server endpoint is an upsert, so removing this guard would silently edit/shadow rather than create. Existing guard: `web/features/settings/models-panel.tsx:102`, `:142`, `:173`. Keep it in new-provider flow, including built-in IDs.
- Built-in OpenAI has a special independent authorization capability. It is allowed only for unmodified built-in `openai` with absent/simple key/valid stored OAuth; custom endpoints or unsupported auth disable it (`web/server/provider-configuration.ts:64`). Generic key editing must never replace OAuth.
- Available catalog is the shared passive installation catalog, keyed by `[provider,id]`; it does not prove remote entitlement/connectivity. Catalog decoder preserves only safe model fields and no display name (`web/shared/installation-settings.ts:42`). The list should show exact ID/provider, not invent product names from definition metadata.

### 2. Safe Add Model semantics

- Existing provider: choose a capability-editable provider with a projected definition, clone its safe candidate, append a new model with a non-duplicate ID, and submit through `settingsApi.provider({definition, revision})`. Preserve provider ID/API/base URL and all existing projected models; do not use the available-model list to reconstruct a provider because it excludes unavailable or uncredentialed definitions and lacks full configuration fields.
- The server already supports additive model updates and preserves omitted existing models. `saveDefinition` checks observed models-file revision, provider/auth editability, cooperating locks, file/directory identity, and merge validation. It clones prior models, updates/appends by exact model ID, preserves costs/unknown fields, enforces the merged 200-model cap, and atomically saves without touching other providers (`web/server/provider-configuration.ts:180`, especially `:201`–`:217`). `web/server/installation-settings.test.ts:67` proves a payload containing only a new model keeps old models/unknown costs/auth unchanged. Sending a complete safe candidate is simplest for UI state, while the backend remains the preservation authority.
- New provider: collect ID/API/baseUrl, then first model details, validate the complete definition and duplicate provider ID, save the definition, then offer the independent credential step. On success, transition from local new-provider identity to the confirmed provider ID/revision before offering credentials. Never retry the new-provider creation after a credential failure; it already exists.
- A definition save may leave the new model absent from the usable catalog until credentials are configured. Show the truthful intermediate result (“model/provider configuration saved; authentication needed”) and provide a link to its provider detail. Do not claim Add Model failed just because the available catalog is empty or unavailable.
- Existing configured providers with `credential.configured=true` need no redundant key entry. Unconfigured ones route to the credential stage if editable. OAuth/advanced cases explain their metadata reason and offer the supported provider-management/new-compatible-provider alternative.
- Built-in models are acquired by configuring/authorizing the provider, not by editing its managed model IDs. Keep this reachable via provider management, with an appropriate route from Add Model if built-ins appear in provider selection; do not pretend these definitions can be appended to.
- Existing service operations are sufficient: `settingsApi.read/catalog/defaults/provider/credential` and OAuth methods (`web/features/settings/api.ts:60`–`:70`). Definition/key mutations use runtime admission, while default saves do not rewrite existing session state (`web/server/installation-settings.ts:61`–`:78`). A successful mutation may return `settings` plus `warning` without `catalog`; this is persisted state with refresh required, not a failed save (`web/server/installation-settings.ts:81`). No new backend API or schema is required by the proposed scope.

### 3. State and lifecycle that must survive inner navigation

- The existing Settings dialog mounts all categories and hides inactive ones (`web/features/settings/dialog.tsx:76`–`:80`). It aggregates form IDs to enforce dirty confirmation and pending dismissal, so introducing conditional unmounts without moving ownership will lose unsaved defaults/keys/provider drafts and can leave stale guard entries. Parent state is `forms`, `pending`, `requestClose`, and `onState` (`:29`–`:46`).
- `saved` increments metadata read generation before replacing safe metadata/catalog; old passive reads must not overwrite confirmed writes (`web/features/settings/dialog.tsx:48`–`:58`). The catalog hook uses the same generation pattern (`web/features/settings/use-installation-models.ts:15`–`:30`). Keep both pathways and shared callbacks, rather than adding page-local catalog fetches.
- `DefaultsEditor` owns candidate/baseline/observed revision, pending/busy, and explicit-reload rebase. Dirty candidates are not automatically rebased after unrelated catalog refresh. Keep the owner mounted or extract its controller above view changes (`web/features/settings/models-panel.tsx:36`–`:65`).
- Provider state consists of exact-ID keyed definition candidates/baselines/revisions, key candidates with their own observed credential revision, selected provider, pending mutation kind, errors/warnings, busy flag, and explicit reload flag (`web/features/settings/models-panel.tsx:87`–`:140`). Existing implementation already preserves drafts across provider/category changes and clears typed keys after save/cancel/unmount.
- Provider/key explicit reload updates baseline/revisions while retaining the candidate; normal metadata refresh does not silently accept a changed credential revision (`web/features/settings/models-panel.tsx:105`–`:111`, `:129`–`:134`). Add Model must participate in the same edit session or use a separate stable form ID/controller and cannot independently overwrite an older provider-management candidate.
- OpenAI auth must have **one owner**, mounted for the whole Settings lifetime. It owns attempt, operation ID, generation guards, callback input, busy/pending, confirmations and poll timer (`web/features/settings/openai-authorization.tsx:25`–`:61`). It cancels/abandons on unmount or `pagehide` (`:62`–`:67`); remounting it when switching views would abandon active login and invalidate user progress. Polls reject stale generations and success is confirmed once (`:45`–`:60`, `:68`–`:85`).
- Showing only OpenAI detail while keeping its owner alive can be implemented as a stable hidden wrapper, or by extracting the auth controller and rendering a view. Do not render one OAuth component in the add flow and another in provider management. While auth is pending, cancellation must remain reachable and settings dismissal stays blocked. Inner navigation must either retain a return-to-auth entry/status or keep the auth view visible; hiding all cancellation access is invalid.

### Hidden-view risks and close guards

- Hidden owners **must still report their real dirty/pending state** to `SettingsDialog.onState`. Global close must account for retained drafts and work in every inner view; suppressing reports merely because a view is hidden would permit silent discard or close during a write. Conversely, don't retain stale `forms` records after destroying/resetting an owner: the current `onState` map replaces by stable form ID but has no unregister operation (`web/features/settings/dialog.tsx:41`). Stable controllers avoid this issue; any genuinely transient owner requires explicit cleanup/reporting semantics.
- Keep one provider edit-session owner shared across add/detail views. Two hidden forms both writing `onState("providers", ...)` can race, with a clean hidden form overwriting a dirty/pending active form's report; separate isolated owners need distinct stable IDs, but sharing the controller is the smaller design.
- Hide the **rendered content**, not the state owner. Native `hidden` should remove inactive content from layout/focus/accessibility and have a reliable `[hidden] {display:none}`-equivalent rule when a feature class declares flex/grid; the current category rule explicitly handles `.settings-content [role="tabpanel"][hidden]` in `web/app/globals.css`. Do not assume a new custom flex/grid wrapper's UA hidden rule always wins.
- Portaled ConfirmDialog/Select/Combobox content is outside the hidden ancestor. Hiding a parent does not reliably dismiss a confirmation or popup that is already portaled. Inner navigation should not strand open confirmation popups; retain owner, deliberately close non-pending transient disclosure on navigate (or disable underlying navigation while a confirmation is modal), and let Base UI own final focus. Don't add custom DOM-only focus traps.
- OAuth pending cannot be left solely in an invisible view: keep a visible progress/return-to-authorization entry or pin its detail until completion/cancel. Both cases keep the same auth owner and global pending guard. The parent selected a provider-management auth flow with a clear route from Add Model; no extra built-in editing scope is needed.

### 4. Minimal frontend decomposition

1. Add one `ModelsPanel` feature owner below the existing Models tab. It controls inner view identity (`overview`, `add-model`, `providers`, `provider-detail`) and retains edit/auth state. SettingsDialog continues to own metadata, catalog callbacks, global notices, and global close guards.
2. Overview uses existing flat `SettingRow`, settings headings/actions, shared controls. Show explicit Add Model and Manage Providers actions, available model ID/provider rows, and a separate default/effort setting. Do not stack connection/auth/provider editors below the list.
3. Reuse/extract the current provider editing controller from `ProvidersEditor`; its state should remain stable across the wizard and detail. Extract a model-fields view used for existing-provider add and new-provider first model; don't copy the current model field form into another file. New forms only collect local candidates until explicit Save.
4. Add Model chooses existing editable provider or new provider, presents the selected provider context plus one model's fields, and exposes a clear back/continue/save path. New-provider connection fields precede the model stage without an API write. After definition persistence, use confirmed provider identity for optional key configuration and return navigation.
5. Providers view lists safe metadata (configured source/capability), with a detail view for endpoint/model management and authentication. OpenAI auth view lives here; generic API-key UI continues to obey independent credential editability. Retain model editing for simple custom providers and read-only explanation for advanced/built-in definitions.
6. Preserve `ModelConfigurationFields` and `DefaultsEditor` state semantics for complete model/effort save. Do not auto-select a new model as default after add/login/key save; default remains an explicit action.

Likely affected frontend files: `dialog.tsx`, `models-panel.tsx` (extract rather than expand the monolith), new feature-local view/controller files, `openai-authorization.tsx` view interface if needed, narrow `globals.css` layout rules, `settings-dialog.test.ts`, and possibly `workbench-interactions.test.ts` for no-project/retained-session invariants. Shared/server contracts should remain unchanged.

### 5. Code-only validation

Reuse `server/helpers/mock-ui.tsx` and Node's experimental module mocks. Required meaningful scenarios:

- Overview contains usable models/provider identity and explicit Add Model/Manage Providers; no visible connection/key/OAuth form until opened; empty/error/loading catalog still offers the valid setup path.
- Same model ID under two providers remains distinct in rows/default selection/search.
- Existing editable-provider add preserves endpoint, existing model fields, observed revision, unrelated candidates, and uses exactly one definition POST. Duplicate/blank ID and merged model cap cannot submit.
- New-provider connection step produces zero writes; full definition with first model posts once, then credential uses confirmed provider ID and credential revision. Duplicate existing/built-in provider ID is blocked in the UI.
- Definition success + credential failure/catalog warning remains visible as partially completed saved setup; retry resubmits only the failed credential. No automatic defaults POST or inference/runtime start occurs.
- Built-in/advanced/OAuth definitions cannot be edited; credential/login actions obey separate capability flags and show reasons.
- Switching inner view/category retains provider/model/default candidates, manual model disclosure state, auth attempt and pending guards. Pending saves block duplicate submission and outer close; back/cancel paths respect the intended candidate/discard semantics.
- Explicit revision-conflict reload retains candidate and captures the new revision; passive refresh cannot silently rebase a dirty credential. Older settings/catalog reads cannot overwrite confirmed mutations.
- Only one OAuth owner/polling lifecycle exists across inner view changes; cancellation remains accessible; stale polls/callback responses cannot resurrect cancelled attempts; unmount still abandons pending auth.
- Keep fake-secret sentinel tests for absence from preferences/text/diagnostics and clearing after save/cancel/unmount. No real credential operations.
- Run `pnpm --dir web exec tsx --experimental-test-module-mocks --test server/settings-dialog.test.ts`, relevant existing installation/OAuth/routed suites, `pnpm --dir web typecheck`, `pnpm --dir web build`, and diff checks. Browser/computer automation is explicitly forbidden by this task's user constraint, which overrides existing spec browser-acceptance guidance.

Existing test anchors: dirty/pending guards `web/server/settings-dialog.test.ts:313`, provider-before-key/category retention `:335`, duplicate provider guard `:345`, model disclosure `:360`, conflict recovery `:370`/`:383`, revision pinning `:404`, secret clearing `:421`, advanced auth and warning truthfulness `:440`; offline/preservation/service restrictions in `web/server/installation-settings.test.ts:45`, `:67`, `:96`, `:149`.

## External references / versions

No external sources queried. Local implementation is pinned to Pi 1.3.0 and Base UI 1.8.0 (package manifest and frontend specs). Existing public Pi service seams remain authoritative; no library migration or new integration is needed.

## Related specs

- `.trellis/spec/kiva-web/frontend/global-settings.md`: independent default/provider/key outcomes, safe metadata/revisions, passive reads, guarded runtime invalidation.
- `.trellis/spec/kiva-web/frontend/openai-authorization.md`: one active owner, explicit auth replacement/sign-out, staged persistence, lifecycle and cancellation.
- `.trellis/spec/kiva-web/frontend/component-guidelines.md`: feature-owned state, shared model/effort composition, overlays/focus and code-test mock seam.
- `.trellis/spec/kiva-web/frontend/visual-system.md` and `theme-system.md`: reuse established settings appearance and semantic tokens rather than another list/card visual system.
- `.trellis/spec/guides/code-reuse-thinking-guide.md`: extract existing controller/fields rather than duplicating the provider flow.

## Caveats / Not Found

- The key UX sequencing constraint is the inability to save an empty provider. The PRD's provider-first decision can be satisfied with local staged steps; it does not require a new endpoint.
- A model defined in config is not necessarily in the usable catalog until auth is configured; completion must distinguish these outcomes. Static membership is not a connection test.
- The approved direction is sufficient to proceed to a concrete planning summary. The exact internal navigation labels and whether to show an inline pending-auth return link versus pinning the auth view are presentation choices; either must preserve state and cancellation. If the parent wants the Add Model entry to additionally activate arbitrary built-in providers, make that explicit in the summary: it is credential onboarding, not manual built-in model editing.
- There are already uncommitted edits from earlier turns. This research did not edit them, and an implementer must preserve the unrelated session-shell changes and user-owned files.
