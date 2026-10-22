# Reference and reusable owners

## Pi 1.3.0, installed source

- `web/node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/template.js`: buildTree, active path/newest leaf, tree display/filter/search, read/bash/edit/write/ls/general tool rendering, source links, session statistics, mobile tree and thought/tool/hidden visibility.
- `template.css`: compact tree/reading pane, separator, 900px mobile tree overlay and message/tool hierarchy.
- `template.html`: default/no-tools/user/labeled/all filters, tree sidebar, resizer and reading main.
- This is reference-only. Do not copy innerHTML/inline event execution, arbitrary Map ID overwrite, unconditional ancestry loops or normalized JSONL download into the owned implementation.
- `exportFromFile` invokes SessionManager.open and can migrate/rewrite old files. Probe confirmed v2 → v3 changes in an isolated copy. The new owned React approach never invokes that path.
- The native page passes isolated iframe rendering light/dark × 1440/390/320. Probe artifacts/screenshots are under `/tmp/kiva-jsonl-research/integration/`; these are evidence, not an implementation dependency.

## Existing project owners

- `features/sessions/session-jsonl-dialog.tsx`: scoped GET, identity validation, stale-scope loader, full-screen shared overlay and exact raw tab.
- `features/sessions/jsonl-structure.ts`: original lines, malformed/primitive records, duplicate/cycle diagnostics and bounded field tree. Its current 200-record page is not sufficient as a full branch index.
- `features/sessions/jsonl-presentation.ts`: bounded previews, shared semantic projection and conservative tool relations.
- `features/sessions/collections.tsx`: current per-SessionRows dialog ownership; consolidate only what deep-link/single-host behavior requires.
- `features/workspace/shell.tsx`, `route.ts`, `resources.ts`: persistent shell, passive resource identity, navigation/query helpers. Copied viewer links must not create/continue/switch a runtime.
- `features/files/workspace-tree.tsx`: local keyboard/roving-focus and labelled-tree conventions; do not couple session IDs to filesystem path logic.
- `components/shared/Markdown.tsx` and shared Base UI primitives: reuse rendering/overlays instead of adding packages or a second Markdown engine.
- Current GET endpoint and backend byte/ownership controls remain unchanged.
