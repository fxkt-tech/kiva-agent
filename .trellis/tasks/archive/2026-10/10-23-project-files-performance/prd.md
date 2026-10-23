# Optimize project file directory loading

## Goal
Make `/projects/p_f6b0a5344b5dd964a3834ed5/files` usable sooner and keep selection responsive. Apply the same resource behavior to other projects and session workspaces. The user approved the final plan and requested implementation on 2026-10-23.

## Background
- `web/features/workspace/shell.tsx:74` requests project metadata while `web/features/files/workspace-browser.tsx:18` requests workspace data. Both handlers execute bootstrap (`web/server/scoped-transport.ts:134`).
- `web/server/bootstrap.ts:12` executes four synchronous Git commands, reads all active session histories before slicing to 30, and silently truncates files at 1,000. Its caller also enumerates every visible project's capabilities through registry.list.
- `web/server/session-catalog.ts:22` lists all transcript files; `:107` reads and parses each file. `web/server/workspace-registry.ts:128` performs synchronous capability probes.
- Inline mapping (`web/features/files/workspace-browser.tsx:28,38`) invalidates the tree's entries memo. No timings have been measured; these are structural findings.

## Requirements
- R1: Remove duplicate workspace enumeration and unrelated bootstrap history/model/recent-project reads from directory loading. Sidebar session-list reads remain independent.
- R2: Run workspace Git enumeration asynchronously and coalesce concurrent equivalent reads without sharing across unvalidated scopes or caching completed results.
- R3: File selection and preview completion must not rebuild an unchanged tree. Preserve expansion, keyboard navigation, focus, refresh and deep links.
- R4: Remove the silent 1,000-file cutoff. Return complete listings within explicit resource bounds; report overflow/failure rather than successful partial or empty data.
- R5: Preserve passive reads, canonical identity, session execution roots, raw filenames, subdirectory scoping, Git statuses, non-Git browsing and preview safety. Preserve sidebar relative times after bootstrap removal.
- R6: Measure reproducible before/after directory readiness, API latency, subprocess counts, transcript reads and tree builds, including independent sidebar/registry costs.

## Acceptance criteria
- AC1 (R1): Fresh file navigation enumerates the workspace once. Project metadata/project-workspace endpoints do not parse histories or inspect all registered projects. Session workspace ownership checks retain their history reads before enumeration. Report sidebar/global picker reads separately.
- AC2 (R2): No synchronous child-process waits in workspace enumeration. Same-root concurrent reads share work after scope validation; different worktrees stay isolated. Failures clean up in-flight entries; subsequent refresh reads current files.
- AC3 (R3): Selecting files and receiving previews does not rebuild the unchanged tree; listing/status changes do. Keyboard navigation, expansion, selected ancestors, refresh and Back/Forward work.
- AC4 (R4): A fixture exceeding 1,000 files exposes all supported entries. Empty Git output is valid and does not trigger filesystem fallback. Timeouts, overflow and permissions failures are explicit recoverable errors.
- AC5 (R5): Literal filenames, nested untracked files, cross-subdirectory renames, deleted paths, unavailable roots, both workspace modes and passive-runtime behavior retain existing contracts. Sidebar times do not all become “just now”.
- AC6 (R6): Report environment, fixture sizes, commands and sample counts with before/after P50/P95. Do not claim unmeasured speedups; investigate regressions before completion. AC1–AC5 are mandatory structural gates.

## Out of scope
Directory lazy loading, virtualization, persistent caches/indexes, filesystem watchers, session-history indexing, UI redesign and broad registry/lifecycle async conversion. Revisit only if measurement demonstrates a remaining dominant bottleneck.

## Approval and execution status
The final planning summary was approved by the user (开始实现) on 2026-10-23. No blocking product questions remain. Baseline timing and residual sidebar/registry costs are tracked in the performance research report.
