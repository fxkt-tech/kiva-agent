# Running composer design

Status: planning converged; awaiting user approval of the final summary before implementation.

## Behavior gap and ownership

Current running UI puts stop beside send and summarizes all queued text in a separate panel. The approved outcome is a single stable action slot plus composer-attached read-only cards. This is a frontend presentation/interaction task; the existing scoped runtime hook, queue commands, draft store and authoritative snapshots already provide the required behavior.

`features/sessions/composer.tsx` owns the action derivation, current draft/attachments, form and queue projection. `app/globals.css` owns the feature layout and theme-token consumers. Keep `components/ui/Button` business-independent and unchanged; no runtime queue service, backend command, dependency, preference or general action-state framework is needed.

## Action state table

Define one `hasContent` predicate from `draft.trim()` or any attachment, consistent with the existing submit guard. Derive the displayed action from running and that predicate rather than storing another state.

| Runtime/input | Visible action | Activation and guards |
| --- | --- | --- |
| Idle, empty or filled | Send | Existing submit path; existing empty/pending/save/connectivity/capability guards. |
| Running, empty or whitespace-only, no attachments | Stop | Explicit `type="button"` activation calls existing `runtime.abort`. No submit shortcut maps to abort. |
| Running, nonblank draft or attachment | Send | Existing `type="submit"` path enqueues with the selected steer/follow-up mode; preserve all send guards. |
| Running submit pending, optimistic draft now empty | Stop | Continue to expose the existing abort path; do not wait on the pending queue RPC to make stopping possible. |
| Submit pending and user starts the next draft | Send, disabled while pending | Retain duplicate-submit protection and new scoped draft contents. |
| Submission fails | Recompute from restored scoped input and actual runtime state | Preserve existing captured-source restoration; never restore into a newly navigated session. |

Use the same 30px circular action shell and right alignment in every state; switch its icon and accessible name between arrow/send and a filled square/stop. Consume existing primary/material colors, including Swiss accent, without hardcoded black/white or visual-style branches. Avoid geometry/focus jumps when the action changes. Stop remains an explicit action; Enter on empty input, button type changes, composition events or rerenders must never dispatch abort.

Preserve the keyboard path's enabled-submit-button lookup: `form.requestSubmit(submitter)` may run only when the visible action is an enabled submit button. Keep both send modes, repeat guard, Safari/IME safeguards, Shift+Enter and native textarea growth behavior. Buttons retain correct types even if card/form wrappers change.

## Card composition

- Render current queue text in a compact stack immediately above the composer, visually recessed behind its upper edge. Keep a shared aligned maximum width; a modest horizontal inset and shallow overlap communicate the reference's layered composition. The composer paints in front without covering a message line, mode label or clear control.
- Each card shows escaped returned message text and a static mode label. Preserve returned order within steering and follow-up lanes and the current steering-first grouping. Read-only duplicate text entries are rendered independently; presentation keys are not protocol identities.
- A compact group-level heading/count and a single explicit “清空队列” control retain the existing all-clear semantics. Use a labelled text/control treatment so a trash glyph cannot be mistaken for individual deletion. Card labels are not clickable Steer actions; omit individual destructive/overflow controls under the approved scope.
- Wrap long unbroken text and provide bounded internal vertical scrolling for many/long cards. Every returned message remains readable through scrolling; the input/action/footer stay usable. Keep the scroll region keyboard reachable when overflowed and use semantic list/region labels. Do not make message bodies or the entire card buttons.
- Queue-free input retains its existing geometry. While cards appear/disappear, keep draft/attachment/input nodes and route/session state mounted. Queue layout participates in the composer area rather than becoming an independently positioned screen overlay. Keep slash-command palettes and existing Base UI popovers above the stack with their established focus behavior.
- Reuse semantic background/card/subtle/border/foreground and existing material/corner roles. Flat/neumorphic/Swiss remain coherent in light/dark and mobile. Do not add style-specific React branches, new fonts, a palette or a global corner reset.

## Data flow, compatibility and errors

Existing flow is unchanged: scoped draft → captured existing submit → prompt or queue command → scoped authoritative snapshot/events → cards; stop → abort; clear-all → clear_queue. Observing/rendering cards issues no command. Keep cards present whenever the authoritative queue contains messages, including if the runtime becomes idle; abort does not promise queue clearance. Preserve current runtime/hook error feedback and reconnection/scope rejection.

Research establishes that Pi 1.3.0 has no safe public per-item mutations or full queue payload snapshot. This design adds no clear-and-requeue reconstruction, fake IDs, local optimistic pending list, new cross-tab store or recovered attachment/chronology claims. Raw returned text-file blocks remain escaped queue text under the current projection; payload formatting is not redesigned.

The deterministic adapter's abort currently empties queues unlike the pinned Pi implementation. UI tests should control authoritative queue events and verify only abort dispatch, rather than relying on that fixture shortcut as product semantics. Correct a fixture only if required for a meaningful scoped test, and keep any adjustment test-only.

## Expected files and rollback

- `web/features/sessions/composer.tsx`: one action rule and read-only queued-card composition.
- `web/app/globals.css`: attached stack, bounded queue scrolling and shared action bounds, including mobile rules.
- `web/server/workbench-interactions.test.ts`: actual routed action/keyboard/state/scope regressions.
- `.trellis/spec/kiva-web/frontend/visual-system.md`: final executable composer action/card contracts after verification.
- A minimal deterministic test fixture change is optional only if the acceptance harness requires it; no production backend change is planned.

No migration is required. Revert task-owned composer/CSS changes to roll back; never clear preferences, queues, session data or unrelated user files. Preserve `web/next-env.d.ts` byte-for-byte through builds and keep user server9495/development cache running untouched.

## Validation approach

Use actual routed workbench tests plus browser interaction and measured geometry, not token/source-string snapshots. Verify all action states, queue consumption/clear projection, failure and scope races, read-only duplicated/mixed-mode content and theme/viewport bounds. Browser fixtures use isolated projects and a deterministic no-model adapter; no paid prompt or real queue mutation is needed. Compare served composer/card styles to source, accounting for the prior stale-production-cache finding without interrupting the user service.
