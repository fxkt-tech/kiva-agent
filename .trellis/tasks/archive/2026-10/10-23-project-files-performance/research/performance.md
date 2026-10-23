# Directory loading performance

## Method

Harness: `web/server/fixtures/files-performance.ts`. It runs a real loopback HTTP server with the scoped transport, repository and runtime manager, but refuses all runtime adapter acquisition and never invokes Pi/model services. All repositories, histories, registrations and generated baseline modules live in a new temporary directory. It does not contact or restart the user's server.

The baseline transport/bootstrap/session-catalog/workspace-registry source is loaded from fixed commit `12d678717905dd6f2e7dce83628b3f755cbf1b1e`. Only import locations are rewritten to let temporary modules load pinned local dependencies and unchanged services. The optimized run uses the current transport. Both runs reuse identical fixture data and process requests through real HTTP handlers; HTTP response bodies are fully read and parsed.

Each case uses five warm-up batches followed by 30 measured batches. P50/P95 use nearest-rank percentiles. Git subprocess calls and synchronous `.jsonl` reads/bytes are counted by temporary fixture-local builtin wrappers; these wrappers are restored after measurement. Structural counts are per measured batch, not totals across all samples.

Cases: 100, 1,200 and 10,000 generated source files (half wide, half nested), each plus `.gitignore` and one untracked file; 100 source files plus 20 histories totaling about 20 MB; and 100 source files with eight registered Git projects. The installation and history roots are isolated. The histories case uses 250 user-message records per history with 4,000-character content. Filesystem cache is not cleared.

- `directory`: one project workspace GET.
- `page-pair`: simultaneous project metadata GET and workspace GET, matching the duplicate bootstrap route dependency on a fresh file page.
- `concurrent-4`: four simultaneous workspace GETs, measuring the in-flight read-sharing opportunity.
- `registry-picker`: independent `/api/projects` GET with eight registrations.
- `sidebar-sessions`: independent scoped sessions-list GET with 20 histories; this is intentionally separate from removed bootstrap transcript reads.

## Reproduction

From repository root:

```sh
pnpm --dir web exec tsx server/fixtures/files-performance.ts baseline /tmp/kiva-files-performance.json
pnpm --dir web exec tsx server/fixtures/files-performance.ts after /tmp/kiva-files-performance.json
```

The JSON contains environment, fixture roots, exact byte/file counts, sample counts and all results. Run the commands sequentially without builds/tests competing for CPU or disk. Temporary roots remain available for inspection and reuse by the `after` command; remove only the JSON-recorded fixture root when finished.

## Interpretation limits

These are repeated in-process HTTP measurements with OS caches warm, not process-cold or filesystem-cold loading. Startup, initial Next compilation, assets, model catalog loading, actual React/browser scheduling and time to the first usable rendered tree are excluded. The measured `page-pair` is completion of both directory-related requests, not a complete browser-page speed claim. Browser acceptance is performed separately by the parent session.

The before tree is silently capped at 1,000 returned files while the optimized listing must be complete. Compare timings alongside returned file counts; large-repository work is no longer semantically equivalent. Actual React tree rebuild avoidance is verified in routed/component tests, not inferred from HTTP times.

Existing synchronous registry resolution and independent sidebar/session-catalog reads remain. Their requests can block the shared event loop and delay directory readiness when issued together; this benchmark reports those residual reads separately and does not claim the entire page is nonblocking.

## Results


Environment: Node v24.14.0, darwin 27.0.0, Apple M1 Pro. Local temporary filesystem; OS cache not cleared. Five warm-ups and 30 measured batches per row. Durations below are milliseconds. Raw results: `research/performance-results.json`.

| Scenario / request batch | Before P50 | After P50 | Before P95 | After P95 | Returned files before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| small/directory | 103.76 | 47.51 | 111.97 | 48.97 | 102 → 102 |
| small/page-pair | 205.95 | 83.63 | 227.67 | 85.52 | 102 → 102 |
| small/concurrent-4 | 408.75 | 153.52 | 445.19 | 174.73 | 102 → 102 |
| over-1000/directory | 116.27 | 49.95 | 126.97 | 56.97 | 1000 → 1202 |
| over-1000/page-pair | 215.10 | 85.23 | 224.82 | 87.64 | 1000 → 1202 |
| over-1000/concurrent-4 | 425.95 | 156.42 | 521.03 | 175.27 | 1000 → 1202 |
| large/directory | 126.32 | 66.05 | 129.05 | 73.23 | 1000 → 10002 |
| large/page-pair | 250.41 | 102.57 | 292.94 | 106.41 | 1000 → 10002 |
| large/concurrent-4 | 496.68 | 175.96 | 640.96 | 194.26 | 1000 → 10002 |
| histories/directory | 122.10 | 46.79 | 126.43 | 49.21 | 102 → 102 |
| histories/page-pair | 245.98 | 82.62 | 265.21 | 85.08 | 102 → 102 |
| histories/concurrent-4 | 488.19 | 154.21 | 511.99 | 168.19 | 102 → 102 |
| histories/sidebar-sessions | 591.65 | 596.65 | 658.76 | 635.03 | 0 → 0 |
| registrations/directory | 336.73 | 47.11 | 360.99 | 48.67 | 102 → 102 |
| registrations/page-pair | 692.72 | 82.11 | 870.51 | 85.23 | 102 → 102 |
| registrations/concurrent-4 | 1382.81 | 152.76 | 1451.51 | 165.54 | 102 → 102 |
| registrations/registry-picker | 278.68 | 280.21 | 297.20 | 296.49 | 0 → 0 |

Directory-related `page-pair` P50 decreased by 59.4% on the small fixture, 59.0% on 10,000 source files, 66.4% with 20 histories and 88.1% with eight registered projects. These are request-batch measurements, not full browser-page speedups. The large fixture now returns 10,002 paths rather than silently truncating at 1,000.

### Structural counts per batch

| Batch | Before sync / async Git | After sync / async Git | Transcript reads before → after | Transcript bytes before → after |
| --- | ---: | ---: | ---: | ---: |
| small/directory | 14 / 0 | 5 / 4 | 0 → 0 | 0 → 0 |
| small/page-pair | 28 / 0 | 10 / 4 | 0 → 0 | 0 → 0 |
| small/concurrent-4 | 56 / 0 | 20 / 4 | 0 → 0 | 0 → 0 |
| histories/page-pair | 28 / 0 | 10 / 4 | 40 → 0 | 40587460 → 0 |
| registrations/page-pair | 98 / 0 | 10 / 4 | 0 → 0 | 0 → 0 |
| histories/sidebar-sessions | 65 / 0 | 65 / 0 | 120 → 120 | 121762380 → 121762380 |
| registrations/registry-picker | 40 / 0 | 40 / 0 | 0 → 0 | 0 → 0 |

The optimized directory reader uses one four-command asynchronous enumeration per single or concurrent batch. The remaining five synchronous Git calls per HTTP request are target registry capability checks; four callers therefore still incur 20 synchronous calls even though their enumeration is shared. Project metadata has five target capability checks but no workspace enumeration.

### Standalone tree construction

Both input sets use the same current `buildWorkspaceTree` algorithm. This is a per-build cost diagnostic: the baseline-sized input is capped at 1,000 while the complete input includes every path. It does not measure React mounts, expanded DOM rendering or memo hits. Component/routed tests verify unchanged entry identity across file selection/preview.

| Fixture | Input | Paths | Build P50 ms | Build P95 ms |
| --- | --- | ---: | ---: | ---: |
| small | baseline-cap | 102 | 0.07 | 0.09 |
| small | complete | 102 | 0.06 | 0.09 |
| over-1000 | baseline-cap | 1000 | 0.53 | 0.60 |
| over-1000 | complete | 1202 | 0.53 | 0.60 |
| large | baseline-cap | 1000 | 0.66 | 0.72 |
| large | complete | 10002 | 4.38 | 5.07 |

### Remaining bottleneck

With 20 histories totaling 20,293,730 bytes, the independent sidebar sessions request still reads each set six times: 120 transcript reads / 121,762,380 bytes and 65 synchronous Git calls, with after P50 596.65 ms / P95 635.03 ms. The eight-project global picker still incurs 40 synchronous Git calls and after P50 280.21 ms. Their before/after timing differences are small relative to observed variation; neither code path was optimized in this task.

These independent synchronous requests can serialize other work on the shared server event loop. A full-page cold/first-usable-tree performance guarantee would require a separate paired browser/overlap benchmark and potentially follow-up session catalog/registry optimization. This report establishes the approved directory-specific structural improvements and repeated HTTP gains; it does not hide or resolve that remaining cost.
