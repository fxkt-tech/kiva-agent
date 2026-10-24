# Network-boundary research

Current source baseline8ac861d, inspected2026-10-24. No network-policy changes or live proxy configuration inspection performed.

- web/server/pi-adapter.ts creates RpcClient children with inherited process.env. src/runtime.mjs does the same for standalone CLI runtime. Those are separate startup owners.
- Pi bash tool (installed core/tools/bash.js) spawns shell commands with provided env or getShellEnv(); simply setting proxy environment on the Pi process can leak that policy into tools. Scope must be explicit.
- web/server/provider-authorization.ts piAuthorization constructs an in-process ModelRuntime for provider-owned OAuth. This is separate from the Pi RPC child.
- Installed pi-ai node-http-proxy resolver honors protocol/all_proxy and no_proxy variables with process environment fallback, supports HTTP/HTTPS proxy URLs and rejects SOCKS/PAC URLs. An empty override is not a reliable force-direct signal because lookup uses fallback.
- Product currently has no macOS system-proxy reader or installation network setting. Browser preferences alone cannot govern backend traffic.
- Native Node environment proxy support does not itself discover macOS system settings. Official Node documentation lists enablement via NODE_USE_ENV_PROXY/--use-env-proxy and version constraints; repository Node minimum22.19 must not silently become22.21+ through design assumptions.

Primary references consulted:
- https://developer.apple.com/documentation/cfnetwork/cfnetworkcopyproxiesforurl%28_%3A_%3A%29 — target URL proxy resolution and related system-settings/PAC APIs.
- https://nodejs.org/learn/http/enterprise-network-configuration — environment-based Node proxy support and version constraints.

User confirmed OS-level macOS settings. Remaining highest-value decision is scope: Kiva-managed model/OAuth networking versus tool commands/standalone CLI. Do not promise to control Safari/Chrome login-page traffic or OS VPN/TUN routing from an application-level proxy switch.


Additional inspected public interfaces:
- pi-ai ProviderRequestOptions supports fetch/env injection for provider HTTP, explicitly excluding WebSocket transports; ChatGPT WebSocket path uses its own proxy resolver. A solution that only overrides fetch is incomplete.
- Provider-scoped empty env values fall back to process.env; removing a map key is not proof of direct connectivity.
- ExtensionAPI supports registerProvider(Provider) and ModelRegistry/ModelRuntime expose public provider composition surfaces. Prefer scoped provider transport adapters, not changing every subprocess environment or patching SDK private fields.
- Provider-owned OAuth login currently has interaction/options for cancellation/device identity but no observed generic fetch field at the application login call. Its isolation/injection seam requires feasibility verification before implementation; avoid temporarily swapping parent global transports during async login.
- RuntimeManager already has generation/idle safe-reacquisition patterns for configuration, which may inform network preference application without aborting active work. Do not casually reuse provider credential busy rules without a reviewed network policy.

User accepted model/backend-OAuth scope. Default policy is the next product decision; no implementation started.


Confirmed product default: user accepted default enabled, follow OS/no proxy means direct, and manual disabled means explicit application direct.

Read-only native feasibility probe:
- System flags inspection reported HTTP, HTTPS and SOCKS enabled, PAC/WPAD disabled; addresses/credentials were filtered out before output. This establishes that a static HTTP/CONNECT first release can cover the current HTTPS primary route; it does not promise SOCKS failover support.
- Direct JXA CF references were not JS arrays. Binding CFNetworkCopySystemProxySettings as id and CFNetworkCopyProxiesForURL as id(id,id) allowed ObjC.deepUnwrap to produce the proxy array using built-in osascript/Foundation/CFNetwork. No compiler or system setting mutation used.
- https://example.invalid produced kCFProxyTypeHTTPS followed by kCFProxyTypeSOCKS; http://127.0.0.1 produced kCFProxyTypeNone. No connection was made and endpoints were not disclosed.
- Local Apple SDK CFProxySupport.h lines315-316 explicitly describe kCFProxyTypeHTTPS as a tunneling proxy used for HTTPS. Target HTTPS must not be mistaken for TLS-to-proxy. Primary reference: https://developer.apple.com/documentation/cfnetwork/kcfproxytypehttps and https://support.apple.com/en-gb/guide/mac-help/mchlp2591/mac .
- Native helper should receive only a scrubbed destination origin via stdin, because some provider URLs can carry query credentials. Never interpolate target URLs into scripts/argv.

Provider feasibility constraints:
- ExtensionAPI/ModelRegistry allow public registerProvider(Provider); ModelRuntime/Provider operations expose request options. This is a candidate scoped seam, not yet an end-to-end routing proof.
- Current OAuthAuth.login/refresh APIs lack generic custom fetch options, motivating an isolated transport worker that retains provider-owned auth protocol and guarded parent commit. Worker feasibility/cancellation is a required pre-product implementation gate.
- ChatGPT WS proxy resolution is separate; first release proposes verified HTTP/SSE dispatch, not an untested WS override.
