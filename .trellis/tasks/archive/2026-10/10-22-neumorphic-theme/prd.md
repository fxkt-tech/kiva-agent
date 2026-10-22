# Support neumorphic visual theme

## Goal

Let users switch between the existing linear flat appearance and a neumorphic appearance while retaining the current workspace layout and workflows. The existing appearance remains the default; both visual styles support system, light and dark color modes.

## Background

- The user approved this scope and task creation on 2026-10-22 after an initial architecture discussion, then explicitly approved implementation ("开始实现") after the final planning review.
- Color-mode preferences currently support only `system`, `light` and `dark` (`web/shared/web-preferences.ts:7`).
- Shared controls already consume semantic palette variables, but their geometry and several visual treatments are fixed (`web/components/ui/primitives.css:8`, `web/components/ui/button.tsx:7`). Feature presentation also contains fixed treatments, including the composer (`web/app/globals.css:370`).

## Requirements

- R1: Offer visual style independently of color mode, keeping the current flat style as the default for new and existing users. Changing either dimension preserves the other choice.
- R2: Make the neumorphic style visibly coherent across shared controls and key workspace surfaces, including raised and inset states, without changing workspace layout, information density or interaction behavior. Messages, code and long lists retain compact content presentation rather than adding relief to every row.
- R3: Apply style choices immediately, persist them per browser, restore them before first paint and synchronize them across same-origin tabs through the existing preference lifecycle.
- R4: Keep project/session/runtime business logic and API contracts independent of visual style. Shared presentation owns visual differences; consumers must not branch on the selected style.
- R5: Preserve keyboard focus, selected/pressed/error/disabled distinctions, overlay behavior and responsive usability in both styles and all color modes.

## Acceptance Criteria

- [x] AC1 (R1): The settings appearance panel offers flat and neumorphic visual styles separately from system/light/dark mode; changing one selection retains the other, and absent or invalid style values resolve to flat without resetting valid unrelated preferences.
- [x] AC2 (R1, R2): Flat mode matches the pre-change appearance and geometry in screenshot/computed-style comparison. Neumorphic mode visibly changes representative buttons, fields, switches, the composer and overlays using consistent raised/inset surfaces while dense content retains its current layout.
- [x] AC3 (R3): A style change applies immediately, survives reload without a flash of flat surfaces, reaches another open tab including `/projects`, and follows the existing appearance-group reset and storage-failure behavior.
- [x] AC4 (R4): Switching styles preserves route, session selection, drafts, attachments, disclosure state and active work; it issues no project/session/model mutation.
- [x] AC5 (R5): Both styles work in explicit light/dark and system-following mode, including keyboard use, portaled overlays and 320px/390px/desktop layouts without overflow or clipped focus/controls. Focus, hover, pressed/selected, invalid and disabled states remain distinguishable.
- [x] AC6 (R2, R4, R5): Appropriate preference/bootstrap/component regressions and the repository typecheck, tests and build pass; real-browser visual and interaction checks support the result.

## Out of Scope

- New navigation, page layouts, typography, density controls, business interactions, backend settings or external packages.
- User-authored themes, a theme marketplace, a general-purpose theme engine or a second component implementation.
- Changes to project/session/runtime ownership, credentials or persisted business data.
