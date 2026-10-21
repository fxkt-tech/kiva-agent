# UI foundations design

Use pinned @base-ui/react 1.8.0, matching the installed sibling Vera reference. Retain existing Radix ScrollArea/Slot wrappers unless a specific integration requires otherwise. Primitives own styles, portal/keyboard/focus behavior; feature modules own requests and state. Use components/shared only for actual cross-feature compositions. web/shared remains the frontend/backend contract directory.

## Shared contracts

- ui/select.tsx: generic Select<Value extends string | number>, controlled value Value|null, options {value,label,disabled?}[], onValueChange(Value|null), placeholder/disabled/className/id/name/aria-label/aria-invalid/aria-describedby. This compact field owns Base UI trigger/value/popup/items; callers own labels and value decoding.
- ui/combobox.tsx: searchable generic Combobox with the same options/value contract, required label string, loading/disabled/clearable/emptyText/className. Adapt Vera's implementation to Kiva tokens.
- ui/input.tsx and textarea.tsx: drop-in native props/refs. ui/switch.tsx and checkbox.tsx: checked/onCheckedChange plus accessible native Base UI props.
- ui/dialog.tsx and alert-dialog.tsx: controlled compound Root, Content, Title, Description, Header, Footer, Close/Trigger exports. Content forwards initialFocus/finalFocus refs or callbacks, className, ref and ARIA props; portals and backdrop are inside Content. showCloseButton defaults true and can be false for existing feature headers. Root onOpenChange stays feature-controlled for dirty/pending protection.
- ui/popover.tsx: Popover/PopoverTrigger/PopoverContent with render composition and side/align/offset props. ui/dropdown-menu.tsx: DropdownMenu/Trigger/Content/Item/Separator; Item supports onClick, disabled and destructive variant. Preserve trigger nativeButton/render composition.
- components/shared/ModelConfigurationFields.tsx: shared pure controlled model/effort pair fields, accepts available models, value/onChange, labels/disabled state. Default/session save operations remain separate.
- components/shared/ConfirmDialog.tsx: controlled open/onOpenChange, title, description/children, confirm/cancel text, pending/disabled, onConfirm. No requests in the shared composition.

## Styling and ownership

Primitives use a dedicated components/ui/primitives.css imported once by globals.css. Semantic Kiva tokens, 32px default controls, optional compact controls, consistent error/disabled states and 1px focus. Remove feature selectors that style native select/input or compete with shared popup geometry after migration. Feature classes retain placement/layout only. Portals inherit root theme; avoid Vera-specific app-theme/cn-menu classes.

Foundation implementer owns UI primitive files and their CSS only. Settings implementer owns features/settings, sessions/model-settings.tsx, composer.tsx, shared model fields and focused settings tests. Workspace implementer owns project/session menus/dialogs and shared ConfirmDialog. Main agent owns globals.css cleanup/import, integration tests, spec updates and browser validation. No agent reverts previous work or edits another owner's files without coordination.

## Risks

Replace manual modal focus traps/window Escape listeners when migrating to Base UI; nested portals must not be trapped by old DOM-descendant queries. Preserve restoreSettingsFocus mobile fallback through finalFocus. Native-select interaction tests must exercise the new public control/keyboard behavior. Keep async model/provider/delete race protections intact.

## Verified integration details

- Non-clearable Combobox cancels Base UI 1.8.0 escape-key input clearing and null selection through public event details, allowing the owning popup to handle the next Escape. Stabilize the selected option object across equivalent option-list rebuilds by value/label/disabled, preserving typed search during unrelated runtime updates.
- Settings Toast lives inside DialogContent to stay outside modal inerting, with local absolute placement; other Toasts retain viewport placement.
- Business renderer tests mock local UI primitives before dynamic feature imports with Node experimental module mocks. Actual Base UI keyboard/portal/focus behavior is verified in browser fixtures.
