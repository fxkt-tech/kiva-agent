# Appearance and theme system

## 1. Scope / trigger

Use this contract when changing visual styles, color-mode selection, appearance initialization or material styling. Flat (display label “扁平化”) remains the default; neumorphic and Swiss are alternate styles. Every style retains current layout, density, local fonts, type scale, resource ownership and interaction behavior. Swiss varies contrast, selective red emphasis, corner geometry and heading weight/tracking within those bounds.

## 2. Signatures and owners

- `shared/web-preferences.ts`: `ThemePreference = "system" | "light" | "dark"`, frozen `VISUAL_STYLES = ["flat", "neumorphic", "swiss"]`, derived `VisualStylePreference`, `isVisualStylePreference(value: unknown)` and `normalizeVisualStylePreference(value: unknown)`. The normalizer defaults unrecognized values to flat. `WEB_PREFERENCES_MAX_LENGTH = 16_384` bounds stored-document parsing.
- `WebPreferences.appearance`: `{ theme, visualStyle, conversationFontSize, wrapCode }`. Keep `version: 1` and the `kiva:web-preferences:v1` key; the new field is optional on read and defaults to flat.
- `lib/web-preferences.ts`: `applyAppearancePreference(root, appearance: Pick<WebPreferences["appearance"], "theme" | "visualStyle">): void`. Its root needs only `setAttribute` and `removeAttribute`. The environment has one `applyAppearance(appearance: WebPreferences["appearance"]): void` callback.
- `lib/theme-bootstrap.ts`: `themeBootstrapScript` applies allowlisted appearance values before paint, embedding the build-time `VISUAL_STYLES` JSON literal and sharing the stored-document size bound. Do not add another hand-maintained non-flat allowlist or serialize helper functions into script.
- `styles/themes.css`: sole owner of color palettes and visual-style selection. `components/ui/primitives.css` and `app/globals.css` consume its semantic values for controls and feature presentation.
- `features/settings/preferences-panels.tsx`: the existing AppearancePanel offers separate “主题” and “视觉风格” Selects. Other feature rendering does not branch on visual style or receive a theme prop.

## 3. Contracts

### Appearance lifecycle

| Preference | Root state |
| --- | --- |
| `theme: "system"` | Remove `data-theme`; CSS follows OS changes |
| Explicit light/dark | Set existing `data-theme` to that value |
| `visualStyle: "flat"` | Remove `data-visual-style`; baseline material applies |
| `visualStyle: "neumorphic"` | Set `data-visual-style="neumorphic"` |
| `visualStyle: "swiss"` | Set `data-visual-style="swiss"` |

The mode and style selections preserve one another. Initialization, changes, appearance-group reset and same-origin storage events all apply both through the existing store callback. Keep the persistent shell subscription on `/projects` as well as session routes; do not wait for a composer/settings mount. External events do not echo writes. Missing/invalid fields default independently, and loading older documents performs no migration write.

The shared tuple is the style-admission authority. The decoder and root helper use its normalizer; bootstrap uses the corresponding literal. When adding a style, update this owner, its CSS and the settings label while preserving all pairwise transitions and stale-root-attribute cleanup. Do not equate every non-flat choice with neumorphism.

Bootstrap and runtime must produce the same root attributes for the same stored input, including malformed, oversized and unsupported-version documents. Never insert a stored string into script. Preserve the existing root-only hydration suppression and legacy cache-recovery script. Denied persistence retains the current in-memory choice and the existing warning; do not clear browser storage or save business state with appearance.

### Material roles

Geometry uses `--control-radius`, `--popup-radius` and `--dialog-radius` only where a material variation is needed. Keep size/spacing/viewport constraints in their original owners and keep circular controls circular.

Optional `--action-radius`, `--item-radius` and `--surface-radius` cover existing native/shared actions, selectable rows and content surfaces. Optional `--heading-weight` / `--heading-tracking` control hierarchy at existing font sizes and line heights. Swiss supplies zero corners and 700 heading weight; flat/neumorphic leave these overrides unset. Each consumer retains its exact old fallback (for example composer 18px versus tool card 6px, or heading weights 550/600/650). Do not centralize differing defaults into a single changed value. Account for mobile corner overrides and use a variable-aware Button radius utility that still permits explicit circular feature classes.

Shadows use `--control-shadow`, `--control-hover-shadow`, `--control-pressed-shadow`, `--field-shadow`, `--selection-shadow`, `--thumb-shadow`, `--composer-shadow` and existing popup `--shadow`. Flat defaults retain the old exact values, including the composer's subtle shadow. Neumorphic roles use a consistent upper-left light source, related neutral surfaces and separate raised/inset states in light and dark modes. Existing palette/status/code tokens remain authoritative.

Swiss uses paper/ink neutral light surfaces or near-black dark surfaces, crisp borders and no material shadows. Its red primary emphasis and pink/burgundy danger colors remain supported by existing status icons/labels; do not spread red through all body content or remove state cues. Preserve syntax colors and actual text/icon contrast in both modes. Navigation selection may consume primary foreground color only while existing flat/neumorphic values stay identical.

Button retains its public variant/size/Slot interface and exposes `data-variant` for semantic styling. Shared CSS consumes native/ARIA/Base UI states; never duplicate a component for the alternate style. Use sufficiently low specificity for material defaults so intentional feature shadows/geometry still win.

The single 1px focus outline with 1px offset remains visible alongside material shadows. Do not globally erase material shadows on focus, add a second focus ring or rely on shadow alone for errors/selection/disabled state. Messages, Markdown, code and long lists stay compact. Full-screen JSONL bounds and structural selection shadows are not floating-material roles and must not be overwritten mechanically.

## 4. Validation and error matrix

| Condition | Required outcome |
| --- | --- |
| Legacy v1 document with no visual style | Flat material; retain its valid color mode and other preferences |
| Invalid style with valid color mode | Default style only; keep the mode |
| Invalid mode with valid style | System color mode; keep the style |
| Malformed/oversized/unsupported-version storage | Existing defaults and no stale root overrides, identically before paint and at runtime |
| Denied read/write | Existing fallback/in-memory behavior and sanitized warning; no unrelated storage mutation |
| Sibling tab changes/deletes preferences | Apply both dimensions without a write loop, including on `/projects` |
| OS mode changes | Only system color mode responds; visual style remains selected |
| Style changes with an open session | Retain route, draft, attachments, disclosures and mounted controls; issue no business mutation or runtime start |

## 5. Good / base / bad cases

- Good: select dark plus Swiss, reload into both before content paint, then switch through neumorphic and flat while keeping dark and the current draft.
- Base: an old browser preference document retains the previous flat appearance without a migration or reset.
- Bad: encode another visual style as a light/dark option, maintain three divergent style allowlists, put style branches in session rendering, apply attributes only from Settings, or replace every shadow including JSONL selection feedback.

## 6. Required tests and browser evidence

- `server/web-preferences.test.ts`: legacy/invalid values, independent updates, immutable snapshots, persistence/reload/reset, denied storage and cross-tab no-write-loop behavior.
- `server/theme-bootstrap.test.ts`: execute actual bootstrap and compare its root attributes with actual runtime decoding/application across all mode/style pairs and malformed/versioned/oversized/denied storage.
- Existing settings and workbench interaction suites: accessible selector, controlled updates, `/projects` subscription and retained session presentation state with no business mutation. Primitive tests preserve semantic variants and state forwarding.
- Run repository typecheck/tests/build. Capture before/after baselines for both existing styles and verify Swiss light/dark at desktop/390px/320px, plus all-style system mode changes. Compare geometry, palette, typography, circles and shadows; inspect served computed styles, the thin keyboard cue, nested portal Escape/final focus, mobile navigation, no overflow/clipped controls, reload first-frame attributes and cross-tab synchronization. Use isolated fixtures without paid requests.
- Confirm served composer/heading/selection rules match the current source alongside root tokens: stale production CSS can coexist with fresh imported theme tokens. Resolve source/artifact disagreements with an isolated production-cache rebuild before changing presentation code; preserve any running development service and its separate cache.

## 7. Wrong vs correct

```tsx
// Wrong: business rendering owns a visual-style branch and may remount state.
return visualStyle === "neumorphic" ? <NewComposer /> : <Composer />;
// Correct: the same component consumes semantic presentation styles.
return <Composer />;
```

```css
/* Correct: material values come from the theme; component owns its role. */
.ui-input { box-shadow: var(--field-shadow); }
```
