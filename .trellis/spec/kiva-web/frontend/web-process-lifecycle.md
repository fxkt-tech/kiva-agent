# Web Process Lifecycle

## 1. Scope / Trigger

The repository-root command `pnpm clear-web` gracefully closes this installation's Web server processes. Read this contract when changing Web start/stop scripts, process discovery, CLI feedback, or shutdown behavior. Existing Web shutdown hooks remain responsible for sockets, OAuth callbacks, and Pi runtime cleanup.

## 2. Signatures

- `pnpm clear-web` runs the repository-owned Node CLI under `bin/`.
- `pnpm web` and `pnpm web:start` retain their existing development/production startup behavior.
- No running matching server is a successful no-op. Discovery, permission and bounded shutdown failures return a nonzero status and an actionable message.

## 3. Contracts

Identify the actual Node entry script as this installation's canonical `web/server/server.ts`, resolving relative entries against the process's actual working directory and recognizing supported Node/tsx loader flags. Do not mistake a pnpm/tsx wrapper, eval command, another repository with the same basename, or a test fixture for the server entry.

The command works for existing server processes that started before this feature; it cannot require a newly introduced PID file or changed startup wrapper. Port numbers and names alone do not establish ownership. This installation's custom-PORT server instances are included, while another installation or unrelated listener is preserved.

Recheck canonical script identity and PID start time immediately before sending SIGTERM, and observe start time while waiting so PID reuse counts as the old server having exited. Treat processes that have already exited as completed. Wait for bounded normal termination so server cleanup hooks can run. Do not send implicit SIGKILL, sweep arbitrary process trees, or delete caches, credentials, history, worktrees, configuration or lock files.

The current implementation supports Linux through exact `/proc` argv/cwd/exe/start-time identity. Other platforms fail explicitly; do not add a lossy `ps` string matcher merely to claim portability. Platform/tool limitations must fail clearly rather than widen process matching. Use argument-based process APIs instead of interpolated shell commands. Process output/errors must not expose environment values or arbitrary command-line contents.

## 4. Validation & Error Matrix

| Condition | Outcome |
| --- | --- |
| No matching server / already stopped | Exit0; concise not-running feedback |
| Confirmed matching server exits after SIGTERM | Exit0; concise stopped feedback |
| Other installation, wrapper, eval process, unrelated listener | Preserve; do not signal based on partial matches |
| Process exits between discovery and signalling | Treat as stopped after confirming disappearance |
| Process identity changes before signalling | Preserve the new identity; never signal a reused PID blindly |
| Unsupported platform, missing discovery tool, unreadable required identity | Explicit nonzero failure; no broad fallback kill |
| Signal denied or graceful timeout | Truthful nonzero failure; no forced termination |

## 5. Good / Base / Bad Cases

- Good: identify a temporary installation's genuine Node Web-entry child, send SIGTERM, observe its cleanup/exit, and retain another installation's server.
- Base: repeated clear commands succeed when no server remains.
- Bad: `pkill -f server/server.ts`, `kill` of an arbitrary port owner, guessing a server PID from a wrapper command, or deleting `.kiva` to stop a process.

## 6. Tests Required

Use real disposable child processes for matching shutdown, already-stopped behavior, another installation/unrelated survival, relative entry/Node loader flags and paths containing spaces. Cover bounded timeout/permission/discovery outcomes where appropriate. Ensure children are cleaned up by the test harness without targeting the user's actual Web/auth process. Run root tests, applicable typecheck and diff checks; unchanged UI does not require another browser/build cycle.

## 7. Wrong vs Correct

Wrong: assume every process containing `server/server.ts` or listening on9495 belongs to this installation, then force-kill it.

Correct: canonical installation entry + actual Node process identity → recheck identity → SIGTERM → bounded completion and truthful CLI status.
