# Design

## Boundary

This is a frontend presentation change in `web/features/sessions/`. Keep `parseJsonlPage` and the bounded field tree as data-preservation mechanisms. The latest user request replaces inline record details with one shared right inspector, beside the readable conversation. Both panes stretch through the entire available content height and own independent scrolling. Pagination remains outside the left scrolling area. Raw tab and scoped resource lifecycle remain intact.

The user's follow-up makes the viewer full-screen. Limit this adjustment to JSONL feature CSS: pin its shared Dialog popup to the viewport, override shared centering/max dimensions and remove the obsolete mobile inset rule. Retain the readable inner column, shared overlay behavior, header controls and independent scrolling. Browser-measure exact viewport coverage on desktop/mobile in both themes; no new business tests are needed for the CSS-only geometry adjustment.

## Presentation

- Use a restrained reading column, role icons/labels, timestamps when valid, original line references and subtle message separation. Message bodies are visible immediately.
- Render Markdown using the existing memoized presentation, extracted to a shared component if needed; preserve main-conversation behavior and memoization.
- Render text and thinking blocks distinctly. Thinking starts collapsed. Images/unsupported blocks retain descriptive placeholders and field details rather than loading arbitrary embedded URLs.
- Tools use compact cards with readable command/argument previews and expandable input/output. Associate only unique exact tool-call IDs within loaded records and reject contradictory parent ancestry where relevant. Result records remain represented at their original file position with links to related calls. Unmatched or ambiguous records remain independent records. No synthetic runtime statuses.
- Known non-message records use concise event rows; compaction/branch summaries expose their text. Unknown and malformed records get readable fallbacks plus original source/fields.
- Each source record is selectable by clicking its card or its keyboard-accessible line button. One right “记录详情” inspector shows original type/id/parent link, relationship notices and bounded JSON fields for the selected record. Select the first loaded record initially and after pagination. Key the field tree by selected line to reset expansion and reset only the inspector's scroll on selection changes; ordinary selection must not move the left viewport.
- Source/parent links select the target and navigate/focus it in the left timeline. Prevent nested source-link clicks from bubbling into a stale selection of the containing record. Keep tool/thinking native disclosures operable and preserve text selection; do not nest the entire message inside a button. Use a visible selected state plus accessible line-button state.
- Use flexible two-column tracks with `min-width: 0` and `min-height: 0`, an independent left flex layout and right header/scroll layout. Both panes fill the content height at desktop and mobile; do not revert to vertically stacked partial-height panels. Preserve readable wrapping and bounded field indentation at 320px.
- Never project through Pi's current-leaf reducer, which discards historical evidence.
- Keep 200 records/page; bound content blocks and semantic text previews, explicitly disclosing clipping. Raw text remains complete returned content. No unbounded recursive object pretty-printing.

## Affected files

- `session-jsonl-dialog.tsx` and focused feature helpers/components: semantic timeline and detail navigation.
- `app/globals.css`: replace obsolete split-pane styles with responsive timeline styles using semantic tokens.
- Shared Markdown component / `message-content.tsx` only if necessary for renderer reuse.
- JSONL tests and relevant interaction assertions: semantic contract and retained safety behavior.
- `visual-system.md`: synchronize layout and association contracts.

## Compatibility

No dependency, backend, persistence, session-mode or runtime changes. Local `web/next-env.d.ts` is pre-existing generated WIP and must remain uncommitted. Existing tab labels remain compatible. Presentation changes stay scoped to JSONL; existing parser, data fidelity and bounded-rendering contracts remain required.
