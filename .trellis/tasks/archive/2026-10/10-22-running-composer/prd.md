# Running composer actions and inserted-message cards

## Goal

Keep send and stop in one stable composer action position, and present messages inserted during a running response in a composer-attached card arrangement matching the user's reference. Make the running interaction legible without losing the current message, attachments or session state.

## Background and decisions

- The user requested two changes and approved task creation/planning on 2026-10-22: stop at the send position, and reference-inspired cards for messages inserted while a response runs.
- The reference shows a compact message card immediately above/behind the composer, with content on the left and mode/actions on the right. The user subsequently chose presentation-only cards using the existing queue capabilities: show message and mode, and retain “清空队列”. Individual delete/Steer/overflow actions are outside this task.
- Reference image: [`research/reference-composer.png`](research/reference-composer.png) (user-supplied planning reference, included for continuation on another computer; not a product asset).
- Current `web/features/sessions/composer.tsx:173` renders stop and send simultaneously; stop sits to the left of send. Its `submit` handler routes a running submission to `runtime.queueMessage` using either `steer` or `follow_up`. The user chose one button that switches between stop for empty running input and send for a draft/attachment, accepting that a draft hides stop.
- Current `web/features/sessions/composer.tsx:140` shows one summary queue panel with text rows and a clear-all control. Runtime queue snapshots expose separate string arrays for steering and follow-up messages.
- Existing styles are flat, neumorphic and Swiss, with independent light/dark/system mode. Preserve their semantic style contracts and responsive bounds.
- Preserve the pre-existing unrelated `web/next-env.d.ts` edit and existing user server on port 9495.
- Runtime research (`research/runtime-queue.md`) confirms the application and pinned Pi RPC support enqueue and clear-all, with text-only queue arrays and no stable per-entry identity or attachment metadata. Individual mutation cannot be safely simulated by clearing/re-enqueueing a snapshot.

## Requirements

- R1: Use a single stable lower-right action slot with the same circular size and theme-aware surface for send/stop. While running, empty or whitespace-only input without attachments shows a square stop icon; a nonblank draft or any attachment shows send. Idle always shows the ordinary send action. Preserve existing pending/model-save/connectivity/entry-capability send guards. Only an explicit stop-button activation dispatches abort; empty-input send shortcuts cannot abort.
- R2: Present current queued messages as compact cards attached immediately above/behind the composer, with the composer in front and all card content/controls readable. Show message text and static Chinese mode labels (“立即纠正” / “完成后追加”); retain one explicitly labelled “清空队列” action. Preserve lane ordering (steering first, then follow-up, in returned order), counts and duplicate messages. Bound multiple/long messages with wrapping and internal scrolling so the input remains usable. Render returned text as escaped text using the existing queue projection.
- R3: Preserve input shortcuts/IME handling, scoped drafts and attachments, queue mode semantics, current route/session identity and runtime state unless an explicit behavior change is approved.
- R4: Keep controls keyboard accessible and bounded at desktop, 390px and 320px across the existing visual styles and color modes.
- R5: Preserve authoritative runtime ownership: enqueue/abort/clear-all continue through the existing scoped hook and commands. Derive cards from snapshot/events, including after reconnect, consumption or stop; do not create an optimistic local queue, infer per-item IDs or change stop into clear-all.

## Acceptance criteria

- [x] AC1 / R1: Exactly one action occupies the same lower-right circular bounds: running+empty/whitespace → stop, running+nonblank-text-or-attachment → send, idle → send. Ordinary optimistic input clearing restores stop while the response remains running; failure restores captured content and the appropriate action. All send-disabled guards remain effective.
- [x] AC2 / R2: One/multiple queued messages form a visually attached stack with readable text, correct static mode labels/counts and one working “清空队列” control. Long text and duplicates remain accessible within bounded scrolling; there are no per-item mutation affordances.
- [x] AC3 / R1, R3: Actual click and both send shortcut modes dispatch the correct scoped prompt/queue command. Empty/whitespace Enter, IME confirmation and repeat events do not abort or submit. Stop dispatches only abort, while failure/pending/navigation retain the existing draft/attachment ownership behavior.
- [x] AC4 / R4: Keyboard, long-message/multiple-message layout, light/dark and desktop/mobile checks pass without clipped controls.
- [x] AC5 / R3, R5: Runtime events update/remove cards, clear-all targets the current session, and navigation/refresh/sibling-tab updates retain scope isolation. Merely observing cards issues no commands; stopping does not itself claim to clear queues.
- [x] AC6 / R1–R5: Relevant regressions, typecheck, full tests, build, independent review and actual browser evidence pass.

## Technical notes and scope

- This is one composer interaction task; action-slot changes and inserted-message presentation must be verified together.
- Expected change owners are `web/features/sessions/composer.tsx` and its feature rules in `web/app/globals.css`, plus the existing workbench interaction tests and executable composer spec. Keep the shared Button and runtime contracts intact.
- The screenshot guides the attached-card composition and square stop glyph. Existing typography, semantic colors/materials and style-aware corners remain authoritative; Swiss keeps its square surfaces and genuine circular actions remain circular.
- No backend/API/dependency/preference-schema changes, individual queue deletion/editing/reordering/promotion, editable-queue ownership, or queue persistence are included. No general conversation-page/model/settings redesign or unrelated cleanup is included.
- Existing Pi queue snapshots cannot recover image payload/metadata or a chronological order across both lanes. Preserve the current projection; do not fabricate these properties or use display text as a replay payload.

All product decisions for this scope are resolved. The user explicitly approved implementation on 2026-10-22. The implementation was retained on `feat/owned-session-viewer`; on 2026-10-23 the user authorized committing the remaining work, pulling remote updates and merging into `main`.
