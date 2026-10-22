# Appearance and theme system

## 1. Scope / trigger

Use this contract when changing visual styles, color-mode selection, appearance initialization or material styling. The existing linear flat style remains the default. Neumorphism changes surface material while retaining current layout, density, typography, resource ownership and interaction behavior.

## 2. Signatures and owners

- `shared/web-preferences.ts`: `ThemePreference = "system" | "light" | "dark"`, `VisualStylePreference = "flat" | "neumorphic"`, `WEB_PREFERENCES_MAX_LENGTH = 16_384` and field-wise preference decoding.
- `WebPreferences.appearance`: `{ theme, visualStyle, conversationFontSize, wrapCode }`. Keep `version: 1` and the `kiva:web-preferences:v1` key; the new field is optional on read and defaults to flat.
- `lib/web-preferences.ts`: `applyAppearancePreference(root, appearance: Pick<WebPreferences["appearance"], "theme" | "visualStyle">): void`. Its root needs only `setAttribute` and `removeAttribute`. The environment has one `applyAppearance(appearance: WebPreferences["appearance"]): void` callback.
- `lib/theme-bootstrap.ts`: `themeBootstrapScript` applies allowlisted appearance values before paint, sharing the stored-document size bound.
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

The mode and style selections preserve one another. Initialization, changes, appearance-group reset and same-origin storage events all apply both through the existing store callback. Keep the persistent shell subscription on `/projects` as well as session routes; do not wait for a composer/settings mount. External events do not echo writes. Missing/invalid fields default independently, and loading older documents performs no migration write.

Bootstrap and runtime must produce the same root attributes for the same stored input, including malformed, oversized and unsupported-version documents. Never insert a stored string into script. Preserve the existing root-only hydration suppression and legacy cache-recovery script. Denied persistence retains the current in-memory choice and the existing warning; do not clear browser storage or save business state with appearance.

### Material roles

Geometry uses `--control-radius`, `--popup-radius` and `--dialog-radius` only where a material variation is needed. Keep size/spacing/viewport constraints in their original owners and keep circular controls circular.

Shadows use `--control-shadow`, `--control-hover-shadow`, `--control-pressed-shadow`, `--field-shadow`, `--selection-shadow`, `--thumb-shadow`, `--composer-shadow` and existing popup `--shadow`. Flat defaults retain the old exact values, including the composer's subtle shadow. Neumorphic roles use a consistent upper-left light source, related neutral surfaces and separate raised/inset states in light and dark modes. Existing palette/status/code tokens remain authoritative.

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

- Good: select dark plus neumorphic, reload into both before content paint, then change to flat while keeping dark and the current draft.
- Base: an old browser preference document retains the previous flat appearance without a migration or reset.
- Bad: encode neumorphic as a fourth light/dark option, put style branches in session rendering, apply attributes only from Settings, or replace every shadow including JSONL selection feedback.

## 6. Required tests and browser evidence

- `server/web-preferences.test.ts`: legacy/invalid values, independent updates, immutable snapshots, persistence/reload/reset, denied storage and cross-tab no-write-loop behavior.
- `server/theme-bootstrap.test.ts`: execute actual bootstrap and compare its root attributes with actual runtime decoding/application across all mode/style pairs and malformed/versioned/oversized/denied storage.
- Existing settings and workbench interaction suites: accessible selector, controlled updates, `/projects` subscription and retained session presentation state with no business mutation. Primitive tests preserve semantic variants and state forwarding.
- Run repository typecheck/tests/build. Capture flat before/after and neumorphic light/dark at desktop/390px/320px. Inspect served computed styles, one thin keyboard cue with retained material, nested portal Escape/final focus, mobile navigation, no overflow/clipped controls, reload first-frame attributes and cross-tab synchronization. Use isolated fixtures without paid requests.

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
