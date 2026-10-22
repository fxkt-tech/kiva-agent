# Existing behavior and sources

- `session-jsonl-dialog.tsx`: default rendered tab, 200-record list, selected inspector, optional expandable JSON tree. Generic fields obscure actual message content. Scoped useResource/response validation and raw tab already have good tests.
- `jsonl-structure.ts`: original line numbers and malformed source; page-local duplicate/parent/cycle diagnostics; iterative field expansion (50 children/page, 300 rows, depth 16). Retain these guarantees.
- `components/message-content.tsx`: memoized ReactMarkdown + GFM, Prism code and semantic styles. Reuse rather than create another Markdown implementation; no SDK leaf projection.
- Installed Pi 1.3.0 `dist/core/session-manager.d.ts` defines append-only session/message/model_change/thinking_level_change/usage/compaction/branch_summary/custom/label/session_info/custom_message/context_edit records. Assistant blocks include text/thinking/toolCall; toolResult carries toolCallId/toolName/content/isError. Validate unknown JSON before presentation.
- `jsonl-dialog.test.ts`, `jsonl-structure.test.ts`, `workbench-interactions.test.ts` cover exact raw data, scoped passive reads, tabs/focus and bounds. Tests use installUiMocks before dynamic imports, never production test branches.
- Browser fixture `server/fixtures/workspace-mode-server.ts` uses a temporary repository and deterministic offline runtime. Seed only its own JSONL files. Playwright Chromium is installed; shared libraries are under `/tmp/kiva-ui-browser-libs.owre54/usr/lib/x86_64-linux-gnu`.
