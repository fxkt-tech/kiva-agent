# Execution plan

Planning only: final proposal review is required before task.py start or product edits. Prior task commit/merge/push permission does not authorize this task.

## Sequence
- [ ] Verify the supported transport matrix with a throwaway local-only probe: four configurable HTTP APIs, ChatGPT SSE, OAuth login/refresh, explicit direct under inherited proxy env and unchanged tool/CLI env. Confirm public provider registration/operation wrappers and isolated worker cancellation/credential staging. If infeasible, return to planning; do not patch private SDK internals or silently broaden process scope.
- [ ] Read settings/runtime/auth specs and record exact change boundary. Select/pin an explicit transport compatible with Node22.19; do not rely solely on --use-env-proxy introduced after the engine minimum. No broad SDK upgrade without evidence.
- [ ] Implement shared network policy/status/input types, installation storage/CAS/atomic writes and dedicated GET/POST settings endpoint. Default enabled only on supported macOS; unsupported platforms retain existing behavior. Test invalid/corrupt/stale/persistence failure paths before transport integration.
- [ ] Add bounded read-only native helper and resolver: static HTTP/CONNECT/direct, native bypass, loopback, no secret-bearing input, no PAC execution and explicit unsupported types. Validate tunneling semantics rather than deriving proxy TLS from the target's HTTPS label.
- [ ] Add scope-preserving model transport extension/adapter. Preserve tool/CLI environment, provider/model/auth fields and streaming/abort behavior; select controlled SSE for ChatGPT and prove no uncontrolled WebSocket path remains.
- [ ] Integrate provider-owned OAuth login/refresh worker (or verified public transport seam), private IPC, existing parent commit revision guards, device identity, prompts, cancellation/timeout and actual callback cleanup.
- [ ] Integrate save publication and idle-owner reconfiguration. Persist once, mark future owners stale safely, retain current runs/queues/UI requests/active login mode. Prove no passive endpoint creates Pi or changes running ownership.
- [ ] Add Network settings UI toggle with pending/confirmed/error/conflict/status feedback and read-only rediscovery. No manual proxy/password editor or automatic external connectivity check.
- [ ] Run local routing/provider tests, required full checks and deterministic browser/runtime acceptance. Document protocol/platform/active-work limits and native helper overhead. Update executable specs and complete Trellis check before task-specific commit review.

## Test matrix

- Local direct server + recording HTTP forwarding/CONNECT proxy + fake model/auth endpoints. Count actual connections/requests rather than only asserted env variables. Never send real model keys/tokens to external endpoints.
- Enabled static system route, native DIRECT/bypass, disabled, absent OS proxy, invalid/unavailable helper, PAC/SOCKS-only/authentication/connection failure and no silent direct failover. Loopback, IPv4/IPv6 hosts, target query-token stripping and proxy-address sanitization.
- Upper/lower-case HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY and Node env-proxy flags; explicit policy wins for scoped requests, child tool/standalone CLI environment stays identical. Check Node22.19 and current runtime.
- OpenAI completions/responses, Anthropic, Google HTTP/SSE, ChatGPT subscription SSE, auth refresh and backend login. Request/response headers/body/abort streaming preserved; provider-specific unsupported capability fails before an uncontrolled send. No custom-fetch-only claim of WS coverage.
- Save while streaming, pending/queued/extension input, idle cached owner, new owner and ongoing login. No forced abort/reset/history migration; correct revision applied at safe boundary and feedback truthful. Cancel/retry login releases callback1455 and worker resources before retry.
- Missing/corrupt/settings symlink/nonregular, stale revisions/two tabs, atomic write errors and late GET versus confirmed save. GET never creates config or performs provider traffic. Secrets never in config/helper argv/UI/error/log output.

## Required checks

```sh
pnpm typecheck
pnpm test
pnpm web:build
git diff --check
python3 .trellis/scripts/task.py validate .trellis/tasks/10-24-system-proxy-preference
```

Use temporary installation roots, injected OS directives and local servers. Real native smoke test is read-only and reveals no addresses/credentials; do not alter OS proxy settings. Browser-check Network control/pending/conflict/save failures/status and persistence in desktop/mobile light/dark with deterministic adapter, no paid prompts. Save/restore the existing next-env.d.ts contents around build if regenerated. Stop only fixture-owned processes.

## Review and rollback

Highest-risk boundaries: direct-mode enforcement across SDK fallbacks, model versus tool scope, target HTTPS versus CONNECT proxy transport, OAuth refresh/cancel ownership and safe runtime generation publication. Review these before claiming completion. Revert coordinated API/transport/UI changes together; do not rewrite auth/model/history data as rollback.

## Unrelated working-tree files
During planning, hexagon-playground.html and triangle-trisection.html appeared as untracked parallel work. They were not created by this task; do not modify, stage or include them. The existing web/next-env.d.ts change is also outside scope.
