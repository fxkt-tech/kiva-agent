# Loading-chain evidence

Static inspection on 2026-10-23; no measured timings or live-server probes.

- Shell fetch: web/features/workspace/shell.tsx:74; bootstrap context at :136.
- Directory fetch and unstable entries: web/features/files/workspace-browser.tsx:18,28,38.
- Duplicate bootstrap handlers and eager registry.list: web/server/scoped-transport.ts:134-138. Session workspace handler resolves its root at :164-166.
- Four sync Git commands, 1,000-file slice and history/model checks: web/server/bootstrap.ts:12-44.
- Full history parsing: web/server/session-catalog.ts:22-28,107.
- Registry list/resolve capability probes: web/server/workspace-registry.ts:32,37,128. A ready project probe runs Git version, top-level, HEAD, common-dir and symbolic-ref. Bootstrap's four commands are not the total page cost.
- WorkspaceTree builds/sorts under useMemo(entries), mounting only expanded descendants: web/features/files/workspace-tree.tsx.
- Only non-file bootstrap UI dependency found is sidebar relative-time calculation: web/features/sessions/collections.tsx:49. Its current fallback compares updatedAt to itself.
- Existing bootstrap.test.ts asserts raw names, individual nested untracked entries and scoped cross-boundary rename behavior; retain those assertions against the new reader.
- BootstrapData is an internal wire shape in shared/types.ts, with shell/browser consumers and related fixtures; no persistent bootstrap schema was found.

Existing sidebar/session repository reads can remain expensive independently. Separate them from removed bootstrap work when measuring. The current proposal does not claim a fully nonblocking request chain.
