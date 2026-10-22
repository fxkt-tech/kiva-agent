# Live development stylesheet regression

## User-visible failure

The user's screenshot showed the new session tree as inline, full-width text above a narrow reading pane. The initial acceptance checked a production fixture on9497 but missed the actual development origin9495.

## Evidence and owner

- Source root layout already imports `globals.css`. Current source and production output contain `.jsonl-tree-row`, reader controls and `.jsonl-rendered { display: flex }`.
- Actual9495 HTML referenced `/_next/static/chunks/_1j1vqrm._.css`,105,895 characters, with the old `display: grid`/1.6fr+1fr tracks (mobile1.25fr+1fr), and no new tree/control rules. This is server-emitted stale CSS, independent of browser caches.
- Native browser reproduced the exact502-record session: at1440 the tree was886px wide and reader began on a second row at y711.5; at320 the reader was only142px wide and shifted right. Document overflow remained false, so an overflow-only check would miss it.
- Touching source mtime while preserving its bytes did not recover the stylesheet. No stylesheet import, specificity or product rendering defect was found. The exact internal dev-watcher invalidation cause is unproven; a concurrent production build is not established as its cause. Installed Next keeps dev and production artifacts separate.

## Recovery and validation

1. Passively enumerated all3 registered projects and4 sessions, including trash. Every runtime was dormant/idle with empty queues and no pending UI request. Captured exact returned JSONL hashes/byte lengths.
2. Gracefully restarted only9495 with its original command, cwd and inherited process environment. The previous PID15862 became66765. No forced kill, cache deletion, history/configuration mutation or source workaround.
3. Normal reload returned113,674 characters of current CSS with tree/reader rules and `display: flex`. Generated dev cache backup/clear was unnecessary. Restored pre-existing next-env bytes.
4. Actual-origin Chromium recheck at1440/390/320 passed: desktop tree300px, reader1135px at x305; mobile reader390/320px at x0. Mobile nested tree opens/searches/closes; no overflow, runtime mutations or browser errors. All4 history hashes and byte lengths remain unchanged.

Local evidence: `/tmp/kiva-owned-viewer-evidence/dev-regression/` contains `css-before.json`, `live-0.css`, before/after browser JSON/screenshots, `runtime-before.json`, `recovery.json`, and `after-normal-reload.css`.

## Prevention

The canonical JSONL verification contract now requires actual-origin served-CSS and computed-pane checks in addition to production fixture acceptance. Verify desktop tree/reader alignment and mobile full-width reading. Use the existing safe reload procedure only after checking every registered scope; retain user state and cache backups if a later cache regeneration proves necessary. Do not work around stale output with inline styles, split feature CSS, duplicate selectors or compiled-CSS edits.
