# Design

Use the Codex desktop workspace as the visual reference: neutral canvas, subtly differentiated sidebar, compact thread rows, monochrome actions and a centered composer. Preserve the Kiva name.

Keep existing runtime hooks, API calls and state owners. Replace globals.css with semantic design tokens shared by light/default and prefers-color-scheme:dark. Update Button/Badge variants to reference the tokens. Reshape only workbench presentation, including collapsed-by-default inspector, mobile navigation, thread list and empty-state composer placement. Render syntax highlighting with CSS variable colors so code responds to the same palette.

Expected files: globals.css, kiva-workbench.tsx, ui/button.tsx, ui/badge.tsx and message-content.tsx. Add a small Kiva icon.svg so Next serves the application icon without browser resource errors. Update interaction assertions only where visible structure/default state changes. Browser checks exercise actual DOM clicks and network responses against the local server. Capture the new visual conventions in the frontend spec.

Rollback is limited to this presentation change; preserve prior uncommitted project/session work.

## Geist typography

Add the pinned `geist` package and import its Geist Sans/Mono `next/font/local` instances in RootLayout, exposing both font variables on the root element. CSS owns a shared CJK fallback stack plus UI/code tokens; Tailwind's sans/mono variables map to those same tokens. Replace every explicit body/code/path family with its appropriate token rather than flattening technical content into proportional text. This avoids build-time Google Fonts requests and runtime third-party font traffic. Chinese font bundling remains a separate choice; recommend Noto Sans SC while preserving system fallbacks for now. Verify bundled WOFF2 headers, root variables, declaration consistency and actual browser-rendered fonts/network responses on desktop/mobile without paid prompts or runtime mutations.

## Project-scoped session creation

Replace the global new-session row with a labelled icon-only plus in the active project row, before search and collapse. Reuse the current project's `new_session` command and existing project-local session storage, without adding API fields or changing runtime ownership. The shared creation handler expands the project, returns to its active sessions, clears search/menu state and closes mobile navigation; Cmd/Ctrl+N calls the same handler. Disable the project button while running/disconnected. Give the project row a third 24px action column and remove obsolete global-button styles/imports. Regression/browser checks distinguish this action from the heading's directory-picker plus and verify command dispatch, filtering reset, collapsed/alternate views, mobile layout and actual project-local runtime/session paths.

## Composer runtime controls and reserved right panel

Keep model/thinking commands and context snapshot ownership unchanged. Move their controls into a compact group inside the composer toolbar; on narrow screens that group occupies its own toolbar row so attachment/queue/send actions retain space. Use the existing native model select and thinking levels, with a small context-percentage trigger opening token/cost details and the existing confirmed compaction action. The context popover closes with Escape or an outside pointer event and never opens the right panel.

The conditional right-panel aside becomes an empty accessible shell. Its header toggle is renamed for the right panel; no runtime-context heading, close control, sections, placeholder cards or footer remain inside it. Model/thinking/context controls remain available while the panel is closed. Remove CSS used only by the deleted panel content, retaining shell layout and the context styles reused inside the composer. Regression tests cover control placement, runtime dispatch/snapshot updates, disabled states, missing context and empty-panel toggling. Browser checks cover desktop light/dark and narrow viewports without invoking a paid model.

## Transparent conversation header

Remove the header title and its now-unused selected-session projection. Position the 56px header absolutely within the conversation, with a transparent background and `pointer-events: none`; only its button hit targets opt back into pointer input. Remove the reserved header grid row so messages scroll beneath it, while preserving initial timeline/browser clearance through content padding. The right-panel toggle stays on the right; mobile uses a small navigation icon instead of the removed title hit target. Keep session/runtime state, file previews and command payloads unchanged. Verify real clicks on a tool summary positioned beneath the overlay, wheel scrolling through it, panel controls, mobile navigation and title absence across workspace views.

## Message timestamps and compact tool rows

Carry Pi's numeric epoch-millisecond message timestamp into optional `RuntimeMessage.timestamp` through history normalization and live start/update/end events. A shared `message-time.ts` owns validation and fixed-width local formatting; missing/invalid source times stay unknown rather than falling back to page load or render time. Keep original timestamps when deltas or tool results have none. Tool-start events attach to their preceding assistant owner instead of creating a second timestamp-less assistant row. This is an additive projection only, with no persistence/command changes; the running custom server needs restarting for the history projection update.

Update center branding to “KivA”, render semantic time elements, omit tool-only Markdown placeholders, and reduce the tool summary to one 32px-high row with icon/name/status/disclosure. Keep expandable arguments/results/copy controls unchanged. Test timestamp validation/local formatting, normalized history, live lifecycle stability, tool status/disclosure rendering and browser row heights at desktop/mobile widths without paid calls.

## Legacy browser migration

The old agegr/pi-web `/sw.js?v=...` worker caches `/_next/static/*` cache-first. Development asset URLs are reused, so a previously installed worker can keep old Kiva styles/components even while network HTML is current. Returning 404 for the old worker URL does not remove that registration.

Serve a fetch-free retirement worker at `/sw.js` with `Cache-Control: no-store` and root scope. It clears only `pi-web-*` Cache Storage, claims clients and unregisters itself. Include a small recovery script directly in the network HTML head, outside Next chunks, to unregister same-origin `/sw.js` workers and reload a controlled document once. Sweep orphaned legacy caches on the next document as old in-flight requests can recreate them. Preserve localStorage, sessionStorage, cookies and all project/session data.
