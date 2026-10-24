# Transparent conversation header / complete sidebar collapse

User requested a transparent header in the middle conversation area with a right-hand rail toggle, and an entirely invisible sidebar when collapsed. Implemented directly in the existing task.

## Result
- SessionArtifacts owns the same-tree conversation layout with children; middle .conversation-center contains transparent in-flow48px .conversation-header and the existing mounted session subtree.
- One right-aligned header toggle controls the desktop rail and narrow-screen drawer. Removing the rail leaves zero strip/reserved width; remove old40px strip and floating mobile file control.
- Toggle preserves textarea/message timeline/disclosures/runtime connection. Hidden inline preview unmounts/revokes its own lease; independent new tabs remain unaffected.

## Validation
- Focused frontend/routed:84 passed, including exact textarea/disclosure instance and socket preservation.
- Full pnpm test: web447 passed/0 failed, root6 passed/5 existing skips.
- Root/web typecheck, production build, task contexts and diff checks passed.
- Independent Trellis check reports no actionable findings or additional edits.
- Real production Chromium fixture `/tmp/kiva-artifacts-header-browser.py`: transparent computed background, zero border/blur, one toggle; entire oldrail width reclaimed; same textarea and timeline DOM nodes, draft retained; inline lease revoked; header reopen;390dark/320light mobile drawer/default-dialog/leftnavigation remain usable, no overflow. Screenshot directory `/tmp/kiva-artifacts-header-browser/` visually inspected.
- Original multi-mode production browser regression rerun: modal/side/new-tab independence, source viewing, zoom, CSS/ESM/JSON/CDN/API, opaque isolation, mobile and draft checks all passed.

Only temporary fixture service9498 stopped after testing. Original unrelated next-env and two playground HTML files are byte-for-byte preserved. No commits, merge, push or archive performed; task awaits commit approval.
