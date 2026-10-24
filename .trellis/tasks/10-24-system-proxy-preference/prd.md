# macOS system proxy preference

## Goal
Add an installation-scoped setting deciding whether Kiva's model and backend authorization traffic follows macOS system proxy settings. User requested a plan; task creation and the product choices below are approved, implementation is not.

## Confirmed product decisions
- System proxy means macOS network settings, not merely HTTP_PROXY/HTTPS_PROXY environment variables.
- First-phase scope is Kiva-managed model requests and backend login authorization. Tool commands (curl/git/npm etc.), independent CLI and external browser networking retain their existing behavior.
- Default enabled: follow the system; if the system returns a direct route/no proxy, connect directly. Disabled: force application-level direct connections for in-scope traffic.

## Background and evidence
- pi-adapter.ts gives Pi RPC children inherited process.env; runtime.mjs separately launches standalone CLI. Setting process-wide proxy variables would also alter tool environments, violating scope.
- Installed pi-ai1.3.0 has provider-scoped fetch/env options; fetch injection explicitly does not cover WebSockets. Empty env overrides fall back to process.env, so clearing one variable cannot prove direct routing.
- provider-authorization.ts runs provider-owned OAuth in a separate in-process ModelRuntime without a generic fetch argument on oauth.login/refresh. Network isolation is needed to avoid changing the server's global transport.
- RuntimeManager already marks idle owners stale by configuration generation and reacquires only on explicit safe actions. Network settings must preserve running/queued work and passive reads.
- Read-only native probe succeeded: CFNetwork returned an HTTPS tunnel directive followed by SOCKS for a sample external origin, and DIRECT for127.0.0.1. No proxy address/credential was disclosed, no system setting changed and no external request was sent. See research/network-boundaries.md.

## Proposed first release boundary for final review
- Support macOS static Web/secure-Web proxy routes (HTTP forwarding/CONNECT) and native direct/bypass results. PAC/WPAD, SOCKS-only routing and proxy credential management are deferred and explicitly reported as unsupported; never silently skip an unsupported selected route or fall back on connection failure.
- Cover the existing configurable HTTP API families and ChatGPT subscription HTTP/SSE path. Use SSE for ChatGPT under the controlled transport until a verified public WebSocket-agent seam exists; do not claim a fetch override covers WebSockets.
- On non-macOS the new control is unavailable and existing networking remains unchanged; do not label that state as forced direct.

## Requirements
- R1: Settings > Network exposes Use system proxy, default enabled on macOS, saved atomically at installation scope and shared across tabs/projects/restarts. Reads do not create settings files.
- R2: Enabled mode resolves each destination's system route and honors native bypass/direct decisions. Disabled mode skips system discovery and bypasses inherited standard proxy variables/Node proxy defaults for in-scope connections.
- R3: Isolate model and OAuth transports. Do not mutate the Web server's process-wide proxy environment/global transport or alter tool/CLI environments. Include OAuth token refresh and every enabled model transport in coverage.
- R4: Save without aborting active runs/queues/login attempts. Running owners/attempts retain their captured policy; idle sessions adopt changes on the next safe explicit action, and new attempts/owners use the saved revision. UI states this timing truthfully.
- R5: Unsupported/unavailable discovery and proxy connection failures are actionable errors, not silent direct fallback. No system-configured proxy is a legitimate direct route. Loopback control/auth traffic remains usable.
- R6: Persist only version/useSystemProxy, not discovered proxy endpoints or credentials. Keep secrets, full request query strings and tokens out of helper arguments, status UI, logs and error messages. Proxy setting does not modify OS configuration, credentials, provider definitions or histories.
- R7: Verify actual routing with local target/proxy fixtures, covering inherited proxy env, bypass rules, HTTP CONNECT, all declared provider paths, auth cleanup, runtime transitions and tool/CLI isolation. No paid prompts or real sign-in credentials.

## Acceptance criteria
- AC1 (R1): Missing file defaults enabled without write; toggle persists across projects/restart. Stale-revision/invalid/corrupt/permission failures do not overwrite confirmed state; old GETs cannot undo a confirmed save.
- AC2 (R2): Fixture proxy observes enabled external model/OAuth traffic and direct target observes disabled/no-proxy/bypass traffic. Hostile-to-test upper/lower-case HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY and Node env-proxy enablement cannot override explicit mode. Real OS helper is read-only and timeout/output bounded.
- AC3 (R3): Tool subprocess environment and standalone CLI remain byte-equivalent for existing proxy variables. HTTP/SSE and OAuth login/refresh have routing tests. Unsupported adapters/transports never send an uncontrolled request; no parent-global async transport swapping.
- AC4 (R4): Saving during streaming, queued work, extension UI and an active login does not stop/clear them or release runtime ownership. New idle action/attempt adopts the new revision; old work is not mislabeled as immediately switched. Settings GET/prefetch never acquires Pi.
- AC5 (R5): Native NONE means direct; selected unsupported PAC/SOCKS/authenticated configurations and discovery/connection failures show explicit states. System bypass and loopback remain correct, including local models/auth callback. Do not disable TLS verification to make a proxy work.
- AC6 (R6): No token/password/query secret appears in saved JSON, helper argv, projected settings or errors. Successful settings save does not rewrite models/auth/history/OS state. External-browser/VPN/TUN routing is not claimed to be controlled.
- AC7 (R7): Local fake-provider/proxy and deterministic adapters validate routing, abort/stream behavior and safe application timing. Browser checks the single toggle/pending/error/conflict/state feedback in desktop/mobile light/dark. Verify Node22.19 compatibility without silently raising the engine minimum.

## Out of scope
Tool-command/standalone CLI policy, OS/browser/VPN/TUN configuration, manual proxy URL/password editing, PAC/WPAD/SOCKS implementation, system keychain credential extraction, real-provider connectivity tests and unrelated settings/runtime refactoring.

## Planning status
Product defaults/scope are confirmed. The explicit release boundaries above are part of the final proposal awaiting approval. Technical transport feasibility is a required implementation gate; inability to enforce the declared scope returns the task to planning rather than delivering an ineffective toggle. No product code changed.
