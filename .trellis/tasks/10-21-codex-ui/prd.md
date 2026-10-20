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

## Scope
Presentation in web/app and web/components only. Existing backend, project/session storage and runtime API contracts remain unchanged. No commit or push requested.
