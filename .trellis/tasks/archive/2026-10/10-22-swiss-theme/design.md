# Swiss visual style design

Status: final plan explicitly approved for implementation by the user ("开始实现") on 2026-10-22.

## 1. Boundary and appearance contract

Add `swiss` to the existing visual-style dimension. Retain `appearance.theme`, flat default, preference version/key and existing state ownership. Labels are “扁平化”, “新拟态” and “瑞士风格”. One cohesive web task is sufficient; preference admission and visual-role changes require integrated validation rather than independently released children.

The behavior gap is a third selectable appearance, restored consistently at every appearance entry point, with enough presentation roles to express its geometry and hierarchy. The owners remain shared preference decoding/root application plus CSS themes and consumers; no business code needs to know the selected style.

## 2. One style allowlist across entry points

`shared/web-preferences.ts` owns a small immutable `VISUAL_STYLES` tuple (`flat`, `neumorphic`, `swiss`), its derived `VisualStylePreference` and a narrow type guard/normalizer. This is a value allowlist, not a configurable registry or theme engine.

- The shared decoder recognizes every listed value and defaults unknown/missing fields to flat independently of valid neighboring fields.
- `applyAppearancePreference` removes `data-visual-style` for flat and sets the normalized non-flat value for neumorphic/Swiss. Its existing single callback still handles initialization, updates, reset and storage events.
- The pre-paint script embeds the build-time allowlist as a JSON literal and performs the equivalent allowlisted selection. Never stringify a function, evaluate stored code or interpolate stored content into script.
- Keep the existing 16,384-character input bound, unsupported-version/malformed/denied-storage fallback, root-only hydration seam and legacy-cache recovery.

Data flow remains Settings Select → existing field-wise decoder/store → localStorage and root attributes → semantic CSS consumers. External events use the same path without echoing writes. Explicit mode/OS-following mode remains independent of style. No migration write or second storage key is needed.

## 3. Swiss visual direction

| Aspect | Swiss treatment | Preserved contract |
| --- | --- | --- |
| Palette | Paper-like light neutrals or near-black dark neutrals, strong foreground contrast and restrained red emphasis | Status/code semantics and readable secondary text in both modes |
| Hierarchy | More definite heading/action weight and deliberate tracking | Existing Geist UI/code fonts, font sizes, line heights, spacing and heading structure |
| Shape | Square or nearly square actions, fields, navigation selections and key surfaces | Existing hit targets, bounds, column widths and responsive breakpoints |
| Material | Flat surfaces and crisp borders; no soft neumorphic relief | Visible keyboard outline, selected/pressed/invalid/disabled distinctions and floating-overlay separation |
| Composition | Existing alignments and content grid with clearer separators/contrast | Current information density, scroll ownership, headerless workspace and mobile drawer |

Use red selectively for primary emphasis or active affordances, not for every control or body heading. Keep error/danger semantics distinguishable through existing status icons, labels and appropriate color values; red accent must not become the only state cue. Preserve syntax readability rather than forcing code into monochrome.

## 4. Minimal extension of presentation roles

`styles/themes.css` remains the sole CSS owner of style selection. Add a Swiss root block plus explicit/system dark counterparts, and reuse existing palette, focus and material tokens. Existing `--control-radius`, `--popup-radius`, `--dialog-radius` and shadow roles cover shared fields/overlays but not all visible surfaces.

Introduce only consumed corner and typography roles for the uncovered action/row/composer/content surfaces and heading hierarchy. Prefer optional override variables with each consumer's exact existing value as its fallback when baseline values differ. For example, an optional surface-corner role can have 18px composer and 6px tool-card fallbacks while Swiss supplies a common sharper value. Do not normalize the two existing styles' differing values as part of extraction.

- Button may consume a semantic corner role through shared CSS or its existing class list; retain variant/size/Slot behavior and low-specificity material defaults.
- Feature CSS consumes roles for native navigation/settings/composer/preview actions as needed. Do not add root-style selectors in feature CSS or theme props/conditional trees in React.
- Keep genuine circular switch thumbs, status/progress markers and circular actions circular. Preserve intentional fullscreen JSONL radius/shadow overrides and structural selection halos.
- Heading weight/tracking roles preserve existing per-consumer fallback values; do not change font families, sizes, line-height, margins or layout to simulate a poster.
- Audit the mobile settings radius override and native feature radii so Swiss is coherent on narrow screens as well as shared controls.

## 5. Files and verification seams

Expected product files: `shared/web-preferences.ts`, `lib/web-preferences.ts`, `lib/theme-bootstrap.ts`, `features/settings/preferences-panels.tsx`, `styles/themes.css`, `components/ui/primitives.css`, `app/globals.css`, and `components/ui/button.tsx` only if its existing geometry class must change. Preserve the user's dirty `web/next-env.d.ts` byte-for-byte through builds.

Extend the existing preference/bootstrap/settings/workbench tests for the third value and transitions among all styles. Compare actual runtime/bootstrap attribute outcomes for all mode/style pairs and invalid input; add behavior/state-retention assertions where they extend the existing seams. Browser evidence, rather than token-string snapshots, verifies styling, contrast, focus and old-style preservation.

## 6. Compatibility, risks and rollback

- Current style documents and default appearance remain valid. Missing/unknown style falls back to flat; flat/neumorphic selection and their existing visuals remain stable.
- Main risks are missed fixed corners or mobile overrides, typography-role changes affecting the old styles, accent/status ambiguity and mode/style CSS precedence. Use before/after computed styles and screenshots for both existing styles plus a Swiss light/dark desktop/mobile matrix.
- Switching styles must keep mounted nodes and route/session/draft/attachment/disclosure state, with zero business mutation or runtime start.
- Rollback selects a previous style or reverts task-owned appearance/presentation changes. Do not clear storage or alter business data; an older decoder naturally ignores the new unknown value and falls back to flat.
- No dependency, font download, backend, API, navigation or grid/density redesign is included. No technical blocker or unresolved product question remains for the proposed scope.
