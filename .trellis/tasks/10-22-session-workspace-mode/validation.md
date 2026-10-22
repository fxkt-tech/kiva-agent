# Workspace mode validation

Implementation and independent review are complete. The user subsequently requested commit and push for this feature; archival and journal recording follow its implementation commit. Original generated next-env.d.ts dev-type imports were restored after the build.

## Automated verification

- `pnpm typecheck`: root and web passed.
- `pnpm test`: 5 CLI + 291 web tests passed; no failures or skips.
- `pnpm web:build`: passed after the final review correction.
- `git diff --check`: passed. No lint script is configured.
- Backend focused suites: 38/38; frontend focused suites: 93/93; transport suite: 10/10. Full checks above include these suites.

Tests cover dirty source/index/ref/worktree preservation, exact canonical/subdirectory resolution, both modes, default/current API behavior, invalid modes before lifecycle side effects, creation/restart/failure retries, dialogue continuation, legacy metadata without a mode, forged current-directory cleanup rejection, safe worktree cleanup, preference persistence/reset/synchronization, every creation entry point and mode/ID capture across settings changes.

## Independent review

A trellis-check agent reviewed R1-R7 across preference/request/metadata/execution/deletion/UI boundaries. It fixed one display issue: current-branch deletion loading/error state now displays executionRoot for registered subdirectories instead of the repository treeRoot. Routed regression and a targeted real-browser check cover this case. No remaining confirmed findings.

## Real browser acceptance

Used `server/fixtures/workspace-mode-server.ts` at port 9496 with real production Next UI, a new temporary Git repository and the deterministic runtime adapter. No user directories, real Pi instances or model services were used; no live user server was restarted. The fixture was stopped after checks, preserving temporary evidence for inspection.

`/tmp/kiva-workspace-mode-browser-check.py` passed:

- Fresh current-branch default creates no worktree and resolves original uncommitted contents.
- Saved worktree choice survives reload; its new session reads committed isolated files while the existing current-branch session retains its mode.
- Current-branch deletion hides cleanup, sends false and preserves project/dirty/untracked files.
- Worktree cleanup remains default checked; cancellation retains its files.
- Conversation reset restores current branch; two tabs synchronize workspace preferences.
- Light/dark at 1440px, 390px and 320px: settings/select bounds, nested Escape, mobile final focus and no document overflow.
- Zero page errors and console errors.

`/tmp/kiva-workspace-mode-subdirectory-browser.py` passed against the final build: a registered Git subdirectory creates/resolves its own current-branch execution root; held and failed deletion previews display that exact subdirectory, keep cleanup hidden and deletion disabled until a valid preview, and preserve local files. Zero page errors.

Screenshots: `/tmp/kiva-workspace-mode-{light,dark}-{1440,390,320}.png`. Headless Chromium lacks CJK glyphs; Chinese DOM/accessible-name checks passed. Source fixture state was preserved after history deletion.
