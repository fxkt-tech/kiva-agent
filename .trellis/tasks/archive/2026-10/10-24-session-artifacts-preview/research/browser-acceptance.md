# Browser acceptance (2026-10-24)

Test composition: `pnpm --dir web exec tsx server/fixtures/artifacts-browser-server.ts`, isolated temporary Git roots/current-branch sessions and deterministic model adapter. Uses the real production Next/App Router build at fixture port 9498. No actual user files/history, login or paid model request is used. Python Playwright scripts and screenshots are in `/tmp/kiva-artifacts-browser.py`, `/tmp/kiva-artifacts-cdn-check.py`, `/tmp/kiva-artifacts-browser/`.

Passed in Chromium:
- Direct desktop rail, exactly two referenced artifacts, unrelated file excluded, other shared-directory session empty.
- No content/lease/model-command requests on initial list load.
- Default modal, SVG image dimensions and zoom, source toggle retaining HTML counter state, close/final-focus restoration.
- Right-side preview retains list and unsent composer draft.
- Explicit new tab has no opener, survives parent SPA session switch, and reloads with an independent lease.
- SPA session switch preserves source-scoped draft (full page reload intentionally does not persist drafts, matching existing contract).
- Inline JS button, CSS, nested external module importing module-relative helper, document-relative fetch JSON, controlled HTTPS CDN script and cross-origin API.
- Opaque document cannot access parent DOM/localStorage. Direct document URL also cannot access localStorage or application API data.
- Narrow layouts 390px dark and 320px light: file drawer, side preview and nested default dialog, no horizontal document overflow. Screenshot inspection also covered 1440px light side preview.
- No page errors and no model command acquisition from list/preview operations.

CORS/CDN use reserved external HTTPS hostnames intercepted with explicit response headers, rather than depending on a public service or disabling browser web security. Host UI retains normal CORS restrictions. The separate backend transport/capability suites verify null/cross-site API denial, exact assets, revoked/expired/cross-scope leases and SVG top-level policy.

Normal Base UI Escape closes host overlays; key events while focused inside an opaque iframe do not bubble to its parent. The host close button remains available; no privileged generic postMessage bridge was introduced.
