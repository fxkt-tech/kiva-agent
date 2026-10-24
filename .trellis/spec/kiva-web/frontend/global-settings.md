# Global Web settings

## 1. Scope / trigger

Use this contract when changing the sidebar settings dialog, browser preferences/shortcuts, installation model/provider configuration or runtime configuration reload. The user explicitly approved these separate scopes: browser-local presentation and keys; installation-wide model defaults/providers; exact-session composer controls. Do not merge them into one global settings object or active-session singleton.

## 2. Signatures and ownership

- `shared/web-preferences.ts` owns `WebPreferences`, defaults and field-wise decoding. The only browser key is `kiva:web-preferences:v1`; preferences contain appearance, conversation presentation/default queue/workspace mode and portable shortcut bindings, never drafts, credentials or server config.
- `lib/web-preferences.ts` owns `createWebPreferencesStore`, the singleton `webPreferences` and `useWebPreferences()`. Stable immutable snapshots include `preferences` and `persistenceError`. `lib/shortcuts.ts` owns `createShortcutRegistry`, the singleton registry, key normalization/formatting and native send-mode matching.
- `lib/theme-bootstrap.ts` exports `themeBootstrapScript`; `app/layout.tsx` loads it before paint alongside legacy cache recovery. Explicit light/dark sets root `data-theme`; system removes it. Independent `appearance.visualStyle` is flat by default; normalized neumorphic/Swiss sets its own root `data-visual-style` value, and flat removes it. Shared `VISUAL_STYLES` admission drives decoder/root application and the bootstrap literal. The store uses one `applyAppearance` lifecycle for both dimensions. Root-only hydration suppression is justified for these expected attribute changes, never the interactive subtree. Follow [Appearance and Theme System](./theme-system.md) for the complete contract.
- `features/settings/dialog.tsx` owns five category views, dirty-dismiss/pending decisions and action-specific feedback; shared Base UI Dialog owns portals, nested dismissal and focus trapping. `models-panel.tsx` owns default/provider/key candidates; `api.ts` decodes safe responses and maps failures to fixed messages.
- `shared/installation-settings.ts` owns `InstallationSettings`, revision-bearing `InstallationModelCatalog`, `ProviderDefinition`, safe credential metadata, strict mutation validators and response decoders. Server file/Pi types never cross this boundary.
- `InstallationSettingsService` is one installation save coordinator, shared by settings endpoints and existing project-scoped composer saves. `ProviderConfiguration` owns safe projection and narrow definition/credential writes; `settings-files.ts` owns bounded safe file snapshots, duplicate-key parsing and opaque revisions.

| Route | Contract |
| --- | --- |
| `GET /api/settings` | Safe provider/editability/auth-source metadata, opaque edit revisions, versions and passive backend check |
| `GET /api/settings/models` | `InstallationModelCatalog = ModelCatalog & { revision: string }`, no project required |
| `POST /api/settings/defaults` | `{provider,modelId,thinkingLevel,revision}` → confirmed catalog; defaults only, no session apply |
| `POST /api/settings/providers` | `{revision,definition:{id,api,baseUrl,models}}` → `ProviderSaveResult` |
| `POST /api/settings/providers/:id/credential` | `{revision,apiKey}` → `ProviderSaveResult`; separate from definition save |

`ProviderSaveResult = {settings, catalog?, warning?}` distinguishes local persistence from a failed model-view refresh. Do not return a raw Pi credential or synchronization error. Existing `/api/projects/:projectId/models` retains its complete pair plus optional scoped session apply and shares persistence coordination.

## 3. Contracts

### Dialog and preferences

Footer is one fixed compact row containing only a full-width settings button with left-aligned icon/text, including the no-project route. Do not render Pi attribution/version text or restore the old local-workspace/registry-status label. Portal the dialog to body outside the transformed mobile sidebar. Desktop uses a category rail/content pane; mobile has constrained near-full-screen bounds and compact accessible categories. Preserve Geist, semantic colors, single thin focus, compact project rows and the headerless/no-right-panel layout. Keep `next.config.ts`'s `devIndicators: false`: the default bottom-left badge intercepts footer clicks, and moving it top-right can instead cover mobile modal close. This disables only the badge, not build/runtime error reporting; do not hide the error portal with CSS.

Trap/restore focus, support category keyboard navigation and Escape/backdrop, confirm dirty explicit form discard in-app, and block dismissal during pending writes. Use shared Dialog initial/finalFocus and Select/Combobox portals; do not retain a second feature focus trap. Base UI owns tab order, including native `summary` and closed `details` behavior. Closing mobile settings restores the standalone navigation control when the footer is in a closed drawer; do not mistake an exit-animation frame for a visible trigger. Opening settings never navigates, discards a draft, acquires Pi or interrupts work. Render settings success Toasts inside DialogContent so modal inerting does not hide or disable them; their local absolute placement keeps them within dialog bounds.

The no-project route has no `projectId`: require a real error before comparing its scope with the route. `error?.projectId === route.projectId` alone is true when both are absent and incorrectly renders an empty creation-error Alert.

Browser presentation defaults are system theme, flat visual style, 14px conversation text, non-wrapping code, collapsed thinking/tools, `steer`, and Enter send/Shift+Enter newline. The new-session workspace default is `current-branch`; Settings → Conversation can choose `worktree` instead. Font options are 14/16/18px. Explicit theme overrides OS; only system follows OS changes. Visual style is independently selectable as flat/neumorphic/Swiss (labels “扁平化” / “新拟态” / “瑞士风格”) and must preserve mode, layout and live session state. Auto-save non-secret preferences and synchronize same-origin tabs; reset a single group. Initialize the preference subscription in the persistent shell on every route, including `/projects`, rather than waiting for a composer or settings dialog to mount: otherwise that tab misses appearance storage events. Invalid fields fall back individually, and denied storage keeps an explicit in-memory-only warning without clearing unrelated storage. Keep v1 storage compatibility: absent visual style means flat and initialization performs no migration write.

Settings → Appearance includes “左侧栏图标模式”, backed by `appearance.sidebarCollapsed: boolean` (default false). The header toggle and settings Switch update this same browser-local field across projects and same-origin tabs. Resetting appearance restores expanded mode. Old/invalid/missing fields decode to false without a migration write; storage denial retains the in-memory choice and existing warning. Mobile drawers ignore the desktop presentation choice while preserving it for return to desktop. Apply its root attribute before paint as well as during runtime; never remount the conversation or acquire runtime ownership to change navigation layout.

The workspace default is captured by a new creation/continuation operation, never applied to existing sessions; changing it cannot change an in-flight retry. It is browser-local like the other conversation defaults. See [Default session workspace mode](./workspace-routing.md#default-session-workspace-mode) for API, compatibility and history-only deletion contracts.

Disclosure defaults initialize a mounted item, not every streaming render. Queue preference initializes a composer, not queued work or an active user override. Code wrapping must not alter exact raw JSONL. Native new-model editor disclosure also initializes once: deriving `open` from whether its editable ID is empty collapses the field after the first keystroke.

### Shortcuts

Portable bindings use `Mod` (Command on macOS, Ctrl elsewhere), optional Alt/Shift and one normalized key. Default actions are new session Mod+N, commands Mod+K, settings Mod+comma and unbound focus-composer. Send modes are Enter or Mod+Enter with corresponding native newline behavior and matching hints.

One registry owns action dispatch and modal/recording priority; remove competing hardcoded window listeners. Enforce availability, conflict/protected-key validation, ignored repeats and IME/Dead-key guards. Shift punctuation and macOS Option may change `event.key`; normalize using the physical-key fallback where appropriate without interpreting IME input as commands. Never dispatch an action while recording it. System/browser capture is not guaranteed; preserve manual controls.

### Models and credentials

The settings default form saves the complete Pi-supported model/effort pair for new sessions only; keep the composer's existing exact-session-plus-default behavior. Reuse SettingsManager flush/error handling and model-specific effort precedence. One confirmed installation catalog serves settings/composer even when no project is selected; late reads cannot overwrite confirmed saves.

Supported definition APIs are `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`. IDs remain stable; add/update only. The explicit new-provider form rejects an existing provider ID before POST; the shared upsert endpoint must not turn an apparent creation into a silent edit. Allowlisted model fields are ID, optional name/context window/output limit/reasoning/text-or-image input. Pi determines supported thinking levels. Preserve absent models, unknown fields, costs, overrides and unrelated providers. Advanced per-model routing/headers/commands and unsupported auth remain read-only, never flattened into a simple form.

Keep definitions in installation `.kiva/agent/models.json`, keys in existing `auth.json`, defaults in `settings.json`. Explicit definition and key actions have separate confirmed outcomes, avoiding a false multi-file transaction. Blank key means unchanged; no saved key/suffix is returned or stored in browser storage. Clear typed keys on save/cancel/unmount. The API-key editor must not replace OAuth or command-backed auth or auto-migrate inline keys/environment references. API-key persistence uses the public offline `ModelRuntime.login(...,"api_key",...)` single-secret path, not transient `setRuntimeApiKey` or internal deep imports. Explicit OpenAI subscription authorization has its own [OpenAI authorization contract](./openai-authorization.md), with confirmed replacement/local sign-out, staging and guarded persistence; it does not relax the generic editor.

Reads are bounded no-follow snapshots, validate file/directory identity and duplicate JSON keys, and expose opaque edit tokens rather than credential hashes. Definition writes preflight before creating directories, then lock/re-read/validate/atomically replace privately. Detect observed external edits and preserve malformed files. Arbitrary editors may ignore locks; do not claim a transaction across them. Pi credential initialization may create an absent private auth file: do not reject a first valid save as a conflict caused by this intentional empty initialization, but reject real external changes.

Explicit reload after a revision conflict must let the user reapply the retained candidate against a newly confirmed baseline/revision; automatic refresh must not silently rebase dirty forms. A reload button that permanently retains the old revision makes retry impossible.

### Runtime and feedback

Provider mutation uses RuntimeManager admission to exclude new owner/start/model acceptance between idle validation and persistence. Busy/pending/current-or-transitioning affected providers are rejected before writes, including hidden projects. Abort/steer/follow-up/UI responses for unrelated existing owners bypass file-save waits. Never call manager.stop or hold a model-run promise under admission.

Successful provider/key writes mark owner catalogs stale. On the next explicit action, only a safely idle stale owner is released/reacquired with its exact identity; passive reads/subscriptions do not restart it. Mark catalogs across providers stale because an existing owner may later select a newly added provider. Defaults-only saves never refresh owners or rewrite existing controls.

Use concise Toasts for confirmed explicit actions and persistent actionable Alerts for errors/warnings. No per-toggle success spam. A local save is not a connection test; opening settings, reading catalogs/status, or saving ordinary settings must not refresh OAuth, execute configured auth commands, fetch remote models or send a paid prompt. Only the dedicated, explicitly initiated OpenAI login action performs OAuth network work, outside the global settings/admission locks. Diagnostics use a fixed allowlist of versions/preferences/passive check outcome, excluding secrets, endpoints, absolute paths, environment values, raw errors and user contents.

## 4. Validation and error matrix

| Condition | Required outcome |
| --- | --- |
| Invalid/unknown/oversized fields, IDs or URL userinfo/query/fragment | 400; no configuration mutation |
| Disallowed origin or non-JSON mutation | Reject without weakening existing origin policy |
| Stale edit token / observed substitution / cooperating writer lock | 409 conflict/locked; retain candidate and offer explicit reload |
| Malformed/duplicate-key/symlink/nonregular config | Disable unsafe edit, preserve contents; fixed non-secret message |
| OAuth/command-backed/advanced/unrepresentable edit | Read-only status or rejection, no implicit conversion |
| Active affected provider or pending transition/queue/retry/compaction/UI | 409 `provider_busy`; no interruption or writes |
| Credential persisted but view synchronization failed | Truthful persisted-state warning/reload; never raw Credential/error cause |
| Browser storage or clipboard denied | Actionable warning/failure; no false persisted/copied success |
| Empty project registry | Settings/catalog remain reachable without registering a project |

## 5. Good / base / bad cases

- Good: change theme immediately, save a new-session default, add a compatible provider then its key, and retain existing session/draft/active task state.
- Base: absent preferences preserve established presentation defaults and select current branch for new sessions; missing configuration allows explicit first setup with no writes on GET.
- Bad: masked-key round trips, default changes rewriting existing sessions, stale retry loops, switching theme overwriting Pi TUI settings, or a provider save stopping a running owner.

## 6. Required tests

Foundation tests execute actual store/dispatcher/prepaint code with missing/invalid/denied storage, cross-tab updates, immutable snapshots, partial document mocks, OS/platform keys and modal priority. Dialog/routed tests cover categories, focus, pending/dirty close, no-project footer, both send modes/IME/repeat/disabled guards, disclosures and explicit conflict recovery without losing candidates.

Server tests use temporary installations/fake keys and no paid prompts: no GET writes/network/commands/Pi starts; secret sentinels never in responses/errors/diagnostics; public first-key persistence, private creation, unknown/advanced/OAuth preservation, stale/duplicate/symlink/substitution/locked conflicts, admission races/abort delivery, cross-provider stale idle refresh and retained exact identities. Run typecheck/tests/build/diff checks. Browser acceptance covers light/dark/system, desktop/390px/320px, refresh/cross-tab persistence, actual shortcuts/modal focus, model/provider/key save and existing-session independence, all in isolated fixtures for mutations.

## 7. Wrong vs correct

Wrong: `settings GET -> ModelRuntime with writable auth -> resolve secrets -> spread raw config to UI`; two unrelated file writes followed by generic success; global provider edit after an unlocked idle scan.

Correct: safe offline snapshots → allowlisted metadata/opaque revision → local form candidate → explicit action-specific revision-checked save under runtime admission → confirmed safe response/Toast or truthful retryable warning. Keep browser preferences in their own allowlisted store and exact-session control application in its existing scoped operation.
