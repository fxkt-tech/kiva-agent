# Readable session JSONL

## Problem

The rendered JSONL view emphasizes a record list and nested JSON fields. Reading a conversation requires repeatedly expanding message/content and selecting records; tool calls and results lack clear associations.

## User decision

The user requested a redesign and selected “read messages and tool activity like a conversation” as the primary goal. Implement that emphasis directly.

## Requirements

- Default rendered view displays readable message bodies in file order in the left pane, with recognizable user/assistant roles and Markdown formatting.
- Tool names, arguments and results are easy to find and relate. Only confirmed relationships may be shown; absent or ambiguous results must not appear to be running or successful.
- Session metadata, model/thinking changes, compaction and branch events use concise readable presentations. Keep unknown, primitive and malformed records accessible.
- Every record retains its original line number. A single right-side “记录详情” inspector displays the selected record's structured fields, source metadata and parent relationship diagnostics. Clicking a left record selects it and updates the right inspector; remove per-record inline details.
- Preserve exact raw text, scoped read-only requests, resource identity and loading/error/retry/truncation behavior.
- Desktop and 390px/320px layouts work in light/dark themes without document overflow. Keyboard dismissal, tab navigation and focus restoration continue to work.
- Follow-up: the JSONL viewer fills the entire browser viewport on desktop and mobile, with no outside gaps or rounded modal frame. Keep tabs/close at the top and pagination visible while content scrolls internally.
- Latest follow-up: both left conversation and right inspector fill the available content height in a side-by-side layout, with independent vertical scrolling. Keep the arrangement on narrow screens using flexible widths and wrapping. Initially select the first loaded record; pagination selects the first record on the new page. Source/parent navigation also updates selection.
- Record pages and structured details remain bounded. Oversized semantic previews explicitly indicate clipping and point to full raw text.

## Acceptance

Opening the default view immediately shows the conversation without expanding JSON fields. A user → assistant text/thinking/tool → result → assistant sequence is understandable at a glance. Tests cover semantic rendering and association, unknown/malformed fallback, pagination, exact raw text and passive reads. Browser checks verify representative content, tools/details, pagination, tab/focus behavior and responsive theme bounds without model calls.

## Out of scope

Changing JSONL files, session execution or API contracts; re-executing tools; reconstructing only the current branch or suppressing historical records; redesigning the normal conversation screen.
