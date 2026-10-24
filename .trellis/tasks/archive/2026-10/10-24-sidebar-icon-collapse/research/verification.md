# Verification

## Automated checks
- Root `node --test test/*.test.mjs`:6 pass,5 pre-existing platform skips.
- `pnpm --dir web test`:468/468 pass.
- Root `pnpm exec tsc --noEmit` and web typecheck pass.
- Production `pnpm web:build` passes. Build ran again after the final CSS save; do not mistake a previously built CSS artifact for a layout defect.
- Curated task manifests validate; `git diff --check` passes.

## Real Chromium evidence
Isolated existing artifacts fixture on127.0.0.1:9498; all API mutations confined to its temporary installation. No paid model calls or user histories. User app9495 untouched.

`/tmp/kiva-sidebar-browser.py` verifies:
-252px expanded /64px compact, linked logo and accessible controls.
- Same composer DOM and draft across fold/unfold and passive popup browsing.
- Popup survives outside focus, search stays local, nested menu Escape closes only menu first.
- Rename candidate and JSONL survive sibling-tab layout updates; final focus returns to the latest row/project control.
- Header/settings, reload and cross-tab synchronization; compact reload starts no hidden sidebar list reads.
- Existing output list and modal preview still usable.
- Light/dark desktop1440/1024 and full mobile drawers390/320 without document overflow.

`/tmp/kiva-sidebar-multi-browser.py` verifies:
- Saved compact preference paints64px from the first observed sidebar attachment (all five observations64).
- Two registered projects start zero hidden collection requests in compact mode.
- Switching project icons replaces a single popup; other-project search neither navigates nor changes current draft/DOM.
- Delete dialog remains mounted across a sibling-tab layout change.
- Exact session selection navigates and closes the popup; appearance reset expands navigation.

Screenshots inspected: `/tmp/kiva-sidebar-browser/compact-light-1440.png`, `compact-dark-1440.png`, `drawer-320.png`, `drawer-390.png`, `second-project-popup.png`.
No browser page errors. Original hashes of web/next-env.d.ts and the two unrelated HTML files match their starting state.

## Independent review
Trellis check reviewed the full changed scope and fixed one verified browser issue: desktop sidebar dialog → resize to mobile with drawer closed → dialog close left focus on body. SessionRows now returns the visible standalone navigation control for sidebar-origin focus before considering a connected row inside a closed drawer. A regression covers closed drawer, open drawer, desktop and collection-page origins.

Final Chromium rerun `/tmp/kiva-sidebar-mobile-focus.py` passes JSONL, rename and delete dialogs independently across desktop→390px resize, with navigation focused after close. The comprehensive primary browser suite also passes after the fix. Final routed tests82/82, full web468/468, root/web typechecks, production rebuild and diff/task validation pass. Independent review has no remaining findings.

## Visual follow-up: separated logo and chevron controls
- User rejected the inline compact logo/toggle arrangement and the panel-style glyphs on both sides.
- Compact header centers the25px logo in its own40px home link. The24×28px expansion handle sits on the rail divider at x52/y46 (center64/60), below the logo; a16px navigation inset prevents overlap. Expanded toggle stays header-right.
- Sidebar uses left/right chevrons; output uses down/up chevrons with a Files heading glyph. Existing accessible labels and state remain intact.
- `/tmp/kiva-sidebar-controls-browser.py` passes actual computed geometry, elementFromPoint hit testing in conversation and files, preserved draft/textarea DOM, output opening/closing, dark/light and390/320px drawer behavior; no page errors. Cropped screenshots inspected under `/tmp/kiva-sidebar-controls-browser/`.
- Production build, web typecheck,99 related artifact/workbench tests, independent review and diff check pass after the visual changes.

## Latest follow-up: two project controls and shared hover browser
- Compact project area contains exactly add-project plus and More; per-project rail icons removed. More opens one hierarchical project/session browser via native BaseUI hover support (120ms open /200ms close grace), click or keyboard.
- Stable project/session controllers portal presentation into ordered slots; all closed-browser groups release demand. Project/session menus and modal operations guard hover dismissal without window listeners or duplicated owners.
- `/tmp/kiva-project-browser-hover.py` passes real Chromium: two controls; zero initial hidden list requests; both registered projects and session lists visible with one summary read per project; pointer transit and nested menu operation; rename candidate retention; local other-project search with retained route/draft/textarea; click/keyboard; hover exit without stealing composer focus; plus opens actual directory picker; exact session navigation closes browser; expanded tree and390/320px drawers preserved. No page errors.
- `/tmp/kiva-project-browser-escape.py` passes nested menu Escape, JSONL/rename Escape without closing parent, hover-origin popup keyboard final focus, dark rendering, and JSONL/rename/delete dialogs surviving desktop→mobile resize with final focus on visible navigation.
- Latest full web run:468/468 pass. A subsequent additional demand-abort regression passes in the routed83/83 suite; latest focused combined123/123 pass. Production build, root/web typecheck, diff check and independent code review pass.
- Screenshot `/tmp/kiva-project-browser-hover/all-projects-light.png` visually inspected; dark screenshot also captured. User app and original unrelated files untouched.

## Outside-click follow-up
User requires the project browser to close on external click. Removed blanket outside-press cancellation and suppressed return focus for that dismissal, retaining the clicked control's focus. Real browser exposed missing floating ancestry for portaled project menus; the final guard protects semantic menu/dialog/overlay targets only while a local action is active. External composer clicks still close with or without an open menu. Right-side output retains its earlier no-outside-dismiss policy.

`/tmp/kiva-project-browser-outside.py` passes actual Chromium: outside closure with/without menu; composer focus and draft retention; project menu Search; rename input/cancel; JSONL open/close; parent retained during internal operations; separate output outside policy unchanged. No page errors or URL change. Final production rebuild, web typecheck,100 related tests, independent review, task validation and diff check pass.
