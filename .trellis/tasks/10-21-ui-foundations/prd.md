# Unify web UI foundations and migrate controls

## Goal

Adopt Vera-style Base UI primitives, shared model fields and confirmations; migrate settings, composer controls, project/session menus and dialogs with consistent themes and accessible interactions.

## Requirements

- Adopt the approved Vera-inspired ui/shared/features layering in the web app.
- Provide consistent styled, accessible controls for settings, composer model/queue fields, project/session menus and application dialogs.
- Preserve all existing scoped reads/writes, model/default semantics, credentials, drafts, pending/dirty dismissal protection, JSONL identity, deletion guards and mobile focus restoration.
- Retain the previous conversation command-preview, sidebar/footer and scrolling/performance changes already in the working tree.
- Keep Kiva's Geist typography, semantic light/dark palette and single thin focus cue. Component implementations are maintained in this repository.

## Acceptance Criteria

- [x] Settings and composer use shared Select/Combobox/Input/Textarea/Switch/Checkbox instead of bespoke native control styling.
- [x] Shared model configuration fields serve both installation defaults and the exact-session composer; save operations remain feature-owned.
- [x] Dialog, alert confirmation, popover and menu interactions share Base UI primitives with coherent portal layering, focus and Escape behavior.
- [x] Nested dropdowns close before their hosting settings dialog; dirty/pending safeguards and mobile final focus remain correct.
- [x] Existing dialogs and project/session menus are migrated while preserving their exact targets, actions and feedback.
- [x] UI primitives do not import business APIs, runtime hooks or feature modules; cross-feature compositions live in components/shared.
- [x] Typecheck, focused/full tests, production build and browser checks cover theme, keyboard, desktop/390px/320px, draft retention and no unintended runtime commands.

## Notes

- User approved the preceding concrete plan with "改吧". No additional requirements interview or implementation approval is needed.
- The baseline Mod+K test used a macOS modifier on Linux. Its migrated test now chooses the platform modifier; the complete suite passes.
