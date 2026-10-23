# Paired production sidebar DOM readiness

Measured 2026-10-24 with Python Playwright/Chromium 143.0.7499.4, local production Next UI, 1440x1000, reduced motion and no paid prompts. The same exact temporary project directory and its 20 histories / 20,725,500 bytes were reused; histories contain valid parent-linked messages and explicit session names. No metadata/history mutation occurs between samples. All sampled session endpoints are real scoped transport handlers; the manager factory throws if a runtime is acquired.

## Method and source

Baseline API sources (scoped-transport, session-repository, session-catalog) were copied from fixed 86fc5ce with local imports rewritten into a closed snapshot. The baseline production .next build was the preserved build of that same application code from the preceding task, measured before building the new code. Final AFTER used the reviewed current API sources and newly built production UI. Shared unchanged dependencies and temporary registry/model fixtures were retained. This is not a benchmark of the user's live project.

Each server is prepared before navigation. One initial navigation is recorded separately, then five warmups and 30 measured full navigations. A document MutationObserver records performance.now when all 20 `.project-sessions .session-item` rows attach. Playwright assertions only wait for completion; their polling duration is excluded. An initial assertion-polling timestamp approach was discarded and both final sides use the observer method.

This measures navigation-to-sidebar DOM readiness, including normal document/UI/API work in this controlled case. It does not measure OS-cold storage, pixel paint, time to every other UI feature, or multi-project browser first-readiness. OS caches were not cleared. The tab waits for network idle between iterations so previous requests do not overlap later samples. No tests/builds/other timing loops ran during the captures.

## Results

| Sidebar 20 rows ready | Before ms | After ms |
| --- | ---: | ---: |
| Initial prepared-server navigation (single observation) | 997.20 | 512.40 |
| Repeated navigation P50, 30 samples | 940.60 | 482.70 |
| Repeated navigation P95, 30 samples | 987.10 | 492.30 |

P50 improved 48.7% in this fixture. Both runs recorded 36 session-list GETs over 36 navigations (one per navigation), so this specific result does not claim a sidebar/content duplicate-request reduction. Request sharing, multi-project priority and collapsed demand are verified separately in component/routed tests and browser acceptance.

Raw samples: browser-baseline-results.json and browser-after-results.json. Backend byte/Git/projection counts and delayed-I/O responsiveness are in performance.md/performance-results.json, using their independently documented fixtures.

## Reproduction notes

browser-metrics-setup.py creates an isolated Git/history/model fixture plus baseline/after server compositions, loading baseline modules from 86fc5ce. It assumes repository-root cwd and local pinned dependencies. browser-metrics.py reads the composition's /__fixture, runs the observer captures and writes /tmp/kiva-sidebar-browser-{mode}.json. Run with SIDEBAR_METRIC_MODE=baseline|after and FIXTURE_ORIGIN=http://127.0.0.1:19498.

The UI build must match each mode: prepare a baseline 86fc5ce production build before its capture and the current production build before AFTER; do not run an old API with a new UI and call it a baseline. Keep the setup's temporary root intact across captures, and run sequentially without CPU/disk competitors. The recorded run used the webapp-testing with_server.py helper to start/stop only fixture-owned compositions. Setup metadata was saved at /tmp/kiva-sidebar-browser-fixture.json; generated browser-baseline.ts/browser-after.ts paths are under its source field. No git checkout or user-server restart is performed by the scripts.
