# Running composer implementation plan

Status: ready for final planning review; implementation is not authorized until a subsequent explicit user approval.

## 1. Preparation and baseline

- [ ] Confirm current task and Phase 1.4 review gate, then create an isolated feature branch from the verified main base after user approval and run `task.py start` once.
- [ ] Preserve current unrelated `web/next-env.d.ts` bytes, existing user server9495 and its development cache. Capture existing queue-free and queued composer screenshots/bounds in an isolated deterministic fixture before writes.
- [ ] Read curated context and dispatch one `trellis-implement` agent. It owns task-related product/tests; main owns specs/task docs/browser evidence/commit flow. Preserve other contributors' changes, and use no concurrent writers on composer/CSS.

## 2. Shared action position (R1, R3)

- [ ] Derive content from nonblank draft or attachments using the same semantics as submit. Replace simultaneous actions with exactly one stable lower-right circular action shell; render a filled square stop icon for running+empty and send otherwise.
- [ ] Preserve disabled/pending/save/connectivity/capability checks and scoped submit paths. Stop must be type=button and invoke only abort; a send shortcut must find an enabled submit button and can never abort.
- [ ] Verify running/idle, empty/whitespace/nonblank/attachment-only, optimistic clear, delayed success/failure, new draft while pending and runtime settling races. Retain existing draft source-key capture/restoration and mobile settings row.

## 3. Attached message cards (R2, R4, R5)

- [ ] Replace the summary panel with a theme-aware card stack recessed above the composer. Show message text and static mode labels; preserve lane order, counts and duplicate entries.
- [ ] Keep one labelled clear-all control using the existing scoped operation. Card bodies/labels are read-only; add no individual actions, fake IDs, local queue mirror or clear-and-requeue behavior.
- [ ] Bound queue height, wrap long strings, make overflow readable and keyboard reachable, and keep composer/control bounds usable at 1440/390/320. Preserve slash commands, popover stacking and theme material/corner contracts.
- [ ] Reflect authoritative queue events, consumption, reconnection and idle/stop states. Do not assume abort clears the real runtime queue.

## 4. Verification and independent review

- [ ] Extend `web/server/workbench-interactions.test.ts` with actual routed click/keyboard command assertions: single action, attachment-only/whitespace/pending/failure states, both send modes/IME/repeat, empty Enter never aborts, mixed/duplicate queues, clear-all and scoped event/navigation races. Reuse existing draft/attachment/queue coverage rather than mirroring JSX.
- [ ] Run focused `pnpm --dir web exec tsx --experimental-test-module-mocks --test server/workbench-interactions.test.ts` and relevant affected tests; then sequentially dispatch `trellis-check` for the whole task.
- [ ] Confirm `pnpm typecheck`, `pnpm test`, `pnpm web:build` and `git diff --check` pass; no root lint command is configured. Repeat checks only for fixes that warrant them.
- [ ] Browser-check actual running input across flat/neumorphic/Swiss × light/dark at 1440/390/320. Measure identical send/stop bounds and verify square icon/focus, click vs keyboard/IME, text/attachment-only input, pending/error restoration, queue update/clear and session scope. Add short-height/multiple/long-card checks for bounded scrolling and input accessibility.
- [ ] Compare queue-free input dimensions, textarea 1/3/5/6-line growth, settings/popover bounds and existing toolbar placement against baseline. Inspect served rules and console/resource failures, separating expected fetch cancellation from failures. Use controlled no-model runtime events; leave user sessions/settings untouched and stop only the test fixture.

## 5. Contracts and completion

- [ ] Update the executable composer visual spec with the approved state table, card-only scope and runtime-authority boundary. Reconcile AC1–AC6 with actual tests/browser evidence and restore generated declarations to their original bytes.
- [ ] Prepare the Phase 3.4 concrete commit plan once quality passes. Commit/archive/journal after the applicable confirmation. No merge/branch deletion/push is implied by earlier tasks' instructions.

## Acceptance risks / rollback

Main risks are empty Enter accidentally activating stop, transient duplicate/vanishing controls, input changes while an enqueue is pending, queue scroll height obscuring input, mobile overlap, or tests mistaking fixture abort for clear-all. Fix them at composer/form/CSS ownership. Revert task-owned frontend changes for rollback; never mutate real queues or clear user data to test the presentation.
