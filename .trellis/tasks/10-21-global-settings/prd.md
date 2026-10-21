# Global settings dialog and model configuration

## Goal

Provide one global settings dialog, opened from the sidebar footer, so users can configure the Web UI and connect models without leaving the application or editing configuration files manually.

## Background and approval

- On 2026-10-21 the user requested a proposal first and accepted five groups: Appearance, Shortcuts, Models, Conversation, and About.
- The user explicitly approved first-release provider/API URL/API key/custom-model management, excluding OAuth login, and subsequently approved task creation and planning.
- The final planning summary was presented and the user explicitly approved implementation (“开始实现”) on 2026-10-21.
- Current behavior/source anchors are in `research/current-behavior.md`; architecture and execution belong in `design.md` and `implement.md`.

## Requirements

### R1 — Entry, layout and accessibility

- Add a fixed footer row: gear icon and “设置” left, existing small `Powered By Pi {version}` right. Remain reachable on every route, including `/projects` with no visible projects.
- Open a modal without navigation: category navigation plus content pane on desktop, near-full-screen with compact categories on mobile. Match existing Geist fonts, semantic colors, thin borders and single thin keyboard focus; preserve compact project rows and headerless/no-right-panel conversation.
- Support labelled controls, keyboard categories, focus trap/restoration, Escape and backdrop closing. Dirty model/provider forms require in-app discard confirmation; pending mutations cannot be dismissed into an ambiguous outcome.
- Opening/closing must not lose drafts/attachments, change URL/project/session, start Pi or interrupt work.

### R2 — Browser-local appearance and conversation preferences

- Appearance: system/light/dark, conversation font size 14/16/18px, and code wrapping; defaults are system, 14px and current non-wrapping behavior.
- Conversation: thinking/tool details default expanded or collapsed (both initially collapsed), and running-message default `steer`/`follow_up` (initially `steer`).
- Auto-save in this browser, shared across projects and same-origin tabs; survive refresh without modifying terminal settings. Theme previews immediately and tracks OS changes only in system mode.
- Disclosure defaults initialize new/remounted items, never overwrite manual toggles during streaming. Queue preference initializes composers, never rewrites queued messages or an existing per-composer choice.
- Invalid local fields fall back individually. Storage failure retains in-memory choices with an explicit not-persisted warning. Never clear unrelated storage or persist drafts/secrets.
- Reset only the current preference group; no destructive reset-all. No success Toast for every appearance toggle.

### R3 — Configurable Web shortcuts

- Send modes: Enter (default; Shift+Enter newline) or Mod+Enter (Enter newline; native Shift+Enter retained). Display Mod as Command on macOS and Ctrl elsewhere.
- Record/clear/reset one combination for new session, open commands, focus composer and settings. Defaults: existing Mod+N and Mod+K, new Mod+comma for settings, focus composer unbound.
- Detect app conflicts, reject known protected browser/OS combinations and explain capture limitations. No multi-stroke chords or Pi TUI keybinding changes.
- One dispatcher owns matching/availability; modal and shortcut-recording inputs take priority. Unavailable actions never create sessions/start Pi. Command selection still only edits a draft.
- Escape remains non-configurable. Preserve IME/229 and repeat guards, native multiline input, actual disabled submit checks and hints matching the saved binding.

### R4 — Installation default model and thinking

- Explicitly save the complete pair with Pi-supported levels; non-reasoning models offer only supported `off`.
- Settings changes new-session defaults only; existing sessions retain their own pair. Keep the composer's combined picker and existing current-session-plus-default save/apply behavior.
- Reuse Pi persistence, not browser-only/duplicate defaults. Show concise Toast only after confirmed persistence; retain failed candidates for retry.
- Refresh catalogs after provider/default saves without late reads overwriting confirmations. Work without any selected/visible project.

### R5 — Provider, credential and custom-model management

- List built-in/configured providers and non-secret authentication/source metadata. Support compatible definitions and standard single-key auth; mark OAuth-only, ambient-cloud, extension-only or advanced forms read-only wherever the simple editor cannot safely represent them.
- Add/edit stable provider ID (immutable after creation), API type, base URL, model IDs and optional name/context window/output limit/text-or-image/reasoning metadata. APIs: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`; Pi derives actual thinking choices.
- Save provider definition and API key with separate labelled actions and separately confirmed outcomes. A definition without auth must not imply readiness. Blank key means unchanged, not erase; never show stored key/suffix. Clear typed secrets on successful save/cancel/unmount. Never silently replace OAuth, command-backed or unsupported auth.
- Persist through existing installation models/auth configuration; preserve unknown fields, advanced overrides and unrelated providers. Do not migrate/rewrite existing inline keys, environment references or executable values. Malformed files block writes without being overwritten.
- Validate before side effects: reject stale revisions, unsafe filesystem substitutions, invalid/duplicate identities, unsupported protocol/API, secret-bearing URL userinfo/query/fragment and unsupported advanced edits. Do not accept executable configuration or arbitrary headers from this UI.
- Block edits while an affected owner has active/pending/queued/retrying/compacting work or extension input; never stop it. After confirmed save, release only safely idle affected owners so the next explicit action loads new config; preserve histories, controls, worktrees, branches and subscriptions.
- Opening/saving never automatically tests connections, refreshes OAuth/catalogs or sends paid prompts. Local save is not proof of remote availability.

### R6 — About and diagnostics

- Show app/Pi versions and an explicit passive backend-check result, distinct from model availability and the session WebSocket indicator.
- Copy a fixed allowlist: versions, UI preferences and non-secret check outcome. Exclude credentials, endpoint query/userinfo, environment values, project/session contents, absolute paths and raw configuration/errors.
- Report clipboard failures accurately. No background polling just for About.

### R7 — Feedback, safety and compatibility

- Existing concise Toasts acknowledge explicit confirmed saves/copy; actionable Alerts retain failures. No inline success banners or repeated explanatory success text.
- Browser preferences and server files have distinct save state; never claim overall success for partial persistence.
- Preserve origin checks, loopback binding, no-store responses, scoped identities/capacity/passive reads, attachments, queues and commands.
- Test mutations only in temporary installations with fake keys; never alter actual user settings/history/project visibility for QA.

## Acceptance Criteria

| ID | Observable result | Requirements |
| --- | --- | --- |
| A1 | Footer/dialog works on every route and desktop/mobile, traps/restores focus, and preserves URL/drafts/attachments/work. | R1 |
| A2 | Appearance/conversation defaults survive refresh, cross-project navigation and same-origin tabs; invalid/blocked storage fails safely. | R2 |
| A3 | Both send modes/remapped actions work with conflicts, reserved keys, modal priority, disabled states, IME/repeat guards and accurate hints. | R3 |
| A4 | Pi persists a default pair over restart; other projects' new sessions inherit it, existing sessions do not; composer save/apply remains compatible. | R4 |
| A5 | Compatible definitions and keys save/reload with truthful separate statuses; custom models become selectable without Pi/model-service requests. | R5 |
| A6 | Stale/corrupt/unsafe/unsupported writes preserve files; busy affected providers are rejected without interruption; idle owners reload at next action. | R5, R7 |
| A7 | No response/browser storage/feedback/log/diagnostic contains secrets; OAuth/advanced/unrelated data is preserved. | R5–R7 |
| A8 | Explicit success uses concise Toasts; failures retain retryable candidates; cancel clears typed secrets; reads cause no writes/network/Pi starts. | R1, R4–R7 |
| A9 | Typecheck/tests/build/diff checks and desktop/390px/320px theme/keyboard/browser regressions pass without overflow/hydration errors. | R1–R7 |

## Out of Scope

- OAuth login/logout, provider/model/credential deletion, full raw config editing, custom headers/commands, environment editing and advanced compatibility routing.
- Automatic connection tests, paid verification, remote catalog refresh, plugins, compaction/retry/proxy/tool permissions, worktree paths and runtime capacity controls.
- Account/cross-device synchronization, custom palettes, TUI keybindings, multi-stroke chords and draft persistence.
- Changing one-to-five-line composer sizing or restoring the removed session header/right panel.

## Risks and deferred items

- Multi-field/ambient/advanced authentication stays read-only rather than being flattened into one password field.
- Local save does not verify provider authentication or model compatibility; explicit connection testing is deferred.
- External editors may ignore locks: reject observed revision changes, but do not promise transactions across unrelated writers or models/auth files.
- OS/browser capture, storage and clipboard permissions vary; retain manual controls and expose limitations.

## Artifact status

The seeded PRD was rewritten into this final structure and checked for repeated facts, source-anchor loss and acceptance coverage. Research, design, execution and context manifests passed final review; implementation is authorized by the subsequent explicit user approval.
