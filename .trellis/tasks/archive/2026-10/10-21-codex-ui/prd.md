# Codex-style workspace

## Goal
Restyle the complete Kiva web workspace to resemble the Codex desktop app while keeping Kiva branding and all existing functional workflows.

## Acceptance criteria
- Neutral light and dark surfaces, compact sidebar, restrained borders and typography replace the lime accent, gradients and decorative hero.
- New conversations have a centered heading and composer; existing conversations retain a readable scrolling timeline and bottom composer.
- Project selection, session creation/search/menus, files, Git changes, commands, attachments, model selection and runtime context remain accessible.
- Dialogs, tool output, Markdown and file previews follow the same visual system.
- Narrow viewports provide an operable navigation drawer and context panel without horizontal page overflow.
- Type checking, existing tests, production build and browser interaction checks pass.
- Browsers upgrading from agegr/pi-web retire its cache-first Service Worker and show the new UI across repeated reloads without clearing unrelated browser storage.

## Sidebar follow-up acceptance criteria
- Clicking the project name or disclosure arrow folds/unfolds its sidebar contents without opening the local-project picker.
- Session search sits on the project row immediately left of the disclosure arrow; it expands the group, focuses the input and filters real sessions. Closing search resets the filter.
- Remove the global “新建会话” row. Each project row has an icon-only plus immediately before search that creates a real session in that project's runtime. Expand the project and clear any search filter when creating; preserve the active-project keyboard shortcut and separate add-project picker action.
- Active sessions appear directly under the project without a “最近会话” heading, and the sidebar has no “运行上下文” entry.
- The plus beside “项目” still opens the real directory picker; composer model/context controls remain available. No backend, storage or API changes.
- The sidebar header displays “KivA Agent” with no command-panel button to its right. Preserve the mobile navigation close control and composer/keyboard command access.

## Composer and right-panel follow-up acceptance criteria
- Move thinking strength and live context usage into the composer; model selection remains operable there after the old right-panel controls are removed.
- The composer context indicator exposes token usage, limit, cumulative usage/cost and the existing confirmed compaction action. Missing runtime data stays unknown; controls cannot change model/thinking while running or disconnected.
- The right panel is an empty, collapsed-by-default container reserved for future capabilities, toggled from the header and closable with Escape. Remove its old model/context/project/capability/status content and obsolete runtime-context menu entry.
- Preserve existing runtime command payloads, snapshots, sessions, drafts, attachments and mobile responsiveness. Verify actual command dispatch and live snapshot updates, not just static placement.

## Conversation header follow-up acceptance criteria
- The center header displays no title in sessions/files/changes. Keep the right-panel toggle on the right, without a runtime badge, session menu or project/branch subtitle.
- Make the header a fully transparent overlay whose empty space passes clicks and scrolling through to the content beneath it. Its actual buttons remain interactive; preserve mobile navigation with a small left-hand navigation icon after removing the former title hit target. Session creation and compaction remain available through the sidebar/composer.

## Message timeline follow-up acceptance criteria
- Use “KivA” for the center workspace's assistant branding and labels.
- Display actual assistant message timestamps as local `YYYY-MM-DD HH:mm:ss`, not hardcoded “刚刚” or streaming-status text. Preserve timestamps from Pi history and live events; missing/invalid historical timestamps stay unknown. Sidebar relative times are unchanged.
- Tool-only messages do not show “正在使用工具…” or an empty Markdown spacer. A collapsed tool card uses one compact line for icon/name/status/disclosure, retaining expandable arguments/results and copy controls.
- Keep timestamps stable throughout streaming, tool execution and history reload. Add only an optional timestamp field to the runtime message projection; no storage migration or changes to existing command payloads.
- Tool statuses display only the status icon, with accessible names and hover titles rather than visible status words.
- Align composer runtime settings to the right in the exact order context usage → model → thinking strength. Preserve responsive toolbar behavior, independent controls and in-viewport context details.

## Typography follow-up acceptance criteria
- Use Geist Sans for English/numeric UI text and Geist Mono for code, tool output and paths, preserving monospace behavior.
- Serve fonts locally from a pinned dependency; neither production builds nor browsers depend on Google Fonts/CDN access. Keep shared CSS/Tailwind font tokens consistent.
- Recommend a Chinese companion separately. Retain the current system Chinese fallback behavior until a bundled Chinese font is chosen; do not add a full CJK download without that choice.

## Scope
Presentation changes plus the additive, optional `RuntimeMessage.timestamp` projection from Pi history/events. Existing command payloads, backend operations and project/session storage remain unchanged; no migration is required. The user requested commit and push after final validation. Bundled Noto Sans SC remains outside this task.
