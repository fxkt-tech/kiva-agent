# Model settings workflow design

## Outcome and boundaries

Replace the current stacked Models category with one action-oriented feature. The landing surface answers what is usable and what the new-session default is. Definition/credential forms appear only inside explicit Add Model or Manage Providers views. Keep the Settings dialog and its existing category navigation.

No backend, transport, credential format, discovery, or session-control changes are planned. Existing public settings decoders and APIs remain authoritative. Research in `research/configuration-flow.md` supplies source anchors and preservation constraints.

## Screen structure

### Models home

- Use exactly the same `settings-section-heading` h3 + explanation composition as Appearance/Conversation. The home is a continuous sequence of ordinary SettingRows; custom Back/heading navigation appears only in inner views. Provider management gets its own normal settings row. The available-model summary gets a normal settings row with Add Model (primary) and Refresh in the existing right-side settings-shortcut-actions composition. No bespoke home header actions, secondary h3 blocks, or styled per-row settings-section wrappers.
- Add a compact flat “ChatGPT / Codex 订阅” account row with its current status and an explicit connect/manage action. It opens a dedicated subscription authorization subview directly, reusing the same persistent OpenAIAuthorization owner as OpenAI provider detail. Navigation makes no auth request; only the existing explicit login action starts one. The subview omits the generic API-key/connection editor. Surface unsupported capability reasons instead of silently hiding this route. New subscription login remains the existing supported `openai` authorization; do not confuse it with legacy `openai-codex` metadata.
- One compact default-settings row shows the confirmed provider/model and effort, with an explicit Change action. Change reveals the reused complete model/effort editor; only Save persists. Cancel restores the confirmed baseline. Keep the candidate owner alive while changing inner views/categories.
- List the complete available installation catalog directly after its summary in ordinary SettingRows: exact model ID as primary text, provider as secondary text, restrained default indication. No table, provider cards, additional inner scroll surface, new fonts, or standalone visual vocabulary.
- Use the existing Input control for model/provider search when the catalog exceeds five items. Empty/error/loading states carry a direct Add Model, Reload, or Manage Providers recovery action as appropriate.
- A fresh catalog is authoritative for availability; credential presence is not a remote-service health result. Model IDs remain keyed with provider identity.

### Add Model

Use an inner view within the existing Models panel, not a nested modal. A Back action returns to Models home through the candidate guard.

1. **Choose provider.** Choose an editable existing custom provider or New Provider. Explain that built-in model definitions are managed by Pi and link to Manage Providers to enable their credentials/ChatGPT authorization. Do not let an unsupported provider appear editable.
2. **Describe model and connection.** Existing provider: show a read-only connection summary and collect one new model ID, optional display name, and optional advanced capabilities in the existing disclosure composition. New provider: also collect provider ID, supported API type, and endpoint. An empty provider cannot be saved: one valid first model must be present before the definition POST. Validate duplicate provider IDs and duplicate model IDs within the selected provider before requesting a save.
3. **Save and configure authentication.** “保存模型” performs only the definition save. On confirmed success, update shared metadata/catalog and retain the confirmed provider identity; never remain in create mode for a persisted provider. If authentication is needed, continue to a clearly labelled authentication step with its own explicit Save API Key action, using the returned credential revision. Existing supported environment/configuration/OAuth authentication may require no key edit. A user may leave a saved definition unconfigured, with truthful “已保存，待配置认证” state and a route to its provider details. The available catalog determines whether a model appears on home. Credential failure retries only the key save; it must not re-create the provider or duplicate the model.

Back before a successful save is a local edit action; leaving a dirty add flow requires existing discard confirmation. Post-save Back is not rollback. A capability/read-only change on metadata refresh blocks unsafe save while retaining the user's candidate for recovery.

### Manage Providers

- A Back action returns home. List all metadata providers as flat existing settings rows, including configured providers with zero available models. Show provider name/ID and truthful credential status; open one provider's detail explicitly.
- Provider detail owns connection definition/model management, API-key controls, and optional ChatGPT authorization for that same provider. Remove the unconditional standalone OpenAI authorization block from home.
- Built-in definition immutability must not disable supported credential/login actions. Apply `editable`, `credential.editable`, and `authorization` capabilities independently. Protected advanced fields retain their read-only reason.
- “新增提供方” routes into the same Add Model flow with New Provider selected, since the API requires its first model. “添加模型” within provider details routes into the same flow with that editable provider selected. There is one creation path, not two divergent editors.

## State and component ownership

Extract a ModelsSettings coordinator under `features/settings/` with an explicit inner-view union: home, choose-provider, model-form, authentication, providers, provider-detail, subscription-authorization. Keep view identities separate from confirmed provider/model IDs. Do not encode candidates/credentials in URLs or browser storage.

The coordinator owns view changes and shared creation/editor state; SettingsDialog continues to own confirmed metadata reads, the confirmed shared catalog callback, category selection, notices, and aggregate form dirty/pending state. Refactor existing DefaultsEditor, ProvidersEditor, and OpenAIAuthorization rather than copying their persistence logic. Existing components may stay mounted in hidden surfaces only when their side effects and overlays remain properly owned by the coordinator; hidden inactive dialogs/popovers must not remain active or receive focus. Keep one authorization owner and one pending-form registration for each form.

- Preserve active OAuth polling, cancellation, operation ID, callback input semantics, and pending dismissal guard across Models subviews and outer categories. Leaving the overall Settings dialog continues to follow existing cancellation/dirty behavior.
- An inner Back that would discard a candidate uses ConfirmDialog. A pending mutation blocks leaving its owning form; OAuth Cancel remains reachable and category changes retain the attempt. Never clear dirty registration without either retaining or explicitly discarding that candidate.
- During a pending authorization, every Models inner view exposes a persistent progress/return-to-authorization entry backed by the same owner; the returned detail retains its Cancel action. Outer category navigation may retain the attempt, but it cannot clear the global pending close guard.
- Consolidate one passive metadata/catalog error per resource; do not repeat identical failure alerts in every retained hidden form.
- Only confirmed saves rebase the relevant candidate and metadata revision. Explicit reload after conflict permits reapplying the retained candidate to the refreshed revision; automatic reload cannot silently clear dirty edits.
- On successful definition save, advance state using returned metadata even if catalog synchronization reports a warning. Preserve saved identity and offer passive reload. Never claim failure of persistence or synthesize a catalog/default.
- Clear typed API keys on successful save, explicit cancel/discard, or owning form disposal. Never render a saved key/suffix. No unrelated provider change clears another live candidate accidentally.

## Persistence and reuse contracts

Use `settingsApi.catalog/read/defaults/provider/credential` and existing authorization methods with exact validated inputs. Append a new model to the selected provider's complete safe projected definition; preserve all existing projected model entries. The backend remains responsible for merging unknown fields/costs/overrides from its source snapshot. Do not rebuild a provider from only available catalog entries: uncredentialed configured models are missing from that catalog.

Definition and credential writes remain separate confirmed actions. API errors retain safe actionable messages, candidate values, and revision recovery. Use existing Alert and Toast components. Default saves remain independent and never rewrite active session controls or auto-select the newly added model.

## Visual contract

Reuse the current flat settings surface: existing Geist fonts and semantic theme tokens, h3 section headings, 13px primary settings row text, 12px muted secondary copy, 17px vertical row padding, 1px dividers, shared 32px controls/compact buttons, and existing responsive form-grid rules. Own a single outer settings scroll surface. Reuse Button, Input, Select/Combobox, SettingRow, ModelConfigurationFields, ConfirmDialog, Alert, and Toast. Use the same plain home composition as the other categories; do not add a last-row-border suppression rule to mask extra section wrappers. Add only layout CSS necessary for inner-view back navigation; no new card system or shadows.

## Compatibility, scope, and rollback

Existing APIs, public metadata, supported APIs, advanced/read-only capabilities, default semantics, and OpenAI authorization service stay intact. Rework tests around the new user paths instead of deleting their original error/race assertions. The current uncommitted settings-list changes are superseded by this task. Earlier session-shell/first-send edits, workspace-routing spec/test edits, web/next-env.d.ts, and standalone HTML files remain outside this task and must be preserved.

Rollback is a frontend-only reversal of the new coordinator/flows while retaining persisted user configuration; there is no data migration to reverse. Do not use stash/reset or restore unrelated working-tree changes.

## Verification and limitation

Respect the user's explicit ban on browser testing: no CUA, Playwright, screenshots, account login, or live provider calls. Use business-level React tests through existing UI mocks, transport/service regression tests, typecheck, production build, diff checks, and code review against the concrete shared visual primitives. These checks verify state/data behavior and style reuse; do not claim visual browser validation.
