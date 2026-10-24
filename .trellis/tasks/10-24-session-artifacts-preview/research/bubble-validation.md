# File list / floating preview bubbles and left reading alignment

Latest user scope replaces all prior sidebar/drawer/side-preview UI: header button toggles a closed-by-default file-list Popover; file rows retain default modal and independent new tab, with a draggable/resizable/closable nonmodal preview bubble as the third action. User additionally requested a modest left movement of the conversation while bubbles are open.

## Implemented boundary
- Conversation stays full-width, no rail/strip/drawer. Standard Base UI list Popover, independent modal/floating hosts, overlay-depth conventions and header focus fallback.
- One floating preview: titlebar dragging, width/height resize, keyboard arrows/Shift/Home, viewport/visualViewport clamping and pointer capture/cancel/unmount cleanup. Shield exists only during manipulation.
- List close/open and geometry updates keep the same iframe and lease; file switch/real close revokes that instance. Independent tabs stay independent.
- Wide reading area shifts up to120px within available whitespace, remains centered at small widths, stops shifting under a preview dragged to the left, and resets when bubbles close. Uses margins/padding instead of translated composer containers, preserving fixed Toast viewport anchoring.
- Metadata demand includes list, default modal and floating preview, so completion-driven file updates reach an open modal after the list closes; no iframe reset for metadata-only updates.

## Checks
- Full pnpm test: web452/452, root6 passed/5 existing skips.
- Root/web typecheck and production build passed; task context and whitespace checks passed.
- Focused frontend/routed88 passed before independent modal-refresh regression; checker added red→green modal refresh regression, artifact UI11/11 and typecheck pass; no remaining actionable review findings.
- Production Chromium `/tmp/kiva-artifacts-bubbles-browser.py` passed on both normal and external artifact sessions. Checks: closed initial metadata; no sidebar/layout-width change; header repeat toggle; desktop message+composer left shift/recenter; nonmodal actual composer click/typing; native drag and both-axis shrink/grow; keyboard move/resize; native capture and pointer cancellation; exact same iframe DOM/src and counter state; list lifecycle independence; modal-above-float and fallback focus; newtab/noopener/independent lease; draft/timeline DOM preserved;390/320/landscape568x320 bounds and no horizontal overflow. External run additionally checks absolute local CSS/ESM and file-URL image rendering.
- Fixed-position probe inside composer remained viewport anchored. Screenshots inspected in `/tmp/kiva-artifacts-bubbles-browser/` and external equivalent.

Browser verifier initially read a previous-frame CDP box immediately after continuous pointer events; native state/style were already updated. Replaced the instant assertion with polling actual getBoundingClientRect after native gestures, without changing product handlers or invoking them manually in acceptance. No gesture defect remained.

Only temporary fixture9498 stopped. No paid/model commands or user-data fixtures. Original next-env and two playground HTML files preserved byte-for-byte; no commits, merge, push or task archive.
