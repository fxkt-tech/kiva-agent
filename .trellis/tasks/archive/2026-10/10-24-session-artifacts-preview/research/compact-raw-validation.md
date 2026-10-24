# Retained list, compact rows, direct raw tabs and one floating header

Latest user4changes implemented: modal selection retains output Popover/filter/scroll/row DOM, compact44pxrows, raw newtabs without KivA wrapper, floating toolbar/title/source consolidated into one40pxbar. Narrow windows retain secondary controls in shared More menu.

## Validation
- Full pnpm test: web457 passed/0failed (43suites), root6passed/5existing skips. Following nativePNG styling refinement, backendraw+preview focused8/8 passed; no unrelated code changed afterward.
- Frontendfocused92/92 passed, root/webtypecheck passed after fresh productionbuild regenerated routes for deleted wrapper, productionbuild passed with latestCSS. Taskcontext/diffchecks pass.
- Independent review no actionable findings, including final narrowraw-image CSP style rule.
- ProductionChromium `/tmp/kiva-artifacts-compact-browser.py`, normal and external sessions bothpassed: row heights36..48(actual44), no separate detail row; filtered list and exact row/popup DOM retained during modal, Escape closesonlymodal and restoresrowfocus; floating one40pxbar with no old heading/source/toolbar rows; sameiframe/source-toggle/counter after movement; rawHTML top-level counter/localCSS/nestedESM/JSON/CDN/API and noiframe/appwrapper/noopener; rawstableURLreload;280pxMorecontrol accessibility; More-source→globalJSONL focusedclose without restorationrace; nativePNG originalMIME/browserimage view+reload;320pximagebar/originalsize menu reachable; nooverflow/page or nativeimageconsole errors. Screenshots inspected in `/tmp/kiva-artifacts-compact-browser/` and external equivalent.

NativePNG browser-generated imageviewer needs inline CSS permission for centering/background; only rawimage responses receive the same nonexecuting sandbox+inline-style rule already used by SVG. No scripts/resource/CORS relaxation, tokenJS/CSS unaffected. No duplicate image HTTP request was observed; nav-only rawguard remains.

Direct stable route is custom-server owned; unused Next wrapperpage/ArtifactPreviewPage and wrapperCSS/tests removed. SourceHTML is rendered with only syntax-aware resourceURL mapping, no appchrome/loader/frame insertion. Raw leases are independent and TTL-reclaimed; original in-app leases unchanged.

Fixture PNG/data/history all isolatedtemporary roots; no paid prompts or user data. Only fixture9498 stopped. Existing userWebprocess left running: rawnewtab backend entry requires Webrestart to load newserver module. Original next-env+two playgroundHTML files byte-for-byte preserved. No commit/merge/push/archive.
