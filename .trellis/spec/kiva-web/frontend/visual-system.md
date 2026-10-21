# Workspace Visual System

## Scope and ownership

The Kiva workbench follows the Codex desktop workspace visual direction while retaining Kiva branding. `web/app/globals.css` owns the palette, layout and component presentation. Reuse the existing shadcn-style Button, Badge and Radix ScrollArea primitives. Presentation changes must preserve runtime commands and project/session API calls.

## Palette contract

Use semantic CSS variables instead of light-only or dark-only colors. Light is the default; `prefers-color-scheme: dark` overrides the same variables. Tailwind semantic colors are registered through `@theme inline`.

```css
/* Good: responds to both color schemes. */
.workspace-item { color: var(--foreground); background: var(--subtle); }
/* Avoid: white overlays disappear on a light canvas. */
.workspace-item { background: #ffffff08; }
```

Neutral surfaces use `--background`, `--sidebar`, `--card` and `--subtle`. Interaction states use `--hover`, `--selected`, `--strong-border` and `--ring`. Use `--success`, `--danger` and `--warning` only for semantic status. Syntax highlighting in `message-content.tsx` uses `--code-*` variables, including inline Prism token styles.

## Typography contract

- Load `GeistSans` and `GeistMono` from the pinned `geist` package in `app/layout.tsx`; attach both `.variable` classes to `<html lang="zh-CN">`. The package uses bundled WOFF2 assets through `next/font/local`, so builds and browsers must not fetch Google Fonts or another font CDN.
- `--font-ui` starts with `--font-geist-sans`; `--font-code` starts with `--font-geist-mono`. Body, controls and ordinary labels inherit the UI token. Code fences, inline code, tool names/results, diffs/previews and directory/path inputs use the code token. Tailwind's `--font-sans` / `--font-mono` map to the same tokens. Do not reintroduce per-component system font stacks.
- `--font-cjk` keeps system Chinese fallbacks (`PingFang SC`, `Microsoft YaHei`, installed Noto Sans CJK SC/Noto Sans SC). A bundled Chinese font has not been selected yet; recommending Noto Sans SC does not authorize adding its full font payload or a remote stylesheet.
- `server/typography.test.ts` checks local font assets/root variables and managed family declarations. Browser checks must inspect actual rendered font faces (not only computed CSS), first-party font responses, mixed Chinese/Latin text, code/path surfaces and narrow layouts with remote font services unavailable.

## Layout and state contract

- Desktop: 252px sidebar, flexible conversation, optional 292px right panel. The right panel starts closed and is reserved for future capabilities.
- At 1180px and below: 232px sidebar; an open right panel overlays the conversation instead of squeezing it.
- At 720px and below: sidebar becomes a navigation drawer opened through the header. It must remain usable for project selection and session/file navigation.
- A conversation with no messages uses a centered heading/project picker and composer; a populated conversation uses the scrolling timeline and bottom composer.
- `MessageViewport` selects a plain div for the empty conversation and Radix ScrollArea for the timeline. Radix's internal viewport wrapper otherwise prevents percentage-height empty content from aligning with the composer.
- Menus, project picker and mobile navigation close with Escape. Icon-only controls need accessible labels.
- The conversation header has no title, runtime badge, session menu or project/branch subtitle in any view. It is an absolutely positioned, transparent 56px overlay within `.conversation`, not a reserved grid row. Apply `pointer-events: none` to the header and `pointer-events: auto` only to its buttons so underlying messages/tools receive clicks, selection and wheel input. Keep the right-panel toggle at the right; on mobile a small labelled navigation icon at the left replaces the removed title hit target. Preserve initial content clearance through timeline/browser padding, not a fixed blank header row. Session creation stays in the sidebar/shortcut and compaction in the composer. Browser-check actual tool-summary clicks and wheel scrolling beneath the overlay, both panel/navigation controls, and title absence in sessions/files/changes.

## Sidebar project controls

- `.project-toggle` (project name) and `.project-collapse` only toggle `projectExpanded`, expose `aria-expanded`/`aria-controls`, and hide `#project-sessions`. They never open a picker, switch projects or request directories.
- Each project row owns its icon-only `.project-new-session` plus immediately before search. The order is project name → new session → search → collapse; do not restore a global `.sidebar-new-session` row. Give creation an accessible name/title identifying its project, disable its button while running/disconnected, and use that active project's existing `new_session` runtime command. Creation expands the project, clears search/menu state, returns to active sessions and closes the mobile drawer. Cmd/Ctrl+N uses the same project-scoped action. The heading's “添加项目” plus remains a separate directory-picker action.
- Keep `.project-search` immediately left of `.project-collapse` as sibling buttons, not nested buttons. Search opens the sessions view, expands the group and focuses its input, including after reopening a hidden group. Closing search clears its filter.
- Active session rows appear directly beneath the project; do not render a redundant “最近会话” heading or the sidebar “运行上下文” entry. Composer model and context controls remain available.
- Only the plus beside “项目” opens the local-project picker from the sidebar, using `openProjectPicker()` and the real directory API. Keep the README entry-point instructions synchronized.
- Explicitly override flex display when hiding the group: `.project-sessions[hidden] { display: none; }`. Otherwise author CSS can leave the collapsed sessions visible.
- Regression coverage in `web/server/workbench-interactions.test.ts` must verify collapse without picker/directory requests, create-before-search-before-arrow ordering, real `new_session` command dispatch, creation from collapsed/filtered/file/archived views, running/disconnected button states, search from a collapsed group, actual row filtering/reset, and absence of removed global/sidebar labels. Browser checks additionally cover project-local session creation, focus, visible collapse and mobile layout.

## Composer runtime controls and reserved right panel

- Model and thinking selectors live inside `.composer-settings`, within the message form, and use the existing `set_model` / `set_thinking` commands. Derive values and options from `RuntimeSnapshot`; disable them while running, disconnected or without options. Never route model/thinking selection through the right panel.
- Align the settings group to the right in DOM/visual order context usage → model → thinking strength. Do not let the model selector grow to fill the gap between settings; keep the three controls grouped even for short model names. On mobile the context popover anchors to the full settings row, not its leftmost trigger, to remain inside the viewport.
- `.composer-context-trigger` shows `snapshot.context.percent`; unknown values render “—”, not a fabricated zero. Clamp only the visual ring/progress bar to 0–100. Its popover shows current tokens/window and cumulative tokens/cost from the same snapshot.
- Context details close on Escape, outside pointer events or workspace/session changes. The compact action preserves the existing confirmation and `compact` command; disable it while running, disconnected or without context.
- On mobile `.composer-settings` occupies a separate toolbar row inside the same composer. Keep attachment, queue, stop and send controls accessible without horizontal overflow; do not move the controls outside the form just to fit them.
- `#workspace-panel.inspector` is an empty aside, with only an accessible label. The header “切换右侧栏” button controls its visibility; Escape also closes it. Do not restore the former runtime-context title, settings, project summary, capabilities, footer or a placeholder demo.
- Test placement and dispatch through the actual `useRuntime` hook, including snapshot updates, unknown values, running/disconnected states, confirmation cancellation and an empty toggled panel. Browser-check context popover bounds at 320px/390px, light/dark palettes, draft/attachment preservation and independent model/thinking access while the right panel is closed.

## Markdown and code blocks

ReactMarkdown's `pre` renderer wraps the highlighted code component in a div because the highlighter already renders its own pre. Do not introduce nested `pre` elements. Language-less fences receive block styling through `.markdown-pre > code`.

## Message timestamps and compact tool rows

### 1. Scope / trigger

The message timeline carries an additive optional timestamp across the Pi history/event → runtime projection → browser boundary. It uses “KivA” for center-workspace branding. Sidebar relative session times and persisted Pi JSONL remain unchanged.

### 2. Signatures

- `RuntimeMessage.timestamp?: number` in `web/shared/runtime-types.ts` is included in runtime state/snapshot messages when known.
- `normalizeMessages(values: unknown[]): RuntimeMessage[]` preserves message timestamps in history snapshots.
- `normalizeMessageTimestamp(value: unknown): number | undefined` and `formatMessageTime(value: number | undefined): string` in `web/shared/message-time.ts` own validation and local display formatting.
- `useRuntime` reads the same field from live Pi `message_start`, `message_update` and `message_end` payloads. Existing command payloads do not change.

### 3. Contracts

- Pi message timestamps are epoch milliseconds, not the ISO timestamp on the containing JSONL entry. Accept finite numbers within JavaScript Date range, including zero; omit unknown/invalid timestamps in history projection.
- Render semantic `<time datetime="...Z">` with browser-local `YYYY-MM-DD HH:mm:ss` text. For example, `2006-01-02T07:04:05Z` displays `2006-01-02 15:04:05` in Asia/Shanghai. Missing/invalid times display “时间未知”, never page-load time or “刚刚”.
- A delta/end event without a timestamp preserves the message's known time. Tool execution updates its existing assistant owner instead of adding a duplicate timestamp-less assistant row. Optimistic user-message creation may record its send time, replaced by the authoritative Pi user event.
- Tool-only messages render no “正在使用工具…” placeholder or empty Markdown spacer. An empty thinking placeholder is only valid while actually streaming with no tools.
- Collapsed tool summaries are one 32px row (34px including card border): icon, ellipsized name, one running/done/error status icon and disclosure. Status text is not visible; `.tool-status` has an accessible image role/name and hover title, with its SVG hidden from assistive technology. Keep native details expansion and input/output/copy controls. `.tool-summary` needs `width: 0; min-width: 0; flex: 1` so a long name cannot inflate Radix's intrinsic table wrapper on mobile.
- Restart the custom `pnpm web` server to load backend history-projection changes; Next client hot reload alone does not update `RuntimeHub`.

### 4. Validation / error matrix

| Source / state | Expected behavior |
| --- | --- |
| Valid numeric milliseconds, including 0 | Preserve and format the original instant |
| Missing/null/string/nonfinite/out-of-Date-range timestamp | Unknown; no generated historical time or render exception |
| Streaming delta/end with no timestamp | Retain the known message time |
| Tool starts after assistant message end | Reuse the assistant row/time; do not add another header |
| Long tool name at 320px/390px | Ellipsis; status/disclosure visible; collapsed card stays one line |
| Completed tool-only/empty message | No synthetic activity/thinking paragraph |

### 5. Good / base / bad cases

- Good: history and live events display original message instants, with stable times throughout tool execution; refreshing preserves history times.
- Base: old snapshots without the optional field remain renderable and show unknown time.
- Bad: all history appears created at page load, live tools add a timeless duplicate header, or a long tool name pushes the whole conversation beyond the mobile viewport.

### 6. Required tests

`message-time.test.ts` covers validation, local UTC/Shanghai formatting and history/tool-result projection. `message-content.test.ts` covers placeholder removal, single-line structure, all statuses and retained details/copy controls. `workbench-interactions.test.ts` exercises normalized history and live start/update/end/tool events through the actual runtime hook. Browser checks measure card height/bounds, expand/collapse/copy, semantic time values, unknown times, refresh and light/dark desktop/mobile rendering without a paid request.

### 7. Wrong vs correct

Do not render history with `new Date()` / `Date.now()` or use a “just now” label. Format the normalized `message.timestamp` and leave absence explicit. Do not rely on `min-width: 0` alone for the single-line flex summary inside Radix's intrinsic wrapper:

```css
/* Correct: the name cannot determine the intrinsic conversation width. */
.tool-summary { width: 0; min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
```

## Verification

Run `pnpm typecheck`, `pnpm test` and `pnpm web:build`. Browser checks must cover light/dark desktop and narrow viewports, real directory listing, file preview, Git diff, session creation, composer/attachments and model controls. Check that the browser emits no hydration, nesting or resource errors and that document width does not exceed the viewport. Check populated conversations with representative Markdown and tool results without calling a paid model for layout fixtures.

## Upgrade contract: legacy Pi Web Service Worker

### Scope / trigger

Users who previously ran agegr/pi-web on the same origin may retain its cache-first `/sw.js?v=...` worker. A fresh browser test cannot verify this upgrade path. Deleting server `.next` cannot clear browser Cache Storage.

### Signatures

- `GET /sw.js` (including version queries) returns the retirement worker from `web/app/sw.js/route.ts`.
- `legacyCacheRecoveryScript` and `legacyCacheRetirementWorker` are exported by `web/lib/legacy-cache-recovery.ts`.
- RootLayout emits recovery directly into network HTML head, never only inside `/_next/static/*`.

### Contracts

- Retirement response: HTTP 200, JavaScript MIME, `Cache-Control: no-store, max-age=0`, `Service-Worker-Allowed: /`.
- Retirement lifecycle: skip waiting, delete only `pi-web-*` Cache Storage, claim clients, unregister. No fetch handler and no forced navigation of other open tabs.
- HTML recovery: unregister only same-origin workers with pathname `/sw.js`; clear `pi-web-*` caches, including orphaned caches recreated by in-flight retired requests. Reload a legacy-controlled document once; subsequent uncontrolled documents never reload automatically.
- Preserve unrelated worker registrations/caches, cookies, localStorage, sessionStorage and server project/session/auth state.

### Validation / error matrix

| Condition | Expected behavior |
| --- | --- |
| No Service Worker API | Normal loading; no error |
| No legacy worker and no legacy cache | Normal loading; no reload |
| Other worker or other cache | Preserve it |
| Legacy controller or registration | Retire it and clear its caches |
| Orphaned `pi-web-*` cache after unregister | Delete cache without reload |
| Browser storage APIs reject | Recovery failure does not stop normal app loading |

### Cases

- Good: existing legacy profile reloads into the current palette and stays current on subsequent reloads.
- Base: a clean profile loads once without a recovery navigation.
- Bad: network HTML is current but cached old Next chunks continue restoring the old theme; returning 404 for `/sw.js` leaves the worker alive.

### Tests required

`web/server/legacy-cache-recovery.test.ts` executes the actual bootstrap/worker scripts in VM environments. Browser verification installs the old package's real worker, seeds stale CSS and exercises both explicit script updates and HTML recovery while retaining unrelated storage.

### Wrong vs correct

Do not put the entire cleanup inside a React effect in a Next chunk: that chunk may itself be served stale. Keep recovery in the network HTML and keep the historical worker URL available as a fetch-free retirement script.
