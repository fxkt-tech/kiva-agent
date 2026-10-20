# Design

Use the Codex desktop workspace as the visual reference: neutral canvas, subtly differentiated sidebar, compact thread rows, monochrome actions and a centered composer. Preserve the Kiva name.

Keep existing runtime hooks, API calls and state owners. Replace globals.css with semantic design tokens shared by light/default and prefers-color-scheme:dark. Update Button/Badge variants to reference the tokens. Reshape only workbench presentation, including collapsed-by-default inspector, mobile navigation, thread list and empty-state composer placement. Render syntax highlighting with CSS variable colors so code responds to the same palette.

Expected files: globals.css, kiva-workbench.tsx, ui/button.tsx, ui/badge.tsx and message-content.tsx. Add a small Kiva icon.svg so Next serves the application icon without browser resource errors. Update interaction assertions only where visible structure/default state changes. Browser checks exercise actual DOM clicks and network responses against the local server. Capture the new visual conventions in the frontend spec.

Rollback is limited to this presentation change; preserve prior uncommitted project/session work.

## Legacy browser migration

The old agegr/pi-web `/sw.js?v=...` worker caches `/_next/static/*` cache-first. Development asset URLs are reused, so a previously installed worker can keep old Kiva styles/components even while network HTML is current. Returning 404 for the old worker URL does not remove that registration.

Serve a fetch-free retirement worker at `/sw.js` with `Cache-Control: no-store` and root scope. It clears only `pi-web-*` Cache Storage, claims clients and unregisters itself. Include a small recovery script directly in the network HTML head, outside Next chunks, to unregister same-origin `/sw.js` workers and reload a controlled document once. Sweep orphaned legacy caches on the next document as old in-flight requests can recreate them. Preserve localStorage, sessionStorage, cookies and all project/session data.
