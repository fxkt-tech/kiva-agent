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

## Layout and state contract

- Desktop: 252px sidebar, flexible conversation, optional 292px inspector. Inspector starts closed.
- At 1180px and below: 232px sidebar; an open inspector overlays the conversation instead of squeezing it.
- At 720px and below: sidebar becomes a navigation drawer opened through the header. It must remain usable for project selection and session/file navigation.
- A conversation with no messages uses a centered heading/project picker and composer; a populated conversation uses the scrolling timeline and bottom composer.
- `MessageViewport` selects a plain div for the empty conversation and Radix ScrollArea for the timeline. Radix's internal viewport wrapper otherwise prevents percentage-height empty content from aligning with the composer.
- Menus, project picker and mobile navigation close with Escape. Icon-only controls need accessible labels.

## Markdown and code blocks

ReactMarkdown's `pre` renderer wraps the highlighted code component in a div because the highlighter already renders its own pre. Do not introduce nested `pre` elements. Language-less fences receive block styling through `.markdown-pre > code`.

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
