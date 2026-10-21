# Implementation verification — 2026-10-21

## Delivery and lifecycle

Implemented PRD R1–R7: fixed Geist sidebar settings footer/dialog, five categories, browser preferences and shortcut registry, Pi installation defaults, compatible provider/custom-model editing and separate API-key persistence, safe About diagnostics. Existing composer/session behavior remains scoped. No OAuth, deletion, raw configuration editing or remote connection tests were added.

The implementation turn stopped at the commit boundary without committing. The user subsequently explicitly requested “提交&推送”, authorizing the work commit, normal task archival/journal bookkeeping and push. The original dirty `web/next-env.d.ts` development-type imports are preserved locally and excluded from the commit.

## Final automated gate

- `pnpm test`: **254 passed** (5 CLI + 249 Web), zero failed/skipped/cancelled. The Web suite includes the new preference, shortcut, bootstrap, modal/focus, installation, configuration and runtime-admission regressions as well as existing routed/JSONL/tree/session tests.
- `pnpm typecheck`: passed, including after restoring the pre-existing development-type imports.
- `pnpm web:build`: passed; all static/dynamic routes generated successfully.
- `git diff --check`: passed.
- `python3 .trellis/scripts/task.py validate .trellis/tasks/10-21-global-settings`: both manifests passed with six real entries each. Expected warning: `visual-system.md` exceeds the 32,768-byte injection limit; main/implement/check agents read the complete source explicitly. No injection limit was changed.
- No lint script exists in the repository; no unsupported lint command was invented. Existing React test-renderer deprecation notices do not fail tests.

## Independent review and fixes

Native Trellis implement owners handled browser foundation, installation services/runtime admission and UI integration. Independent check reviewed spec/data flow/security/runtime/UI and confirmed all reported findings closed:

- Missing auth-file initialization no longer self-conflicts with a first valid public Pi API-key save; genuine stale/substitution conflicts remain rejected.
- Idle steer/follow-up commands cannot race provider mutation admission; unrelated active-owner delivery remains available.
- Dirty credential forms pin their observed revision; explicit reload retains candidates and deliberately rebases, while automatic metadata cannot silently do so.
- Focus candidates account for native `summary`, closed `details`, and closed mobile drawers even during exit animation.
- Persistent shell subscribes to preferences on `/projects`, so an already-open no-composer tab receives theme storage events.
- New-provider form rejects existing built-in/custom IDs without POST, retaining exact case-sensitive identity rules.
- Optional Next development badge is disabled through `devIndicators: false` because it intercepts footer clicks; error reporting/portals are not hidden. Moving it to another corner would obstruct mobile controls instead.
- Root route renders creation feedback only for a real matching error, not `undefined === undefined`. Real errors remain scoped across navigation.

## Browser acceptance

Python Playwright used an isolated production Next/custom-transport server on `127.0.0.1:30245`, temporary Git installations/worktrees and fake adapters/keys. Scripts/screenshots remain in `/tmp/kiva-settings-browser-azWvk6` for reproduction, not in shipped source.

- `acceptance.py`: all five categories, light/dark/system + OS changes, 14/18px content behavior, code wrapping, refresh and same-origin cross-tab synchronization, initialized disclosures/manual toggles, preserved drafts, shortcut recording/conflicts/modal priority/native newlines, allowlisted diagnostic copy.
- Complete default-pair save; existing session unchanged; a different project's new entry/session inherits defaults. Compatible provider definition and credential save separately; new model inputs remain expanded while typing. Duplicate provider IDs are blocked. Fake key never appears in returned metadata, browser persistence, feedback or diagnostics; saved/cancelled secrets clear. Injected malformed failure is mapped safely, candidates survive and retry succeeds.
- Light/dark at 1440px, 390px and 320px: category access, no horizontal document overflow, modal bounds, actual forward/backward Tab behavior and mobile focus restoration. Screenshots inspected for Geist layout, contrast and thin focus treatment. No page errors; settings flows caused zero Pi owner starts/model requests.
- Fully hidden temporary project registry still supports settings/default-model catalog. Actual project visibility was never changed for QA.
- `conversation-regression.py`: actual Enter send, Shift+Enter newline and Mod+Enter send through the real transport/fake adapter; active-provider save rejected with 409 while retaining candidate; running owner remains available for abort. Rendered/raw JSONL tabs retain byte-for-byte source after display wrapping preference changes.
- `stale-retry.py`: actual revision conflicts for dirty definition and credential candidates, explicit reload/reapply success, retained candidates, cleared saved key, and no owner restart during settings saves.
- `focus-trap.py` / `focus-mobile.py`: native collapsed model details and mobile closing trigger restoration were reproduced failing before fixes and passed afterward.

Unsafe filesystem, corrupt/duplicate/advanced/OAuth sources, origin/type/size guards, private modes, offline real Pi persistence/default reload, runtime admission races, pending/hidden owners and lazy exact-identity refresh are covered by temporary-installation service/runtime/transport tests rather than by mutating real data in a browser.

## Actual local origin

Before restarting `127.0.0.1:9495`, enumerated every registered project (including hidden) and active/archived/trash session resource; confirmed no streaming, queued or unresolved UI work. Stopped only the verified existing server process and started the updated normal `pnpm web` server. No actual configuration, history, worktree or project visibility was changed for QA.

`live-smoke.py` passed on the actual origin: `/projects` and existing-session footer/settings, all categories, new settings endpoints, explicit passive backend check, draft preservation, desktop/mobile open/close and focus restoration. Zero POSTs and page errors. Rechecked the original session remains dormant/idle. The updated local service is left running on port 9495 for the user.

## Spec synchronization

Added the seven-section executable `frontend/global-settings.md` contract and index link; updated visual-system theme/footer/send-mode rules, workspace-routing settings boundary and README. Browser-only preferences remain separate from Pi installation configuration and exact-session controls. No speculative configuration controls or broader state framework were added.
