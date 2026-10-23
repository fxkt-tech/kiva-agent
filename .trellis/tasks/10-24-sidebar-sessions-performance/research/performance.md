# Sidebar session-list performance

## Method and reproduction

Harness: `web/server/fixtures/sidebar-performance.ts`. It serves actual scoped HTTP handlers against temporary Git/installation roots. A RuntimeManager is present but its adapter factory throws if acquired; the benchmark never invokes Pi/model services or contacts/restarts the user's server.

The baseline is fixed commit `86fc5ce0aeffa30376fde1122805422c37d0c0b7`. Temporary closed snapshots contain transport, repository, catalog, registry and raw-JSONL support so old catalog/repository imports cannot acquire the new summary implementation. The optimized composition uses current source copies. Only import locations (including pinned-package ESM URLs) and a counter at the private `projectTranscript` entry are changed in temporary code; production files are untouched. Counters add fixture instrumentation overhead, so paired measurements are not production latency guarantees. This counter confirms both baseline projection work and the absence of it on the optimized route.

Run sequentially, with no competing builds/tests:

```sh
pnpm --dir web exec tsx server/fixtures/sidebar-performance.ts baseline /tmp/kiva-sidebar-performance.json
pnpm --dir web exec tsx server/fixtures/sidebar-performance.ts after /tmp/kiva-sidebar-performance.json
```

Each HTTP case records its first uncached scan separately, then five warm-up batches and 30 measured batches. P50/P95 use nearest-rank percentiles. “First uncached” records the first batch of each case, with no completed server snapshot cache; an active-list case is the first HTTP scan of that newly composed project, while later concurrency cases may follow earlier scans in the same process. It does **not** mean the OS cache was cleared. Fixture creation already warms filesystem pages. Repeated requests must also inspect disk afresh; a completed-read append check verifies that visible preview changes are not hidden by cached results.

Baseline sidebar requests use the old `/sessions` response containing three full-resource collections. Optimized sidebar requests use `?collection=active` and the lightweight row DTO. Concurrent active/archive/trash consumers use three legacy requests before versus three scoped requests after. Different response shapes are intentional; reduced wire data must not be confused with skipping identity checks.

History counters cover actual synchronous full-file reads before and final async `SessionListReader({readChunk})` descriptor reads after. Descriptor paths are mapped explicitly so metadata reads are counted separately; an assertion fails if mapping is absent. The seam is supplied through the repository's real `sessionLists` constructor option. Projection and Git counters are per whole request batch; async parser chunks count bytes without counting each chunk as a new transcript read.

## Fixtures

- Twenty active histories with 250 valid parent-linked user messages of 4,000 characters each, recreating the prior approximately 20 MB scenario. Messages contain IDs, timestamps and array text so the old projection receives real conversation records.
- Two hundred small active histories with ten 100-character messages each.
- One large active transcript with 5,000 4,000-character messages.
- One active transcript containing a single 20,000,000-character user record, exposing the remaining large-record CPU cost.
- Twenty histories split into five active, ten archived and five trash entries. An active request still requires every identity-relevant collection's full bytes in the first iteration.
- One hundred metadata-only empty sessions, no transcripts.
- Three independent projects with five small histories each, requested together on one transport; both all-project batch completion and the selected project's HTTP response are measured. Actual client priority scheduling and rendered first-ready timing are checked separately by the parent browser acceptance.

Each root is a committed temporary Git repository with `.kiva` ignored. The raw JSON report records exact counts/bytes, environment and generated root paths. Temporary roots remain available for the optimized run; remove only the report-recorded fixture root when finished.

## Delayed-read responsiveness

The HTTP server and client run in separate processes. Baseline's first transcript `readFileSync` is held for 300 ms; the optimized final `readChunk` seam is held for the same interval. A per-request marker proves that the actual read path was reached. The independent client waits for that marker before requesting a lightweight `/__ping` route. This tests server responsiveness while filesystem work is pending without accidentally blocking the client or patching a stale captured helper.

The ping route bypasses Git/registry/history work; ordinary application routes retain their own ownership costs. Full list duration includes all remaining work, not only the injected wait. The child process is fixture-owned and stopped after measurement.

## Boundaries

These measurements exclude Next startup/assets/rendering and OS-cold behavior. Parent browser measurements cover real first usable rows and UI request counts. Removing repeated projection/scans does not skip complete identity parsing of archived/trash histories. A giant JSON record still requires a single CPU parse; streaming/yields between chunks do not make that individual parse preemptible. Registry capability and authoritative detail/lifecycle reads remain independent work. No persistent index or completed server snapshot cache is introduced.

## Results

Environment: Node v24.14.0, git version 2.55.0, darwin 27.0.0, Apple M1 Pro. Five warm-ups and 30 repeated measured batches; local temporary filesystem, OS cache not cleared. Raw data: `research/performance-results.json`.

### First uncached and repeated HTTP latency (milliseconds)

| Batch | First before | First after | Before P50 | After P50 | Before P95 | After P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20-histories/active | 630.33 | 147.63 | 599.67 | 105.81 | 637.44 | 122.42 |
| 20-histories/same-project-three-collections | 1801.09 | 165.69 | 1775.09 | 165.54 | 2170.56 | 198.62 |
| many-small/active | 467.54 | 79.10 | 447.86 | 80.17 | 500.84 | 84.61 |
| one-large/active | 573.61 | 108.55 | 603.57 | 110.33 | 710.92 | 155.72 |
| giant-record/active | 520.84 | 144.46 | 522.64 | 101.38 | 593.82 | 115.94 |
| collections/active | 564.33 | 116.49 | 569.63 | 108.71 | 698.57 | 112.48 |
| metadata-only/active | 426.03 | 61.23 | 404.03 | 59.80 | 452.37 | 61.70 |
| multi-project/three-active | 1369.71 | 108.62 | 1370.89 | 102.91 | 1921.05 | 106.31 |

The 20-history request has 82.4% lower repeated P50 (599.67 to 105.81 ms). These are instrumented local HTTP values, not a full-page or OS-cold performance guarantee. No case showed a P50/P95 latency regression in this run; first-scan values are individual observations, not statistical cold-start percentiles.

### Actual read/projection work per batch

| Batch | History reads before → after | History bytes before → after | Full projections before → after | Metadata reads before → after | Sync Git before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20-histories/active | 120 → 20 | 125515740 → 20919290 | 60 → 0 | 0 → 0 | 65 → 5 |
| 20-histories/same-project-three-collections | 360 → 20 | 376547220 → 20919290 | 180 → 0 | 0 → 0 | 195 → 15 |
| many-small/active | 1200 → 200 | 3582540 → 597090 | 600 → 0 | 0 → 0 | 65 → 5 |
| one-large/active | 6 → 1 | 125567760 → 20927960 | 3 → 0 | 0 → 0 | 65 → 5 |
| giant-record/active | 6 → 1 | 120002196 → 20000366 | 3 → 0 | 0 → 0 | 65 → 5 |
| collections/active | 120 → 20 | 125515620 → 20919270 | 60 → 0 | 0 → 0 | 65 → 5 |
| metadata-only/active | 0 → 0 | 0 → 0 | 0 → 0 | 300 → 100 | 65 → 5 |
| multi-project/three-active | 90 → 15 | 268290 → 44715 | 45 → 0 | 0 → 0 | 195 → 15 |

There are no asynchronous Git processes in either list path; retained target capability checks remain synchronous. For the 20-history fixture (20,919,290 source bytes), the old request makes six full byte passes, while the new request reads every transcript once and builds zero conversation projections. Three simultaneous collection reads previously made eighteen byte passes; they now share one project snapshot. Metadata-only sessions are read once instead of three times. The optimized later-completed-read append test also passes, demonstrating that repeated rows are not merely served from a completed snapshot cache.

### Wire projection and complete rows

| Batch | JSON bytes before → after | Returned rows before → after |
| --- | ---: | ---: |
| 20-histories/active | 7857 → 7196 | 20 → 20 |
| 20-histories/same-project-three-collections | 23571 → 7271 | 60 → 20 |
| many-small/active | 78617 → 72016 | 200 → 200 |
| one-large/active | 427 → 393 | 1 → 1 |
| giant-record/active | 427 → 393 | 1 → 1 |
| collections/active | 7870 → 1821 | 20 → 5 |
| metadata-only/active | 27517 → 24216 | 100 → 100 |
| multi-project/three-active | 5961 → 5463 | 15 → 15 |

The active/archive/trash fixture intentionally changes from all 20 legacy rows to the five requested active rows, while still reading **all 20 histories / 20,919,270 bytes** for exact identity checks. The concurrent-three-collections batch returns 20 total rows instead of three redundant copies of all 20. The many-small fixture still exposes every one of its 200 active sessions; no row cap or search truncation is introduced.

### Multiple projects and delayed filesystem wait

| Three simultaneous project reads | Before P50 / P95 ms | After P50 / P95 ms |
| --- | ---: | ---: |
| Selected project HTTP response ready | 1347.89 / 1920.79 | 102.75 / 106.02 |
| All three responses complete | 1370.89 / 1921.05 | 102.91 / 106.31 |

This is selected-response readiness in an immediate HTTP batch, not a test of the browser priority scheduler or rendered sidebar. Parent browser acceptance measures those separately.

| First filesystem read held for 300 ms, 30 samples | Before | After |
| --- | ---: | ---: |
| Independent ping P50 ms | 781.61 | 1.16 |
| Independent ping P95 ms | 831.93 | 1.52 |
| List P50 ms | 914.09 | 395.38 |
| List P95 ms | 978.27 | 414.40 |
| Pings completed before list | 0/30 | 30/30 |

The optimized independent route returns while the final async file-read seam is waiting in every measured sample. The baseline route remains blocked through its synchronous read/projection chain. The delay is applied once per request, not once per file/chunk; all subsequent work remains real.

### Remaining costs and interpretation

- Every new uncached snapshot still scans the entire project identity inventory, including non-requested collections. Twenty active histories still cost 20.92 MB of I/O; selecting five active histories in a mixed-collection project does not reduce that cold identity byte volume.
- The single giant-record fixture contains 20,000,366 source bytes and takes after P50 101.38 ms / P95 115.94 ms for the whole request. These values include registry and I/O work; this harness does not isolate the duration of JSON.parse or maximum event-loop pause. A single large complete record cannot be preempted by yields between chunks.
- Five synchronous target Git capability probes per HTTP request remain. Three projects still perform fifteen probes and read their independent snapshots. Global picker, authoritative session detail/workspace ownership and lifecycle validation are separate costs, not removed here.
- First scan and repeated scans both read complete current data; there is no persistent index or completed server cache. Timings vary with OS caches, storage, parsing and host load. A validated exact summary index would require a separately reviewed freshness/ownership contract.

### Validation boundary

Both baseline/after commands and their HTTP-status, descriptor-mapping, append-freshness and delay-marker assertions pass. Production browser first-ready timing and UI demand/request counts are recorded separately by the main session, using paired DOM-observer timestamps rather than expect-polling delays. Functional identity, file substitution, mutation generations, shared client demand and lifecycle behavior are validated by the implementation/review suites outside this benchmark.


## Paired production sidebar DOM readiness

The parent separately measured the same temporary project/history files (20,725,500 bytes) with baseline 86fc5ce production UI/API versus the final rebuilt production UI/API. A MutationObserver records when 20 sidebar rows attach; assertion polling is excluded. Five warmups and 30 measured navigations per side, with no competing heavy checks.

| Sidebar DOM-ready navigation | Before ms | After ms |
| --- | ---: | ---: |
| P50 | 940.60 | 482.70 |
| P95 | 987.10 | 492.30 |

P50 is 48.7% lower in this fixture. These data concern sidebar DOM attachment in this local scenario, not OS-cold storage or every application feature. Both sides issue one list GET per navigation; sidebar/content request sharing and multi-project priority are separate behavioral checks. See browser-performance.md and browser-{baseline,after}-results.json for source/build provenance, exact samples and limits.
