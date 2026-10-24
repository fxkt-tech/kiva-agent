# External-file amendment validation

User-approved outcome: any local image/HTML explicitly associated with the current session may be previewed directly, without workspace-directory restriction or copying. HTML local dependencies use the same per-file authority. Existing UI, DTO, endpoints and HTML isolation remain compatible.

## Checks
- Full `pnpm test`: root 6 passed / 5 existing skips; web 445 passed, 0 failed (42 suites).
- Root/web `pnpm typecheck`, production `pnpm web:build`, context validation and diff checks passed.
- Independent Trellis check: 47 focused locator/index/dependency/preview/files/diff tests passed, no actionable findings or additional edits.
- Workspace-files reader restored byte-for-byte to HEAD; existing file/diff tests pass, and browser test confirms ../ file requests there remain rejected.

## Browser acceptance
Real production fixture `web/server/fixtures/artifacts-browser-server.ts` creates external sibling directories outside the registered project. Chromium script `/tmp/kiva-artifacts-external-browser.py` checks:
- external absolute image/HTML and explicit ../ references available; /var and /private/var aliases deduplicate;
- absolute CSS/image/ESM imports, parent-directory CSS @import and document-relative JSON fetch, and file:// image via import.meta URL;
- default dialog, right-side preview and independent new tab/reload;
- current scripts/CDN/API remain functional; opaque parent DOM/storage denial retained;
- unlisted token resource returns404; another session cannot reuse the artifact ID;
- long absolute paths fit desktop and390px dark modal without document overflow.
All passed without page errors. Screenshots and result: `/tmp/kiva-artifacts-external-browser/`.

The original desktop/mobile320/390 browser suite was rerun and passed after the change, including preserved drafts/source toggle, image zoom, no-opener new tab and no model commands. Files are read-only; no actual user histories/files or paid services were used. Only temporary fixture service9498 was stopped; the existing9495 user service was left running and requires restart to load changed server modules.

## State
No commit, merge or push performed. All unrelated original files (next-env and two playground HTML files) remain byte-for-byte unchanged. The previous pending commit plan is refreshed to include this amendment.
