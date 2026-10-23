# Changes-list and diff performance

## Method and reproduction

Harness: `web/server/fixtures/changes-performance.ts`. It creates fresh temporary Git/installation roots and uses real scoped HTTP transport handlers, repository and runtime manager. Its runtime adapter factory throws if acquired; no user server or paid model is touched.

The baseline source comes from fixed commit `c0ad5c7`. A closed snapshot of scoped-transport, workspace-reader, workspace-files, workspace-registry and session-catalog rewrites only import locations to temporary modules. In particular, the baseline synchronous path/text/diff helpers cannot accidentally import the new asynchronous exports. Unchanged support services and pinned dependencies are shared. The optimized run uses current modules against identical fixture data.

Run sequentially from the repository root without builds/tests competing for CPU/disk:

```sh
pnpm --dir web exec tsx server/fixtures/changes-performance.ts baseline /tmp/kiva-changes-performance.json
pnpm --dir web exec tsx server/fixtures/changes-performance.ts after /tmp/kiva-changes-performance.json
```

Each ordinary HTTP batch and delayed-Git probe uses five warm-ups and 30 measured samples. HTTP bodies are fully read/parsed. Nearest-rank P50/P95 and average subprocess counts are reported per batch. Payload bytes are UTF-8 serialized JSON, including escaping; content bytes are decoded patch content. Git calls are counted using fixture-local builtin wrappers restored after ordinary measurements.

## Fixtures

- `large-few`: 10,000 tracked source leaves, .gitignore, two extra tracked files and one multiline untracked file. Four changed leaves: small tracked source, another small tracked file, near-bound tracked text and untracked text.
- Near-bound tracked source: 811,000 bytes before and after replacement, yielding a roughly 1.624 MB patch within the 2,000,000-byte diff bound. The multiline untracked file has 30,000 lines / 450,000 source bytes.
- `many-changes`: 2,000 tracked source leaves all modified, plus unchanged .gitignore.
- `clean`: 10,000 unchanged source leaves plus .gitignore; selected tracked path has no text difference.
- Concurrent batches: four equivalent requests for the small tracked path, or two different tracked paths. These still perform separate scoped ownership/capability validation before any work sharing.

The baseline changes list requests the existing full `/workspace` shape; the optimized list requests `/workspace?view=changes`. File-view behavior is checked elsewhere. Payload reduction therefore deliberately reflects removing unrelated full-file paths, not identical wire shapes.

## Independent responsiveness probe

The HTTP server runs in a separate child process so baseline synchronous Git cannot prevent the client from scheduling its ping. A temporary executable Git shim on the child's PATH marks the start of each `diff`, sleeps 300 ms, then executes real Git. Registry capability commands are not delayed. This affects both baseline spawnSync and optimized async execFile, without relying on replacing an already-captured process-runner closure.

After observing the per-request start marker, the independent client requests a lightweight fixture `/__ping` route while waiting for the diff. The ping bypasses registry/history/model work; it isolates whether a Git wait blocks the server event loop. It is not a claim that all application routes are nonblocking.

## Limits and residual cost

These are repeated warm-process HTTP measurements with OS caches not cleared. Next startup/assets/rendering, browser scheduling and full-page first-usable-tree latency are excluded. A diff becoming asynchronous does not guarantee a lower single-request duration: filesystem validation, process scheduling and retained target capability probes may dominate a small patch. All paired regressions are reported below.

Registry resolution and session ownership/history work remain outside this optimization. The prior directory task measured independent sidebar and global picker costs; this harness does not rerun or claim to resolve them. Separate scoped validation can still synchronously block requests before they reach the new async diff reader.

## Results

Environment: Node v24.14.0, git version 2.55.0, darwin 27.0.0, Apple M1 Pro. Local temporary filesystem; OS cache not cleared. Five warm-ups and 30 measured samples per row. Baseline full commit: `c0ad5c7b8c1d8f0e6d57371da6aabbe76707d91e`. Optimized measurements were rerun after the final route guard/nonregular-file/async-read review fixes, without repeating the unchanged baseline. Raw data: `research/performance-results.json`.

### HTTP latency (milliseconds)

| Case / request batch | Before P50 | After P50 | Before P95 | After P95 | P50 change |
| --- | ---: | ---: | ---: | ---: | ---: |
| large-few/list | 76.96 | 64.41 | 97.09 | 67.25 | -16.3% |
| large-few/tracked-small | 47.22 | 46.58 | 65.40 | 51.04 | -1.4% |
| large-few/tracked-near-bound | 49.56 | 58.68 | 60.00 | 61.30 | +18.4% |
| large-few/untracked-multiline | 55.80 | 62.21 | 62.96 | 68.19 | +11.5% |
| large-few/concurrent-same-4 | 161.48 | 147.00 | 208.69 | 166.08 | -9.0% |
| large-few/concurrent-different-2 | 94.57 | 80.57 | 122.16 | 87.01 | -14.8% |
| many-changes/list | 52.23 | 53.75 | 53.98 | 59.12 | +2.9% |
| clean/list | 65.25 | 59.24 | 72.54 | 62.15 | -9.2% |
| clean/clean-path | 48.87 | 53.76 | 52.82 | 56.95 | +10.0% |

Negative percentages are lower latency. Positive percentages are measured regressions, not improvements. These samples do not isolate causality. Async scheduling or path/identity checks are plausible contributors to individual diff costs, but the changes list does not perform preview-path revalidation. Repository status work, retained five synchronous target capability Git calls per request and host variation remain relevant; no one factor is established as the cause of every timing change. Do not promise faster isolated diff completion from this change.

### Response size and subprocess work

Counters are per complete request batch. Sync/async columns include target capability probes.

| Batch | JSON payload bytes before → after | Full file paths before → after | Changed leaves before → after | Sync Git before → after | Async Git before → after | ls-files before → after | Diff processes before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| large-few/list | 287366 → 398 | 10004 → 0 | 4 → 4 | 5 → 5 | 4 → 3 | 1 → 0 | 0 → 0 |
| large-few/tracked-small | 241 → 241 | 0 → 0 | 0 → 0 | 6 → 5 | 0 → 1 | 0 → 0 | 1 → 1 |
| large-few/tracked-near-bound | 1626182 → 1626182 | 0 → 0 | 0 → 0 | 6 → 5 | 0 → 1 | 0 → 0 | 1 → 1 |
| large-few/untracked-multiline | 510180 → 510180 | 0 → 0 | 0 → 0 | 7 → 5 | 0 → 2 | 0 → 0 | 1 → 1 |
| large-few/concurrent-same-4 | 964 → 964 | 0 → 0 | 0 → 0 | 24 → 20 | 0 → 1 | 0 → 0 | 4 → 1 |
| large-few/concurrent-different-2 | 416 → 416 | 0 → 0 | 0 → 0 | 12 → 10 | 0 → 2 | 0 → 0 | 2 → 2 |
| many-changes/list | 157241 → 100728 | 2001 → 0 | 2000 → 2000 | 5 → 5 | 4 → 3 | 1 → 0 | 0 → 0 |
| clean/list | 287135 → 222 | 10001 → 0 | 0 → 0 | 5 → 5 | 4 → 3 | 1 → 0 | 0 → 0 |
| clean/clean-path | 88 → 88 | 0 → 0 | 0 → 0 | 7 → 5 | 0 → 2 | 0 → 0 | 1 → 1 |

For 10,000 source files and four changed leaves, list payload falls 99.86% (287,366 to 398 bytes) and no ls-files process runs. Clean-list payload falls 99.92% (287,135 to 222 bytes). With 2,000 changed leaves, the remaining list is necessarily larger: 100,728 bytes versus 157,241 before, a 35.94% reduction. Status still inspects the repository; the changed-list operation is not guaranteed to scale only with the number of changes.

The four equivalent tracked-diff requests share one async diff process instead of four synchronous processes, while separate paths still execute two independent diffs. Each caller retains its five synchronous target capability probes. All measured tracked/untracked/clean diff response byte counts remain equal before and after. No completed-result cache is used; these repeated batches perform fresh work.

### Delayed-Git responsiveness

| Controlled 300 ms Git delay, 30 measured requests | Before | After |
| --- | ---: | ---: |
| Independent ping P50 ms | 346.71 | 0.68 |
| Independent ping P95 ms | 360.84 | 1.09 |
| Delayed diff P50 ms | 420.54 | 418.47 |
| Delayed diff P95 ms | 440.72 | 434.55 |
| Pings completed before diff completion | 0/30 | 30/30 |

The independent ping returns while async Git is still waiting in every optimized sample. Baseline synchronous Git stalls the independent route until diff work completes. Delayed diff timings remain comparable: Git has not become faster; its wait no longer blocks this lightweight route. Registry/history-dependent routes retain their independent blocking work.

### Verification boundaries

Both paired benchmark commands completed successfully, including all HTTP response/status checks and delayed-Git markers. File/changes semantics, failure cleanup, bounds and route-refresh races are covered by backend/frontend suites and browser acceptance outside this fixture. These data establish smaller changes-only responses, bounded async execution, in-flight sharing and event-loop responsiveness; they do not establish a full-page cold-start speedup or lower latency for every diff.
