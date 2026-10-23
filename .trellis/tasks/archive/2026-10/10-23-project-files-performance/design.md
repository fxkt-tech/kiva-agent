# Project directory loading design

## Resources and boundaries
Keep routes and visible tree behavior. `GET /api/projects/:id` returns `{ project }` without bootstrap. `GET .../workspace` returns shared `WorkspaceData = { renderedAt, project: { name, path, branch, dirtyFiles, files, changes } }`. Define this type in shared types/contracts. Omit sessions, model/runtime checks and recentProjects. Preview endpoints keep existing safety and buffer limits.

Resolve session execution roots through existing ownership checks before enumeration; never fall back to the source root on resolution failure. Directory readiness does not depend on sidebar session-list completion. Global picker reads remain separate.

Update server, shell/browser consumers and fixtures together. Remove bootstrap context and dead bootstrap code once no consumers remain. Session relative times use a stable render/refresh timestamp independent of workspace reads; never compare updatedAt to itself and do not add polling solely for this change. No persisted schema migration is needed. Coordinated deployment requires old tabs to refresh; incompatible shapes must show recovery rather than incorrect data.

## Async reader
Extract workspace enumeration using argument-array async child-process APIs with bounded buffers and timeout. Preserve NUL-delimited filenames, rename source/destination handling and execution-root prefix parsing. Run independent commands concurrently. Reuse validated target capability when appropriate, but read live branch/status from the actual execution root.

Distinguish valid empty output from failed Git commands. Explicit non-Git/missing-Git capability selects an async filesystem fallback preserving existing ignored directories and symlink policy. Git failures must not trigger a broader filesystem scan. Remove the file-count slice and fallback counter. Initially preserve the existing 8 MiB per-command bound, expose overflow and use a proposed 15-second timeout validated against the large fixture; limits must not silently truncate successful responses.

Use a reader-owned in-flight Promise map after scope validation, keyed by canonical execution root plus captured filesystem identity. Root replacement cannot reuse an old directory result. Shared-current-branch scopes may share only after successful independent ownership resolution; owned worktrees have separate keys. Remove the matching Promise in finally after success/failure. Completed results/errors are not cached. One client disconnect must not abort shared work for another consumer; backend timeout bounds the operation.

Git reads are not an atomic snapshot, matching current behavior; refresh corrects concurrent external edits.

## Frontend work
Memoize status mapping and file entries by source data references. Preserve the tree's entries memo and scope/view key. Path/preview changes affect selection, not listing identity. Keep expansion and focus behavior. Same-scope refresh may retain old data while pending; never display old-scope results under a new route, and retain visible errors.

Collapsed descendants already avoid DOM mounting. Measure tree construction and expanded-node rendering separately before proposing virtualization. Do not add a general resource cache.

## Residual cost and compatibility
Registry.resolve still performs synchronous identity/capability checks; the global picker and sidebar have independent reads. This iteration removes duplicate workspace scans and bootstrap dependencies, not all server blocking. Measure residual paths without weakening lifecycle ownership validation or rewriting unrelated synchronous APIs.

Preserve literal-path, subdirectory, passive-runtime, preview and ownership contracts from workspace-routing.md. No history, registry or project-file changes are part of optimization. Preserve the pre-existing web/next-env.d.ts working-tree edit.

## Rollout and rollback
Validate using temporary repositories and deterministic adapters before checking the real route. Do not restart live user servers with active runtime owners. Ship typed API and consumers as one compatibility unit; reverting it needs no data migration or filesystem rollback.
