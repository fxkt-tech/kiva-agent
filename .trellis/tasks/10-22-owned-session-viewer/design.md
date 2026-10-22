# Design: owned Pi-style viewer

Status: reviewed and approved for implementation on 2026-10-22.

## Boundary and architecture

Port the useful Pi reader behavior into the existing feature using React and TypeScript. Keep rendering, source projection and navigation independently understandable; do not translate the whole standalone `innerHTML` script line by line or create a general viewer framework.

Reuse `SessionJsonlDocument`, the current scoped GET, validation and exact raw document. The backend continues to be a passive snapshot owner; no exporter, temporary production file or Pi process is part of this design.

Expected module responsibilities:

- `jsonl-structure.ts`: bounded source parsing/field projection. Extend its source scanner for a single pass over the returned snapshot; do not repeatedly reparse all earlier pages to build a tree.
- A focused local `jsonl-session.ts` (or equivalently named helper): typed index of records, unique-ID ancestry, branch paths/descendant leaves, tree search/filter and source diagnostics. Keep browser state and network requests out of it.
- `jsonl-presentation.ts`: retain bounded semantic content and conservative tool linkage; extend only the necessary known entry/summary projections.
- `jsonl-timeline.tsx` plus focused navigation/thread children: coordinate local selected leaf/target, render tree and reading window, visibility controls and on-demand record details. Reuse shared Markdown and existing primitives.
- `session-jsonl-dialog.tsx`: scoped load/error/raw/download behavior, full-screen overlay/focus, reader initial target and selection reset.
- A small session-viewer host in `features/sessions/`: one owner for menu opening and URL opening. Mount once from the persistent workspace shell; update SessionRows to request opening it rather than duplicating dialogs.
- JSONL-only rules in `app/globals.css`: Pi-inspired pane hierarchy, responsive tree, compact tool/message surfaces. Preserve adjacent composer changes byte-for-byte.

## Source and branch contract

Parse each nonblank line once with its original line number and raw slice. Index all records in the returned byte-bounded snapshot so ancestry can cross the old 200-record UI page boundary. Stable UI identity is the original line; protocol IDs may duplicate.

Only unique, noncyclic IDs establish confirmed parent edges. Missing/duplicate/cyclic/forward-invalid relationships remain explicit diagnostics, never arbitrary Map overwrites. Preserve unresolved records through a labelled diagnostic/source view. Traversals are iterative or cycle checked; avoid per-record whole-ancestry walks when deriving the index.

Normal entry selection mirrors Pi: choose the newest reachable leaf through that node and reveal the target in that branch. Initial selection is the last valid loaded leaf; a truncated snapshot is labelled as a partial history. All branches remain in tree navigation even though reading follows one branch. Filters affect tree navigation and retain the active target, consistent with Pi; they do not delete source evidence.

The reading pane groups a tool's call and confirmed same-branch result in one expandable presentation. Keep original source references for both records. Unmatched/ambiguous results remain independently accessible and never imply a running or successful tool. Hidden custom messages have an explicit visibility control. Missing statistics stay unavailable rather than zero or fabricated totals.

## Rendering bounds

Retain the current per-text/block/field limits and explicit clipping notices. Tree and branch reading use bounded render windows/pages with reachable controls or virtual windows; indexing the snapshot does not mount every parsed record. Branch-target navigation must reveal a target outside the current window. Reuse existing memoized Markdown rather than a second parser/highlighter. Continue escaping raw content and avoiding arbitrary embedded URL image fetches.

Validate a near-limit document and many short records, a deep chain, wide branching, many tools and huge text fields. Choose/finalize the render window from those measurements; never silently drop the remaining branch or pretend a preview is complete.

## Links and dialog ownership

Use canonical links to the exact session route with allowlisted viewer parameters such as `jsonl=1`, `leaf=<id>`, `target=<id>` and an original-line fallback for missing/duplicate IDs. Do not put message content in a URL. Parse duplicate/invalid parameters defensively and show a recoverable target-missing state for deleted/outside-snapshot records.

A single persistent feature host resolves the exact session passively and opens the shared full-screen dialog. Menu opening retains its precise return-focus target. URL opening must work without finding the session in the limited sidebar list, including archived/trash histories. Closing a URL-opened viewer removes only its view parameters with replace navigation; ordinary selection changes stay inside the viewer and leave the conversation/drafts mounted.

Keep one Base UI overlay/focus owner. Use shared primitives for any nested source details/mobile navigation, with proper nested Escape and focus restoration. Native tree keyboard navigation may borrow the existing workspace-tree conventions without coupling to filesystem path models. A desktop pane separator supports pointer and keyboard resizing, bounded to preserve the reading pane. Width is local viewer state; this task adds no preference schema.

## Appearance, compatibility and license

Pi provides the reading hierarchy, tree/filter and tool presentation reference. Existing semantic colors, local Geist fonts and material/corner roles provide theme integration. The same components support flat/neumorphic/Swiss and light/dark/system; do not branch feature trees by style. Mobile opens a dismissible tree pane rather than squeezing a permanently visible inspector into 320px.

Record adapted-source provenance and Pi's MIT copyright/permission notice in an appropriate local notice file/source headers. Use installed 1.3.0 source as the fixed reference; future UI evolution belongs to this repository and does not read implementation files from node_modules at runtime.

## Rollback and separate work

This deliberately supersedes the old JSONL rule requiring a permanent right inspector and file-order-only conversation. Update that specific visual spec when implementation passes; do not rewrite the old archived task.

Rollback task-owned viewer changes only. Preserve running-composer edits in composer/CSS/tests/spec and its task metadata; do not commit them incidentally. Preserve original next-env bytes, user server9495 and its dev cache. Git branch/commit ownership must be resolved without stashing, overwriting or silently bundling that pending work.

## Compact header follow-up

The user requests a single-height top bar instead of separate heading and toolbar rows. Merge only the JSONL dialog header: session title/name in a two-line compact identity block, view tabs alongside it, filename and snapshot size in a two-line desktop metadata block, then download and close. Target approximately48–56px total header height. Use nonwrapping flex/grid tracks, truncation and smaller gaps; at320/390 hide secondary filename metadata and use an icon-only download retaining its full accessible name/partial-snapshot state. Preserve semantic dialog title/description, tab keyboard behavior, exact download and close focus; status/truncation alerts remain separate content notices. Scope is `session-jsonl-dialog.tsx` and JSONL-only `globals.css` rules; adjust existing interaction tests only when changed markup requires it. No viewer model, API, composer or global primitives changes. Verify actual9495 served CSS and measured one-band/control bounds across styles/modes/widths after implementation.
