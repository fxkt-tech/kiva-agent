# Bug Analysis: legacy browser cache restores old UI

## 1. Root Cause Category

- **Category**: C (Change Propagation Failure), D (Test Coverage Gap), E (Implicit Assumption).
- **Specific cause**: Replacing agegr/pi-web left its root `/sw.js?v=...` registration alive. That worker serves Next assets cache-first from `pi-web-static-*`; Kiva development asset paths can be identical across versions. Current network HTML therefore loaded old CSS and old client components. A 404 for the worker URL does not uninstall the worker. Fresh/incognito browser checks did not contain the migrated registration.

## 2. Why Previous Fixes Failed

1. Clearing server `.next` changes server files, not the browser's Service Worker Cache Storage.
2. Hard reload and a cache-busting page query do not change the static asset keys intercepted by the worker.
3. Verifying only a clean browser profile proved delivery but missed the existing-user upgrade path.
4. Deleting the cache once can race with an in-flight retired-worker fetch that writes it back. A following document also sweeps orphaned Pi Web cache names without another reload.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Runtime | Retire the worker at its exact historical script URL | Done |
| P0 | Runtime | Put recovery in network HTML, outside cached Next chunks | Done |
| P0 | Regression | Exercise the actual old worker, stale CSS and repeated navigation | Passed |
| P1 | Unit tests | Cover scoped cleanup, unrelated data, reload loops and worker writes | Passed |
| P1 | Spec | Document the upgrade contract and require migrated browser profiles | Done |

## 4. Systematic Expansion

- Other UI deployments replacing a PWA at the same origin can inherit an obsolete worker even if the replacement never registers one.
- Current-model auth, project files and sessions were outside the cleanup scope. Cookies and local/session storage are retained.
- Keep the retirement endpoint while users may still upgrade from the legacy plugin; removing it would reintroduce the migration gap.

## 5. Knowledge Capture

- Updated the frontend visual-system spec with the worker and recovery contracts.
- Captured the browser reproduction and user verification in the task implementation notes.
- User verified that their normal browser now preserves the new UI on reload. No commit/push requested or performed.
