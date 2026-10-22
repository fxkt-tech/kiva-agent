# Project-owned Pi-style session viewer

Status: final scope and separate task creation approved by the user with “开始实现” on 2026-10-22.

## Goal

Replace the current session JSONL presentation with a project-owned implementation based on Pi's session reader. Preserve the Pi-style navigation and reading experience while making layout, behavior and rendering directly editable in this repository.

## User decisions and evidence

- The user first requested research without code changes, then selected the whole Pi viewer, and finally requested our own implementation based on Pi code so future changes remain under their control.
- Pi 1.3.0 ships its reader in `dist/core/export-html/template.{html,css,js}`. Isolated browser probes passed light/dark at 1440/390/320 for native tree navigation, branch selection, search/filter and thinking controls. Local evidence: `/tmp/kiva-jsonl-research/integration/`.
- The current source owns scoped read-only data loading in `session-jsonl-dialog.tsx`, semantic previews in `jsonl-presentation.ts`, bounded source/field projection in `jsonl-structure.ts`, and the timeline in `jsonl-timeline.tsx`. The current mobile layout keeps conversation and JSON inspector side by side.

## Requirements

- R1 Ownership: all production reader logic and styles live in project React/TypeScript/CSS files. Use Pi source as the reference; retain MIT notices for adapted code. Renderer behavior is independent of Pi's private export module and generated HTML.
- R2 Reading and navigation: use a desktop session-tree pane beside a broad reading pane. Reading follows the selected branch; historical branches remain discoverable. Start at the last valid loaded leaf, as Pi does. Selecting a node follows its newest descendant branch and reveals the selected record. Mobile tree navigation opens on demand, leaving the reading pane full width.
- R3 Pi interactions: provide tree search and default/no-tool/user/label/all filters, active branch/target feedback, thinking/tool-output/hidden-message visibility, session summary, readable Markdown, paired tool calls/results and useful input/output previews. Use Chinese interface labels and existing theme/font/material roles.
- R4 Source access: retain raw returned JSONL exactly, original line references, per-record field/source access on demand, message text copy, deep-link copy/open and a clearly named download of the returned JSONL snapshot. Do not keep a mandatory right inspector beside the reading pane.
- R5 Passive compatibility: preserve the scoped GET resource, active/archive/trash access, errors/retry, empty state, UTF-8 fidelity and existing 8 MiB snapshot/truncation boundary. No history rewrite, session continuation, runtime/model acquisition, command dispatch or tool replay is allowed while observing the viewer.
- R6 Integrity and performance: preserve duplicate/missing IDs, malformed/primitive/unknown records and ambiguous relationships as accessible source evidence. Never fabricate branch ancestry, tool completion or missing usage. Bound rendered tree/message/field DOM and previews while indexing the returned snapshot across the former 200-record page boundary.
- R7 Integration: retain the full-screen dialog, native text selection, scoped draft/attachment state, keyboard access, Escape/focus return and existing color modes/three visual styles. Reopened copied links identify the exact project/session/branch/target without storing transcript content in URLs.

- R8 Compact header (user follow-up): merge the title and snapshot/tab toolbars into one compact horizontal band. Session identity and file/size metadata may each use two small text lines within that band. Keep view switching, download and close accessible without increasing header height on narrow screens.

## Acceptance

- AC1/R1: local owned modules implement the viewer; no iframe, private Pi HTML exporter, duplicated standalone viewer runtime or new dependency is needed.
- AC2/R2–R3: a branching user → assistant → tool → result → assistant fixture reads coherently, tree selections/search/filter and visibility controls work, and other branches remain navigable.
- AC3/R4: raw text/download retain returned CRLF, blank/malformed/tail bytes; record access and copied links reopen the correct source/branch. Truncated snapshots never claim to be complete files.
- AC4/R5,R7: observing/opening/searching/copying/branching produces only passive resource reads, leaves actual histories and active composer state unchanged, and ignores stale scope responses.
- AC5/R6: duplicate IDs, cycles, missing parents, malformed/primitive records, ambiguous tool calls and long/deep/large fixtures remain bounded, responsive and diagnosable.
- AC6/R7: desktop and 390/320, light/dark and all styles pass browser bounds, native keyboard/focus, tree scrolling and theme/state retention checks.
- AC7/R1–R7: focused and full tests, typecheck, production build, independent review and actual browser evidence pass.
- AC8/R8: the merged header stays within56px at1440/390/320 across styles/modes and long names; tabs/download/close remain in one band during ready/loading/error/partial states.

## Scope exclusions

No backend/API changes, file-format migration, live runtime/extension invocation, normal conversation/composer redesign, global settings schema or unrelated cleanup. Existing running-composer work and pre-existing `web/next-env.d.ts` bytes remain separate and preserved.
