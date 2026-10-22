# Add Swiss visual style

## Goal

Offer a Swiss visual style as a third appearance alongside the existing flat and neumorphic styles. Users should be able to select it independently of color mode without losing existing preferences or current work.

## Background

- The user requested another visual style, approved task creation/planning, and confirmed preserving the current layout and information density on 2026-10-22.
- The existing style selector displays “扁平化” and “新拟态”; flat remains the default. Both styles share the current preference lifecycle and semantic palette/material system.

## Requirements

- R1: Add “瑞士风格” as a third independently selectable visual style while retaining existing flat/neumorphic behavior and the flat default.
- R2: Express Swiss styling through high-contrast black/white surfaces, a restrained red accent, sharper corners and clearer typography hierarchy. Preserve the current workspace layout, information density, local fonts and type scale; use weight/tracking and surface treatment rather than larger headings or a new grid.
- R3: Support explicit light/dark and system-following modes; retain immediate updates, compatible persistence, pre-paint restoration, cross-tab synchronization and appearance-group reset.
- R4: Preserve business interactions, current route/session identity, drafts, attachments, disclosures and active work when switching styles.
- R5: Preserve readable text/status distinctions, keyboard focus, overlay interaction and desktop/mobile usability across all three styles.

## Acceptance Criteria

- [x] AC1 (R1): Appearance settings offer “扁平化”, “新拟态” and “瑞士风格”; legacy/missing/invalid style input keeps the current flat fallback without resetting valid neighboring fields.
- [x] AC2 (R2): Swiss mode visibly changes representative actions, fields, navigation, composer, headings and overlays through consistent sharper geometry, contrast and selective accent. Existing flat/neumorphic appearances match their pre-change sampled styles and geometry; grid, control sizes, spacing and type scale remain intact.
- [x] AC3 (R3): Swiss selection operates independently of color mode, survives refresh before content paint, synchronizes to another open tab including `/projects`, and resets through the existing appearance group.
- [x] AC4 (R4): Style changes retain mounted business presentation state and issue no business mutation or runtime start.
- [x] AC5 (R5): All styles retain usable focus, selected/pressed/error/disabled states and correctly bounded overlays/controls on desktop, 390px and 320px.
- [x] AC6 (R1–R5): Relevant behavior regressions, repository typecheck/tests/build and actual browser verification pass.

## Out of Scope

- Backend/runtime/API changes, user-authored themes, a theme marketplace or a general-purpose runtime theme engine.
- Changing the existing default or removing either current style.
- Poster-like layouts, asymmetric grid redesigns, larger heading/body scales, changed row density or new font/dependency downloads.
