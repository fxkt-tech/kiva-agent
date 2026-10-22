# Design

Status: implementation approved by the user ("开始实现") on 2026-10-22 after the final planning summary.

## 1. Appearance contract

Keep the two dimensions independent:

```ts
type ThemePreference = "system" | "light" | "dark";
type VisualStylePreference = "flat" | "neumorphic";
// Existing appearance fields remain in place.
appearance: { theme, visualStyle, conversationFontSize, wrapCode }
```

`shared/web-preferences.ts` owns the visual-style type, default `flat` and field-wise decoder. Retain `kiva:web-preferences:v1` and `version: 1`; missing/invalid style affects only that field. Loading an older document performs no write. Appearance reset restores system mode, flat style and the existing appearance defaults together.

`lib/web-preferences.ts` applies the normalized color mode and visual style through one appearance helper and one environment callback. Replace the theme-only callback coherently in the store and its test fixtures; do not add an optional second lifecycle that some paths forget to invoke.

| Selection | Root representation |
| --- | --- |
| System color mode | No `data-theme`; CSS follows the OS |
| Explicit light/dark | Existing `data-theme="light"` / `"dark"` |
| Flat style | No `data-visual-style`; baseline CSS applies |
| Neumorphic style | `data-visual-style="neumorphic"` |

The existing bootstrap applies both allowlisted attributes before paint. Runtime initialization, updates, storage events, malformed input and reset converge on the same attribute outcomes. The script may embed build-time allowlist/default constants; never interpolate stored values as script. Keep current fallback behavior for missing, malformed, unsupported-version or denied storage. Preserve root-only hydration suppression and legacy cache recovery.

Data flow: Settings Select → existing preference update/decoder → existing immutable store and localStorage → root appearance helper → CSS variables → existing controls. A sibling storage event enters the same decoder/application path without echoing a write. An OS change remains CSS-owned and cannot change visual style.

## 2. Theme and presentation ownership

Create `web/styles/themes.css`, imported once by `app/globals.css`, to own the current light/dark semantic palette and the material variables for both styles. Keep typography, responsive geometry and feature layout in their existing owners. Verify import/cascade behavior in the built and served CSS.

Use a small set of semantic material roles, with aliases where roles share values:

- Control/field/popup radius and border tokens where style variation is needed; preserve existing values for flat mode and keep circular controls circular.
- Raised, inset, hover and pressed shadow roles for controls and fields.
- Separate popup and composer shadow roles so their existing flat treatments are preserved, rather than assigning one shadow to every surface.
- Existing palette and interaction/status tokens remain authoritative for text, backgrounds, selection, errors and focus.

Only `themes.css` selects a visual style. `primitives.css` and feature CSS consume semantic variables and existing state attributes. A component may expose its existing semantic variant through `data-variant`; no component needs a theme prop, a style-dependent render branch or a different React key. Do not mechanically parameterize every numerical dimension or replace structural shadows such as JSONL record highlighting.

`components/ui/button.tsx` retains all existing variants, sizes, props and Slot behavior. Shared CSS owns its material states. Base UI Switch/Checkbox/Select/Combobox continue exposing their existing checked/highlighted/disabled semantics; preserve native and ARIA state behavior.

## 3. Visible style coverage

| Surface | Neumorphic treatment | Retained behavior |
| --- | --- | --- |
| Primary/secondary/outline actions | Restrained raised resting surface, clear hover, inset press | Existing action hierarchy, destructive semantics, size and disabled behavior |
| Ghost/icon actions | Quiet at rest, material feedback on hover/press where useful | Dense toolbar spacing and transparent resting behavior |
| Inputs, textareas, combobox fields and search | Inset field material | Error border, placeholder, native editing and thin keyboard outline |
| Switches and checkboxes | Inset track/well with a raised thumb or selected element | Clear checked/indeterminate/disabled states and existing keyboard operation |
| Composer | One coherent inset or raised container surface, tuned with the field role | Existing textarea growth, action positions, drafts and focus-within cue |
| Dialogs, menus, popovers, commands and Toasts | Distinct floating material with sufficient backdrop separation | Portal layers, bounds, scrolling, dismissal and focus restoration |
| Sidebar/settings navigation and native preview actions | Subtle selected/pressed material through semantic state tokens | Current compact rows, hit targets and layout |
| Messages, Markdown, code, file/diff and JSONL content | Existing compact content with compatible palette | Text/status readability, selection, exact source content and full-screen viewer geometry |

Use neutral, related background surfaces for the neumorphic light and dark variants and a consistent upper-left light direction. Outer/inset shadows supplement borders, text and state markers; they are not the sole distinction for keyboard focus, errors or selection. Preserve the current single thin focus outline; revise any `box-shadow: none` reset that would erase the field's material while focused without introducing a second focus ring.

## 4. Files and boundaries

Expected product changes: `shared/web-preferences.ts`, `lib/web-preferences.ts`, `lib/theme-bootstrap.ts`, `features/settings/preferences-panels.tsx`, `components/ui/button.tsx`, `components/ui/primitives.css`, `app/globals.css` and new `styles/themes.css`. RootLayout may need its appearance comment updated. Prefer existing class/state hooks over changing feature JSX.

Extend the existing preference, bootstrap, primitive and workbench-interaction tests where contracts change. Update the owning frontend visual-system, component and global-settings specs after verification. Do not edit backend services, runtime hooks, requests, resource identity or route logic. The existing dirty `web/next-env.d.ts` is outside task ownership.

## 5. Compatibility, risks and rollback

- Flat preservation is checked against pre-change computed styles and screenshots; extracting tokens is not permission to normalize existing geometry or alter the palette.
- The main risks are dark-mode material contrast, CSS precedence between Tailwind/components/features, and shadows clipped by dense or scrolling containers. Inspect served computed styles and representative actual states at desktop/390px/320px.
- Keep mode/style switching within the mounted tree. Verify retained draft/attachment/disclosure state and zero business mutation requests during toggles; use fixtures and no paid model request.
- Rollback is switching to flat or reverting this task's presentation/preferences changes. Saved unknown visual-style fields are ignored by the previous decoder; keep all other browser preferences and business data. Never clear storage as migration or rollback.
- No external dependencies or backend migration are required. User-authored themes and broader layout redesign remain deferred.
