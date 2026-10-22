# Component Guidelines

## Component boundaries

- `web/components/ui/` contains business-independent primitives. New controls use pinned `@base-ui/react`; retain existing Radix ScrollArea/Slot wrappers. UI modules may import utilities and other UI modules, never features, API clients or application stores.
- `web/components/shared/` contains compositions used by multiple features. `ModelConfigurationFields` combines searchable model selection with its supported thinking levels. `ConfirmDialog` combines confirmation content and actions without issuing requests.
- `web/features/<feature>/` owns resource identity, loading, candidates, validation, pending state and requests. Settings-only `SettingRow` stays in `features/settings/preferences-panels.tsx`.
- `web/shared/` contains frontend/backend data contracts, not React components.

Follow sibling Vera's layering and Base UI composition patterns while retaining Kiva's semantic palette, Geist fonts and 1px focus treatment. Do not import sibling repository source at runtime.

## Controlled fields

`Select<Value extends string | number>` and `Combobox<Value>` accept `value: Value | null`, `options: readonly {value: Value; label: string; disabled?: boolean}[]`, and `onValueChange(value: Value | null)`. Select accepts an accessible name through ARIA; Combobox requires `label`. Both forward ids/refs and support disabled, invalid and compact states. `Input` and `Textarea` forward native props/refs. `Switch` and `Checkbox` use `checked`/`onCheckedChange`.

```tsx
<Select aria-label="主题" value={theme}
  options={[{ value: "system", label: "跟随系统" }, { value: "dark", label: "深色" }]}
  onValueChange={(next) => { if (next) updateTheme(next); }} />
```

`ModelConfigurationFields` accepts models, a controlled complete `ModelConfiguration`, `onChange`, loading/disabled state and field labels. `configurationForModel` keeps the current effort if supported, otherwise prefers `medium`, then the first supported level. Callers retain save endpoints/revisions and default-versus-session semantics. Model selection uses `clearable={false}`; users must choose an actual model.

Keep the selected option object stable across equivalent option-array rebuilds by scalar value, label and disabled state. Base UI synchronizes visible input on selected-object reference changes; unrelated parent/runtime rerenders must not replace an in-progress search query. Actual selection/label changes must still update the field.

Base UI 1.8.0's closed Combobox handles Escape by clearing both input and selection. For `clearable={false}`, cancel the public input/value change details and allow Escape propagation. The first Escape closes the list; the next may close its owning popup. Do not let the input clear while the controlled model remains selected.

## Overlays and focus

Use shared Dialog/AlertDialog, Popover and DropdownMenu compounds. Content owns portals, positioning and surfaces; feature classes own size/content layout. Compose a custom trigger with `render={<Button ... />}` or a native button; preserve Base UI's handlers and ref. React 19 ref props pass through wrappers to the final DOM element.

`DialogContent` accepts initial/final focus, ref/ARIA props and `showCloseButton`. `ConfirmDialog` accepts `open`, `onOpenChange`, title/description/children, confirm/cancel labels, pending/disabled state and `onConfirm`. The feature owns async work and its duplicate-submit guard. Pending writes block dismissals; failed writes retain candidates for retry.

Do not add a DOM-descendant-only focus trap or window Escape handler to a migrated overlay: Select/Combobox lists are portaled outside the dialog element. Base UI owns focus trapping, dismissal and nested Escape. Settings still own category keys, dirty-close decisions and `restoreSettingsFocus` through finalFocus for a closed mobile drawer. Shortcut modal detection includes both `dialog` and `alertdialog`.

`overlay-layer.tsx` carries depth through React context across portals. The first overlay uses layer 120, nested overlays add 20, and a popup sits above its backdrop. Select/Combobox lists sit above their owning overlay. Avoid independent feature z-index/absolute positioning rules. Menu-to-dialog actions suppress menu focus restoration; the dialog restores the exact row trigger. Project search restores the newly revealed input.

## Styles and verification

`components/ui/primitives.css`, imported once by `app/globals.css`, owns control/surface styles: 32px controls, 28px compact fields, semantic tokens and one thin focus indicator. Feature CSS may adjust widths, spacing and embedded field layout; do not recreate native select borders, switch thumbs or popup positioning.

Material/radius values come from `styles/themes.css`; see [Appearance and Theme System](./theme-system.md). Button exposes its existing semantic variant through `data-variant` while retaining its API and Slot behavior. Shared and native feature CSS consume material tokens and state attributes; do not pass visual-style props into business components, add per-style component trees or override every structural shadow. Keep material defaults low enough in specificity for intentional feature treatments and preserve relief alongside the thin focus outline.

Optional action/item/surface corner and heading weight/tracking roles retain each consumer's exact existing fallback. Swiss supplies these overrides without changing font families, type scale, spacing or density. Keep circular actions/thumbs circular, mobile overrides theme-aware and fullscreen JSONL geometry authoritative. Verify old styles with computed before/after comparisons when extending shared roles.

Business suites use `server/helpers/mock-ui.tsx` with Node's `--experimental-test-module-mocks`. Install mocks before dynamically importing consumers. The mock boundary exposes controlled callbacks and omits DOM focus/portal internals; never add a production SSR/test fallback to satisfy react-test-renderer. Real browser acceptance must check nested Escape, tab/final focus, menu arrows and menu-to-dialog transitions, disabled/pending behavior and light/dark 1440px/390px/320px bounds. Keep scoped request, stale response, dirty candidate and async-race assertions in business suites.
