# Scoped visual-system context

Authoritative source: `.trellis/spec/kiva-web/frontend/visual-system.md`. This task-scoped reading map avoids silently truncating that 41KB spec during context injection. Read the named source sections before changing the corresponding presentation; the source remains authoritative.

## Required source sections

- **Scope and ownership**, **Palette contract**, **Focus feedback contract**, **Typography contract**: feature layout and primitive styling have different owners; preserve semantic palettes, local Geist families and a single 1px focus outline with 1px offset. Never suppress keyboard focus globally or stack an extra Tailwind ring. Preserve intentional composer focus-within and tree inset-row cues.
- **Application feedback contract**, **Layout and state contract**, **Sidebar project controls**: retain shared Alerts/Toasts, compact 30px project rows, 252px/232px desktop sidebar, the 720px drawer breakpoint, centered empty composer and headerless conversation without a right panel. Style switching must not alter resource actions, menu/search behavior or settings entry points.
- **Session JSONL viewer**, **Composer runtime controls**: preserve the full-screen JSONL viewer, row/source selection and exact raw content; preserve model/thinking/context ownership and composer bounds. Do not turn a full-screen viewer into a floating material card.
- **File and change explorer trees**, **Markdown and code blocks**, **Conversation scrolling**: preserve file/diff layout and text, code token colors, scroll ownership, copy/disclosure behavior and narrow-width containment. A palette change must not change source content or scroll position.
- **Message timestamps and compact tool rows**: retain original semantic timestamps, 32px tool summaries and the `width: 0; min-width: 0; flex: 1` containment needed for long tool names. No style-specific render branch may recreate message state.
- **Verification**: typecheck/test/build plus actual browser light/dark desktop/mobile checks. Inspect computed styles and CSS served by the running origin, not only the source. Preserve all project/session/configuration state if generated dev assets need safe regeneration.
- **Upgrade contract: legacy Pi Web Service Worker**: keep the existing pre-paint legacy recovery and worker-retirement mechanism intact. Browser preferences, unrelated storage and business data must survive.

## Task-specific application

Keep both flat and neumorphic styles within these layout/interaction contracts. Theme variables may change surface materials and state presentation; they must not change business ownership, focus/portal mechanics, content density or historical data. Preserve existing flat values and verify the new material roles through real computed states and screenshots rather than source-string-only assertions.
