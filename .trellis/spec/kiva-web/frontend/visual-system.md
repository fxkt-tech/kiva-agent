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

## Application feedback contract

Use `components/ui/alert.tsx` for application errors, warnings and explanatory notices, including sidebar resources, composer/model failures, runtime failures, file previews, picker/deletion feedback and route boundaries. A contextual title and severity icon accompany the message; do not introduce bare red error paragraphs, browser `alert()` calls or independent feedback styles.

```tsx
<Alert variant="error" title="模型列表加载失败">
  <p>{modelsError}</p>
  <div className="alert-actions"><Button onClick={refresh}>重新加载</Button></div>
</Alert>
```

- Signature: `Alert({ title: string, variant?: "info" | "success" | "warning" | "error", children?: ReactNode, className?: string, onDismiss?(): void })`. Default variant is `info`. `className` controls placement only; shared `.alert` rules own the visual language.
- Errors/warnings use `role="alert"`; information/success use `role="status"`. Decorative icons have `aria-hidden`; dismiss controls have a contextual accessible name. Alerts do not move focus or expire automatically. Keep backend details escaped as text beneath a human-readable title.
- Use semantic palette tokens for borders, tint and icons in both themes. Long messages/paths wrap within the viewport, including the 320px layout. Reuse existing fonts and geometry.
- Dismiss only transient action feedback. Persistent resource failures remain visible until a successful retry or resource change. Do not present one failed send twice when the runtime and composer carry the same error.
- Alerts do not replace rich deletion confirmation, compaction consent, rename input or scoped extension requests. Preserve exact target/outcomes, checked cleanup defaults, dirty/busy blocking, retries and command scope.
- Use `Toast({ message: string, onDismiss(): void })` from `components/ui/toast.tsx` for non-blocking success acknowledgement, following [Geist Toast](https://vercel.com/geist/toast). Model saves show only “模型设置已保存”, never an inline success Alert or a second explanatory sentence. The neutral, bordered surface floats at the viewport's bottom-right without shifting the composer, uses semantic theme tokens, and fits 320px screens. Announce politely without moving focus; dismiss after 4 seconds, pause the remaining time while hovered or keyboard-focused, and provide a labelled close button. A new confirmed save remounts the Toast to restart its lifetime; unrelated rerenders must not restart it. Keep actionable/persistent failures in Alerts, not timed Toasts.
- Required tests: `server/alert.test.ts` covers severity/announcement priority, icon/title/message, escaping, optional labelled dismissal and route boundaries. `server/workbench-interactions.test.ts` covers model/file/resource failures, dismissible action feedback, picker retry and dirty-cleanup blocking. Browser-check light/dark at desktop/390px/320px, no overflow or native alerts, retry/dismiss and retained drafts without paid model requests.
- `server/toast.test.ts` covers announcement/labelled close, expiry across parent rerenders, overlapping hover/focus pause, a new save's lifetime and timer cleanup. Browser-check fixed positioning, unchanged composer bounds, manual/automatic dismissal and both themes at desktop/390px/320px.

Good: one titled error Alert retaining the server detail and an explicit recovery action. Bad: a raw error paragraph, an auto-disappearing failure or a generic success message hiding partial deletion.

## Layout and state contract

- Desktop: 252px sidebar, flexible conversation, optional 292px right panel. The right panel starts closed and is reserved for future capabilities.
- At 1180px and below: 232px sidebar; an open right panel overlays the conversation instead of squeezing it.
- At 720px and below: sidebar becomes a navigation drawer opened through the session header or the standalone navigation icon on other routes. It must remain usable for project selection and session/file navigation.
- A conversation with no messages uses a centered heading/project picker and composer; a populated conversation uses the scrolling timeline and bottom composer.
- `MessageViewport` selects a plain div for the empty conversation and Radix ScrollArea for the timeline. Radix's internal viewport wrapper otherwise prevents percentage-height empty content from aligning with the composer.
- Menus, project picker and mobile navigation close with Escape. Icon-only controls need accessible labels.
- Render `.conversation-header` only on `route.section === "sessions"`; it has no title, runtime badge, session menu or project/branch subtitle. It is an absolutely positioned, transparent 56px overlay within `.conversation`, not a reserved grid row. Apply `pointer-events: none` to the header and `pointer-events: auto` only to its buttons so underlying messages/tools receive clicks, selection and wheel input. Keep the right-panel toggle at the right and the mobile navigation icon at the left. Files/changes/collections/projects do not inherit this header or its blank top clearance; their standalone `.workspace-navigation-toggle` is mobile-only and fits the local first row without creating another header. Leaving sessions immediately hides and resets the inspector. Session creation stays in the sidebar/shortcut and compaction in the composer. Browser-check tool-summary clicks/wheel beneath the session overlay, both navigation paths, and actual header absence on non-session routes.

## Sidebar project controls

- `.project-toggle` (project name) remains a keyboard-accessible disclosure button with `aria-expanded`/`aria-controls`; clicking the name or non-action row whitespace toggles the session group. Do not render a separate collapse icon. Row disclosure never opens a picker, switches projects or requests directories. Child creation/menu actions must not bubble into disclosure, and buttons must not be nested.
- Each project row owns controls in order project name → new session → project menu, with the three-dot menu at the far right; do not restore a global `.sidebar-new-session` row or a standalone search button. Give creation an accessible name/title identifying its project. Creation uses the explicit project-scoped session POST and navigates only after a confirmed returned identity. Disable for that project's pending creation/removal or unsupported Git capability; another running session must not disable it. Creation expands the project, clears search/menu state, returns to active sessions and closes the mobile drawer. Cmd/Ctrl+N uses the same project-scoped action. The heading's “添加项目” plus remains a separate directory-picker action.
- `.project-more` opens a scoped menu containing search and “移除”; support keyboard item navigation and Escape/focus restoration. Confirm removal with `RemoveProjectDialog` outside the mobile sidebar: show exact project name/path and explicitly distinguish hiding from deleting files/history/workspaces/configuration or stopping tasks. Focus cancel, trap Tab, restore focus, support Escape/backdrop cancellation except during the pending request, and retain failures in an Alert with retry. Replace the list only from a confirmed response. Navigate to a visible project or `/projects` only if the removed project is still selected when the response arrives; preserve unrelated routes and drafts. Exclude overlapping creation/removal and ignore late creation navigation into a hidden project. Reimport uses the existing real folder picker and restores the same project identity.
- Menu search closes the menu, opens the sessions view, expands the group and focuses its input, including after reopening a hidden group or searching another project. Toggling search closed clears its filter; retain the scoped query behavior.
- Active session rows appear directly beneath the project; do not render a redundant “最近会话” heading or the sidebar “运行上下文” entry. Composer model and context controls remain available.
- Sidebar attribution reads `Powered By Pi {version}` using the selected project's bootstrap Pi version, with `1.3.0` as the cold fallback; keep the separate local-workspace/connection status unchanged.
- Only the plus beside “项目” opens the local-project picker from the sidebar, using `openProjectPicker()` and the real directory API. Keep the README entry-point instructions synchronized.
- Explicitly override flex display when hiding the group: `.project-sessions[hidden] { display: none; }`. Otherwise author CSS can leave the collapsed sessions visible.
- Regression coverage must exercise the routed shell and actual scoped runtime hook: name/whitespace collapse without picker/directory requests, the three-control ordering and absence of separate search/collapse controls, action/menu click isolation, menu keyboard navigation, project-scoped creation POST/confirmed-ID navigation, creation from collapsed/filtered/file/archived views while another session runs, pending/capability button states, menu search from a collapsed group, actual row filtering/reset, and absence of removed global/sidebar labels. Session selection navigates to its resource URL rather than sending `switch_session`. Cover project removal cancellation/retry/pending races, last-project fallback and same-ID reimport with retained drafts/history. Browser checks additionally cover project-local session creation, focus, visible collapse and mobile layout.

## Session JSONL viewer

- Every session menu, including archive/trash and legacy history, offers “查看 JSONL”. It reads the exact scoped `/jsonl` endpoint without navigation, commands or Pi acquisition. Key modal/resource state by project/session and reject mismatched responses; late reads must never populate another session's dialog.
- `SessionJsonlDialog` portals to `document.body` so a transformed mobile sidebar cannot constrain the fixed backdrop. Default to the “渲染视图” tab; “原始文本” preserves returned text exactly. Use a neutral Geist surface, semantic code colors, explicit loading/empty/error/retry/truncation states, labelled close, trapped focus, Escape/backdrop close and trigger focus restoration. Tabs support arrow/Home/End keys and hidden panels use `display: none`.
- The rendered view shows a paged parent-linked record timeline and expandable JSON fields, not only a pretty-printed text block. Preserve unknown types, primitives, malformed line diagnostics and exact line numbers; flag duplicate IDs, missing parents and cycles. Bound record pages to 200, child fields to 50/page, expanded rows to 300 and depth to 16. Explicitly mark clipped strings/keys/depth and retain complete returned text in the raw tab.
- Desktop uses a timeline/inspector split; mobile stacks them. `.jsonl-records` is a flex column with `overflow: hidden`; its `.jsonl-record-list` child owns `flex: 1; min-height: 0; overflow: auto` so pagination stays visible and page changes reset the actual scrolling element. Inspector and raw text scroll independently inside the modal, never widening the document.
- Required tests: `jsonl-structure.test.ts`, `jsonl-dialog.test.ts` and routed workbench coverage for exact raw text, unknown/malformed records, bounded trees/pages, identity races, retry, tabs and focus. Browser-check both themes at desktop/390px/320px, mobile portal bounds, pagination scroll reset and zero command writes while viewing.

## Composer runtime controls and reserved right panel

- The textarea starts at one visual line and grows with content/wrapping up to five lines, then scrolls internally. Derive bounds from its actual line height plus vertical padding, not fixed 82px/240px limits. Clearing/shortening a draft, restoring a scoped draft or narrowing/widening the viewport must resize it correctly. Keep native textarea/IME/Shift+Enter behavior and no document overflow; browser-measure empty, 1/3/5/6+ lines, long wrapped text and shrinking on desktop/mobile.
- For an existing session, the far-left item below the input (`.composer-note`) is `.composer-connection-status`, followed by the existing local/branch information. Show a small semantic dot plus text, not a badge, Alert or Toast: “连接中” / “已连接” / “重连中” / “已断开”. Expose the current session backend connection with a labelled polite live status; the dot is decorative and color is never the only cue. Keep the status visible at 320px/390px with long branches truncated and the keyboard hint unchanged. No session on the entry page means no connection indicator, not a fabricated green state.
- The indicator reads `useRuntime.connectionStatus` (`"connecting" | "connected" | "reconnecting" | "disconnected"`) from the exact scoped WebSocket lifecycle. Initial open attempt is connecting; open is connected; retryable close stays reconnecting during the existing 1.5-second retry wait/attempt; terminal policy close 1008 is disconnected without retry. Preserve the `connected` boolean for existing send/settings guards. Never derive this state from agent execution status, model/command errors or the sidebar registry request, and never start Pi or add polling to display it. Stale/disposed socket callbacks cannot update a newer attempt/scope; navigation/unmount clears retries. This is backend transport connectivity, not proof that the model provider is available.
- Regression coverage must distinguish initial/retry/terminal/scope-reset states, retained drafts, unchanged disconnected send guards, connected-but-model-error and zero commands while observing. Browser-check real passive connection plus controlled connection transitions, far-left placement and light/dark desktop/390px/320px without paid prompts.
- Enter sends and Shift+Enter inserts a native newline; the hint reads “Enter 发送 · Shift+Enter 换行”. Preserve native IME confirmation through composition start/end tracking, `nativeEvent.isComposing` and the Safari `keyCode === 229` guard. Ignore repeated Enter keydown submissions. A sending Enter prevents the native newline and calls `form.requestSubmit(submitter)` only for the actual enabled submit button, so empty/pending/saving/disconnected/unsupported states cannot be bypassed by the keyboard. Keep the same scoped submit/queue flow and cover the shortcut, IME/repeat guards and disabled states in `workbench-interactions.test.ts`; browser-check actual Shift+Enter text and native form submission without paid prompts.
- `features/sessions/model-settings.tsx` owns one combined model/thinking picker inside `.composer-settings`. Its candidate remains local until “保存并应用”; cancel/Escape/outside click do not mutate runtime or defaults. Save posts the complete pair once to `/api/projects/:projectId/models`, optionally with `sessionId`. Entry saves never create a session/runtime. Read the catalog's Pi-supported per-model `thinkingLevels`; switching to a non-reasoning model uses only `off`. Do not invent `xhigh`/`max` support from `reasoning: true`.
- Persisted installation defaults populate entry controls; existing sessions prefer their snapshot/persisted pair. New empty sessions pin creation-time defaults in metadata. First entry send captures the confirmed pair and sends `set_configuration` to the confirmed new session before `prompt`. Existing-session saves apply the pair to that exact session before saving defaults; other existing sessions are untouched. Disable changes while running, disconnected (existing session), pending or without catalog options, and disable sending during save.
- Do not repeat a global-default explanatory paragraph in the picker or success feedback (including “所有项目的新会话将使用此默认设置。”). Removing that copy does not remove installation-wide persistence; retain the concise save Toast and any actual model-capability/error message.
- The combined picker follows [Geist Select](https://vercel.com/geist/select), [Typography](https://vercel.com/geist/typography) and [Materials](https://vercel.com/geist/materials): a 32px inline, non-wrapping toolbar trigger, 12px in-input button text, ellipsized model label, separate muted thinking value and same-line chevron; a 12px-radius floating menu surface with labelled native selects, 14px field text, 6px control corners and an explicit save action. Retain semantic theme tokens/local Geist fonts and avoid extra status badges or an unstyled in-flow panel.
- Align the settings group to the right in DOM/visual order context usage → combined model/thinking picker. Do not let the picker grow to fill the gap. On mobile both popovers anchor to the full settings row to remain inside the viewport.
- Render the entire context control only when `snapshot.context.percent` (used percentage) is finite and greater than zero; unknown/zero values consume no toolbar space. Its external contents are only a circle and rounded integer `n%` (`Math.round(100 - clampedUsed)`), without visible “剩余” or comparison signs. Keep the accessible name “上下文剩余量” and descriptive hover title. The ring represents remaining capacity, clamped to 0–100 so over-capacity estimates show 0%, never a negative value. The popover remains usage-oriented: original used percentage (including its existing fractional formatting and values above 100), current tokens/window and cumulative tokens/cost from the same snapshot. Clamp visual rings/progress bars to 0–100.
- Context details close on Escape, outside pointer events, workspace/session changes or usage disappearing; they must not reopen when usage returns. The compact action preserves the existing confirmation and `compact` command; disable it while running, disconnected or without context.
- Do not render a “命令” toolbar button. Slash commands remain available by typing `/` in the textarea or using Cmd/Ctrl+K; selecting one edits the scoped draft without sending it. Keep attachment and running queue controls.
- On mobile `.composer-settings` occupies a separate toolbar row inside the same composer. Keep attachment, queue, stop and send controls accessible without horizontal overflow; do not move the controls outside the form just to fit them.
- `#workspace-panel.inspector` is an empty aside on session routes only, with only an accessible label. The session header “切换右侧栏” button controls its visibility; Escape and leaving sessions close it. Do not restore the former runtime-context title, settings, project summary, capabilities, footer or a placeholder demo.
- Test placement and scoped dispatch through the actual runtime hook, including snapshot updates, unknown values, running/disconnected states, cancellation, failed-save retry and an empty toggled panel. Browser-check both popover bounds at 320px/390px, light/dark palettes, drafts/attachments, save/refresh/cross-project defaults and independent existing sessions. Inspect the actual running origin, not only a production fixture: confirm served CSS contains the new selectors, the trigger/chevron share one line, the panel is positioned rather than in normal flow, and the catalog includes thinking levels. A successful build or new client JS alone does not prove the running custom server has loaded the matching CSS/backend; reload it safely when versions differ, without interrupting active tasks.

## File and change explorer trees

- `features/files/workspace-tree.tsx` owns `WorkspaceTree` and `buildWorkspaceTree(entries)` for both file and change lists. `WorkspaceTreeEntry = { path: string; status?: string }`; the browser supplies existing scoped file/status resources and keeps preview selection in the encoded `?path=` URL. No extra execution, filesystem mutation or tree-specific API is introduced.
- Construct hierarchy using raw slash-delimited paths and `Map`, never trimming, decoding, splitting rename arrows or interpreting property names/pathspec syntax. Retain full raw paths for identity, accessible labels, tooltips and selection; render basenames with directory-first, case-insensitive deterministic ordering and an exact-name tie-breaker. A deleted file and replacement directory with the same path remain distinct nodes.
- Directory disclosure never selects a file or requests a preview. Deep-link and changed Back/Forward selections reveal all ancestors. Manual collapse/all-collapse remains respected until selection changes; project/session/kind changes remount disclosure state. Empty lists show an explicit empty state; non-Git changes and read failures retain shared Alerts.
- Use a nested `tree` / `treeitem` / `group` structure, folder `aria-expanded`, file `aria-selected`, one roving tab stop, labelled collapse-all and keyboard Up/Down/Left/Right, Home/End, Enter/Space and typeahead. Focus alone never dispatches file selection. Stop handled key propagation so ancestors do not also act on a child event.
- Explorer-local root caption identifies original project versus session worktree and exposes actual root/branch in its title. There is no full-width browser heading above both panes. Desktop is a compact 30px-row tree left of the existing preview; mobile stacks tree above preview and leaves room in its local toolbar for the standalone navigation icon. Indent guides, folder/file icons, ellipsis and selected fill use the existing Geist palette/fonts. `.workspace-tree { width: 0; min-width: 100%; }` prevents long basenames from determining Radix's intrinsic table-wrapper width; `min-width: 0` on labels alone is insufficient. Browser-measure full row/status bounds after narrowing the viewport, not just document overflow (the scroll viewport can hide the inflated tree).
- Both views retain accessible Git state letters/icons with semantic color, including added/modified/deleted/renamed/copied/conflict/untracked. Color alone must not convey status. Keep exact preview URLs, resource error handling and scoped “交给 KivA” drafts unchanged.
- `server/workspace-tree.test.ts` covers raw-name hierarchy/sorting, file-directory collisions/statuses, disclosures/selection/Back-Forward reveal, keyboard/focus, both scoped browser kinds, no disclosure writes, deep-link previews/drafts and empty/non-Git/error states. `server/workbench-interactions.test.ts` verifies actual routed navigation/header scope and percent-only context rendering. Browser-check real filesystem previews/diffs, long-name/status bounds, directory-only clicks, Back/Forward, refresh, mobile navigation and light/dark desktop/390px/320px without paid prompts.

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
