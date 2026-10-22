# Research: Running composer runtime queue seam

- Query: Trace `steer` / `follow_up` submission and projection; establish queue identity, ordering and attachment fidelity; determine whether individual delete/edit/promote actions can be safe without clear-and-requeue races.
- Scope: Internal repository plus the installed, pinned Pi 1.3.0 implementation and primary upstream documentation. No implementation, runtime commands, paid prompts, service/cache changes or Git operations performed.
- Date: 2026-10-22

## Findings

### Decision-relevant result

The current contract supports enqueueing a steering/follow-up message and clearing **both queues in full**. It does not support an individual delete, edit, reorder or move-to-steer operation. Queue snapshots/events contain only two arrays of text. They have neither stable item identity nor attachment metadata. Reference-inspired read-only cards can use the current projection; working per-message destructive/change-mode controls require a deliberately expanded runtime contract or a different queue owner. This is a product-scope decision, not a CSS detail.

Do not implement individual actions by clearing Pi's queue and reconstructing it from a browser snapshot. The consumer runs independently, there is no item ID, and the image payload cannot be reconstructed from that snapshot. Serializing Kiva HTTP requests alone does not make those operations atomic with Pi's dequeue.

### Files found and their responsibilities

| File | Responsibility / relevant anchors |
| --- | --- |
| `web/features/sessions/composer.tsx:84` | Captures source draft and attachment objects, optimistically clears that draft, dispatches running submissions to `queueMessage`, and restores the captured source on error (`:98–103`). |
| `web/features/sessions/drafts.ts:3` | Per-tab, project/session-keyed draft storage containing text and full attachments; not persistent or cross-tab shared (`:6–19`). |
| `web/lib/use-runtime.ts:108` | Scoped JSON POST command transport. `queueMessage` splits attachment kinds into images/files (`:137–139`); `clearQueue` and `abort` only dispatch their respective commands (`:127–145`). |
| `web/shared/runtime-types.ts:46` | `RuntimeQueue = { steering: string[]; followUp: string[] }`. Attachment contracts are separate (`:51–65`); command union and shared boundary guard expose only enqueue and clear-all queue operations (`:102–116`, `:153–175`). |
| `web/server/scoped-transport.ts:144` | HTTP `/commands` validates with `isRuntimeCommand`, awaits manager dispatch and returns 202. No independent per-item queue endpoint exists. |
| `web/server/runtime-manager.ts:51` | Owner selection, command acceptance and provider-admission logic; existing-owner abort/clear/UI and running queue submissions can bypass provider-file saves (`:54–55`, `:106–110`). |
| `web/server/runtime-hub.ts:18` | Adapter interface; queue APIs are `steer`, `followUp`, `clearQueue` (`:35–38`). Hub caches queue text, dispatches enqueue/clear (`:224–236`), and projects queue events (`:319–323`). |
| `web/server/pi-adapter.ts:58` | Exact Pi RPC delegation for steer/follow-up/clear-all. Converts images to Pi image content (`:72–74`); it does not preserve queue-item metadata. |
| `web/server/event-stream.ts:20` | Scope/stream/sequence event identity and ordered replay. These identify state updates, not individual queued messages. |
| `web/server/fixtures/deterministic-adapter.ts:6` | Injectable, no-model runtime fixture with manually emitted events. Suitable for UI/race tests after extending fidelity where needed. |
| `agent/extensions/kiva.ts:4` | Project extension only registers a status command; no custom queue-control bridge exists. |

### Current end-to-end contract

1. The composer derives running from `runtime.status === "running"` (`composer.tsx:54`). It captures the draft object, configuration and source key, clears only that source draft, then calls `runtime.queueMessage(text, queueMode, attachments)` when running (`:84–103`). The choice is initialized from the browser preference once (`:41`).
2. The hook sends `{ type: "steer" | "follow_up", message, images, files }` to `/api/projects/:projectId/sessions/:sessionId/commands` (`use-runtime.ts:108–117`, `:137–139`). Queue submission has no request/item idempotency key or returned item identifier.
3. The shared guard accepts the message string and bounds each optional attachment array (`runtime-types.ts:163–175`); any new command requires changing this shared contract, not a feature-local cast.
4. The manager resolves the exact owner. Its scope lock covers command **acceptance**, deliberately releasing before a pending RPC/model run finishes (`runtime-manager.ts:87–110`). A running queue command that waited until the owner becomes idle is rejected with `session_changed` (`:68–71`). Preserve this behavior in any new control path.
5. The hub trims message text and requires text or attachments. Text files are serialized into `<attached_file name="…">…</attached_file>` prompt blocks; image data is passed separately (`runtime-hub.ts:224–229`, `:516–519`). Attachment-only input uses `请查看附件。`.
6. The Pi adapter forwards through the pinned RPC client (`pi-adapter.ts:58–61`). Pi input handlers may consume or transform the message, and skills/prompt templates may expand its text. A successful enqueue response therefore does not prove the original string remains in a queue.
7. Pi emits `queue_update` as two current text arrays. The hub replaces its cached arrays, and the browser replaces `snapshot.queue` from that event (`runtime-hub.ts:319–323`; `use-runtime.ts:249–256`). Enqueue does not optimistically create a timeline user message. A user message enters the timeline when Pi emits `message_start` (`use-runtime.ts:203–212`).
8. Clear-all calls Pi, discards its returned text arrays, sets the hub cache empty, then publishes a snapshot (`runtime-hub.ts:234–247`). Kiva returns only `{ accepted: true }`; it has no restore-to-editor result (`runtime-types.ts:118–120`).

### Identity, ordering, attachments and reconnect

- **No stable queue item ID:** strings may be duplicated, and array indices shift when earlier entries are delivered. Text/`index` is not a safe mutation target. Timeline message IDs (`RuntimeMessage.id`) are unrelated to pending queue entries.
- **Order within one lane exists:** Pi appends to steering or follow-up arrays. The two arrays do not encode one global submission order, timestamps, attachment names or source tab. A UI may present lane order, but cannot claim recovered chronological order across both lanes.
- **Delivery has priority semantics:** steering is delivered after the current assistant turn's tool calls, before the next model call; follow-up waits until no tool calls or steering work remain. It is not a forceful instantaneous abort. Pi has separate `all` / `one-at-a-time` lane-draining settings; Kiva does not expose them through `RuntimeCommand`.
- **Display and payload diverge:** text-file contents are embedded in the queue text; image contents/names are absent from queue events. Normal timeline display collapses text-file blocks to `[附件: name]` (`runtime-hub.ts:522–533`), but the raw queue projection does not. Cards need an explicit display projection if they should show concise attachment labels rather than raw text-file bodies. Avoid reusing display-formatted text for sending.
- **A browser-only mirror is insufficient:** source drafts are cleared on acceptance; another tab has none of their original bytes. A refresh/reconnect gets server queue text, not attachment bytes. Pi transformations can change the text, and identical submissions cannot be reconciled reliably by text matching.
- **Stream IDs/sequences solve update replay:** the wire contains project/session/stream/seq (`runtime-types.ts:128–135`), and the hook rejects stale/wrong-scope events (`use-runtime.ts:65–87`). They do not solve per-item identity.
- **Runtime recovery is scoped:** for real owned sessions (`expected` present), child-process recovery clears queue/UI state and marks the run interrupted rather than replaying it (`runtime-hub.ts:430–451`). The older unscoped branch replays text arrays; do not infer that production retains queue attachments across process replacement.
- **Abort and clear-all are different:** the hub sends only `adapter.abort()` on stop (`runtime-hub.ts:191–192`). Installed Pi `AgentSession.abort()` does not call `clearQueue()` (`dist/core/agent-session.js:1942–1952`). Consequently, do not infer “stop removes pending messages” from the deterministic fixture, whose `settle()` currently empties both queues (`deterministic-adapter.ts:13`, `:31`). Changing stop/queued-message behavior needs an explicit decision and pinned-runtime validation.

### Installed Pi 1.3.0 evidence

Both package manifests pin `@earendil-works/pi-coding-agent` to `1.3.0`. The following paths are under `web/node_modules/@earendil-works/pi-coding-agent/`; they are read-only reference material, not files to change:

- `dist/modes/rpc/rpc-types.d.ts:14–35`: enqueue carries optional RPC correlation `id`, message and images; clear-all has no item target. RPC correlation IDs identify responses, not queued entries.
- `dist/modes/rpc/rpc-client.js:142–164`: `steer`, `followUp`, `clearQueue`; first two return a disposition, last returns removed text arrays.
- `dist/modes/rpc/rpc-mode.js:319–332`: dispatches straight to `session.steer`, `session.followUp`, `session.clearQueue`; `get_state` exposes only `pendingMessageCount` (`:345–359`).
- `dist/core/agent-session.js:1723–1738`: input handlers and expansions run before enqueue; returns `handled` or `queued`.
- `dist/core/agent-session.js:1766–1789`: appends text to display arrays, but puts full text/image messages into the core agent queue. These are distinct representations.
- `dist/core/agent-session.js:655–660`: `queue_update` carries only string arrays.
- `dist/core/agent-session.js:730–747`: on a user `message_start`, removes the first matching text from steering first, then follow-up, and emits a queue update before publishing that start. This is not an ID-based dequeue acknowledgement; image-only/duplicate/transformed cases require care if new identity semantics are added.
- `dist/core/agent-session.js:1915–1934`: clear-all synchronously snapshots text, clears both display arrays and core queues, then publishes; exposes read-only text getters but no individual mutation.
- The transitive `@earendil-works/pi-agent-core@1.3.0` `dist/agent.d.ts:89–102` exposes enqueue, lane clear/all-clear, `hasQueuedMessages` and a **next-turn preview**. It has no public individual remove/edit/move or full stable-ID snapshot API. Accessing private queue fields would bind Kiva to implementation internals and still require an atomic consumption contract.

### Safe scope choices (inferences, not approved requirements)

| Scope choice | Consequence |
| --- | --- |
| Presentation and stable send/stop slot only | Existing runtime is sufficient. Cards may show current queued text/lane and retain a clearly labelled clear-all action; omit unsupported per-item actions. Do not turn a trash icon into undocumented clear-all. |
| Full reference behavior with delete/edit/promote | First add runtime-owned stable item IDs, display text plus full retained payload, and atomic target-item mutation/dequeue semantics. API should reject a consumed/stale target and never fall back to matching by text/index. Queue revision or source stream identity should bind a command to current state. The current Pi RPC cannot provide this by wiring an extra HTTP route alone. |
| Kiva owns editable pending work before delivery | Can permit safe changes while entries remain in Kiva, then forwards them once at a defined execution boundary. This is a separate queue-ownership design: it must preserve steer/follow-up timing, multi-tab state, lifecycle/admission/capacity, consumption acknowledgement and extension-input behavior. It must not merely become a local per-tab visual mirror. |

Clear-and-requeue risk details: a stale client snapshot can re-add an entry Pi already consumed; clearing and later enqueuing allow the engine to observe an empty queue and settle/change boundary; new tab submissions can interleave; only text is returned, so images are lost; re-running input handlers/templates can change behavior again. Using clear-all's actual returned arrays avoids one stale-snapshot duplicate case but does **not** fix identity, payload fidelity or the empty-queue window. The current manager acceptance lock does not pause Pi's independent consumer.

### Existing tests and useful extension points

| Test / fixture | Existing coverage and limitation |
| --- | --- |
| `web/server/workbench-interactions.test.ts:493` | Failed send produces one error and preserves draft. |
| `web/server/workbench-interactions.test.ts:504`, `:516`, `:530` | Draft/attachment navigation isolation; failed async submit restores into captured source; stale reads/events ignored. Reuse for pending queue mutations and edits if approved. |
| `web/server/workbench-interactions.test.ts:553–588`, `:718` | Actual Enter/Mod+Enter dispatch, IME/repeat/disabled handling and running queue mode; preference initializes once and does not overwrite current choice. |
| `web/server/workbench-interactions.test.ts:860–882` | Running queue text plus `clear_queue`/`abort` scoped dispatch and disabled model controls. It does not validate individual operations or actual Pi dequeue. |
| `web/server/runtime-hub.test.ts:90`, `:102`, `:269` | Trim/empty/abort, prompt image/text-file forwarding and queue enqueue/event/clear-all. Existing attachment test is prompt-specific; running queue attachment cases need coverage if the seam changes. |
| `web/server/runtime-hub.test.ts:307–333` | Unscoped recovery replay of strings. Do not treat as scoped attachment recovery evidence. |
| `web/server/runtime-manager.test.ts:57`, `:101`, `:181` | Queue marks owner busy for provider mutation; idle queue acceptance obeys provider-save admission; pending RPC does not block abort/steer. New queue controls must preserve these properties. |
| `web/server/event-stream.test.ts:6`, `:20`, `:30`, `:49` | Ordered replay, old-process cursor rejection, history-gap resync and incarnation rotation. |
| `web/server/scoped-transport.test.ts:282–288`, `:323–324` | Multiple-session running isolation, target abort, identity-changing command rejection and cross-origin rejection. |
| `web/server/pi-adapter.integration.test.ts:23` | Installed Pi no-model compatibility probes: exact identity, extension handling/UI and drift quarantine. No existing individual queue mutation probe; a pinned-runtime compatibility check is needed if that seam is expanded. |
| `web/server/fixtures/deterministic-adapter.ts:13`, `:32–34` | No-cost controlled queued text/events. Its clearQueue returns the empty **post-clear** queue, whereas real Pi returns removed text; abort also clears queues unlike pinned Pi's separate abort/clear operations. Correct test fidelity only if new requirements depend on those results. |

Suggested regression cases if individual actions are approved: duplicate text in one/both lanes; images and text files including attachment-only input; target consumed immediately before mutation; event/HTTP-response reordering; concurrent tabs/additions; input handlers that consume or transform a submission; reconnect/scope switch while a mutation is pending; rejected changes preserve exact prior payload; no duplicate execution; stop/abort while pending; admission and capacity remain correct. This is recommended validation scope, not evidence of current failures.

## External references

- [Pi RPC command reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-commands.md), primary upstream, viewed 2026-10-22. Describes steering/follow-up timing, dispositions, clear-all text return and asynchronous event delivery. The web `main` branch can differ from pinned 1.3.0; local installed docs/source above are authoritative for this repository.
- Installed `web/node_modules/@earendil-works/pi-coding-agent/docs/rpc-commands.md:46–92`, `:94–129` and the package's `dist/` sources were inspected directly. No dependency upgrade is implied.

## Related specs

- `.trellis/spec/kiva-web/frontend/workspace-routing.md:23–27`: one owner per scope shared across tabs, queued work counts as active, scoped event identity, source-key capture and memory-only drafts/attachments.
- `.trellis/spec/kiva-web/frontend/global-settings.md:40`: queue preference initializes a composer, not queued work or an active override; `:62` requires abort/steer/follow-up/UI responses to bypass unrelated provider-file save waits.
- `.trellis/spec/kiva-web/frontend/visual-system.md:99`, `:107–109`: preserve shortcuts/IME/disabled submit semantics and actual scoped queue flow; retain attachment/queue controls and verify mobile bounds with no paid prompts.
- `.trellis/spec/kiva-web/frontend/component-guidelines.md:5–8`, `:32`, `:46`: features own business identity/requests/pending state; shared contracts stay in `web/shared`; meaningful async-race/scoped-request assertions plus real browser verification.
- `.trellis/spec/guides/cross-layer-thinking-guide.md`: define one shared event decoder/projection owner and tie derived state to authoritative source identity.
- `state-management.md`, `hook-guidelines.md`, `type-safety.md` still contain placeholders; they add no executable contract here.

## Caveats / Not Found

- No user decision yet establishes whether card `Steer` means promote a queued follow-up, submit a new correction, or merely indicate the existing lane. Delete/edit/overflow scope is also unconfirmed. Do not infer backend behavior from the screenshot icons.
- No current public per-item queue control, stable queue ID, full attachment snapshot, chronological cross-lane sequence or durable queued-work persistence was found.
- This research intentionally does not duplicate frontend layout exploration. It makes no product edits and runs no behavioral tests; conclusions are based on source contracts and pinned implementation inspection.
- The unrelated `web/next-env.d.ts`, user settings, server on port 9495 and all other work were left untouched.
