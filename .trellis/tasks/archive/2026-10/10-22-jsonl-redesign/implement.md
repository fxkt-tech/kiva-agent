# Execution

Latest follow-up: move all record details into a shared full-height right inspector, make left cards select it, maintain full-height independently scrolling side-by-side panes at all breakpoints, and update interaction tests/browser acceptance for selection, nested controls, source navigation and pagination reset.

1. Implement bounded semantic projection, a selectable conversation pane, tool associations/events and a shared full-height right inspector. Reuse existing primitives/Markdown. Update affected tests.
2. Run targeted JSONL suites and typecheck; fix failures. Review changed frontend files against task/spec contracts.
3. Use an isolated offline fixture to browser-check Markdown, tools, unknown/malformed records, details/links, raw text, pages, focus and light/dark desktop/390px/320px bounds. No real session writes or paid requests.
4. Run full typecheck, tests, production build and diff whitespace check; restore pre-existing generated next-env diff after build.
5. Synchronize visual-system spec; report completed behavior and checks. Do not commit or push without a request for this task.

Rollback is limited to this task's code. Preserve pre-existing next-env changes and all prior work.
