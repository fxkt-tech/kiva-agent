# Theme boundary research

Inspected on 2026-10-22. This is one integrated web presentation task; no backend work or new dependency is needed.

## Existing owners and evidence

| Boundary | Evidence | Implication |
| --- | --- | --- |
| Preference schema | `web/shared/web-preferences.ts:7`, `:12`, `:24`, `:107` | Add a field-wise optional-on-read visual style to the existing v1 appearance document; preserve the color-mode field and other defaults. |
| Preference lifecycle | `web/lib/web-preferences.ts:21`, `:40`, `:49`, `:55`, `:83` | Initialization, local changes, external storage changes and group reset must apply both appearance dimensions through one store. |
| Pre-paint initialization | `web/lib/theme-bootstrap.ts:4`, `web/app/layout.tsx:16` | Extend the existing allowlisted script; preserve the root-only hydration seam and cache-recovery script. |
| Persistent subscription | `web/features/workspace/shell.tsx:50` | The shell already mounts the preference subscription even on `/projects`; do not introduce another subscription or remount it for a style change. |
| Settings controls | `web/features/settings/preferences-panels.tsx:21` | Add an independent visual-style Select using the existing controlled SettingRow/Select composition and auto-save mechanism. |
| Shared controls | `web/components/ui/primitives.css:8`, `:25`, `:54`, `:85`, `:93` | Palette is semantic; field geometry and focus resets need material-aware variables. Base UI already exposes checked, disabled, selected and highlighted states. |
| Shared buttons | `web/components/ui/button.tsx:7`, `:11`, `:25` | Preserve the current Button API and `ui-button` hook. Expose variant semantics as a stable data attribute if CSS needs them; do not pass a theme prop through consumers. |
| Feature presentation | `web/app/globals.css:195`, `:222`, `:370`, `:385`, `:425`, `:481` | Include native sidebar/composer/preview actions in the CSS audit; styling shared primitives alone leaves visible gaps. |
| Structural shadows | `web/app/globals.css:534`, `:542`, `:561` | Full-screen JSONL geometry and the selected-record highlight are intentional. Do not replace every box-shadow or radius mechanically. |
| Portals | `web/components/ui/dialog.tsx`, `web/components/ui/select.tsx`, `web/components/ui/overlay-layer.tsx` | Root variables reach body portals. Layering, focus restoration and dismissal do not need a new implementation. |

## Existing verification seams

- `web/server/web-preferences.test.ts`: field-wise defaults, retained valid fields, immutable snapshots, initialization without writes, group reset, cross-tab synchronization, denied storage and partial browser environments.
- `web/server/theme-bootstrap.test.ts`: executes the actual pre-paint script in a VM, tests invalid/versioned/denied storage and immediate runtime application, and checks the root-only hydration seam.
- `web/server/workbench-interactions.test.ts:658`: verifies cross-tab appearance application on `/projects` without a composer. Extend this and the existing settings/draft fixtures rather than creating another preference owner.
- `web/server/ui-primitives.test.ts`: actual wrapper contracts, state forwarding and controlled callbacks. Feature suites mock Base UI through `server/helpers/mock-ui.tsx`; never add a production fallback to satisfy them.
- Root scripts provide `pnpm typecheck`, `pnpm test` and `pnpm web:build`. There is no root lint script.

## Design constraints resolved from evidence

- Keep `appearance.theme` and `data-theme` for color mode. Use a separate `appearance.visualStyle` and root `data-visual-style` attribute for material style; an absent attribute represents flat.
- Keep the existing storage key and version. Older documents have no visual-style field and decode as flat without a migration write. No server settings endpoint participates.
- Move the existing palette into one theme stylesheet and add only the material tokens consumed by present controls/surfaces. Avoid a registry, runtime theme engine or component duplication.
- Preserve current flat token values exactly. Use CSS to map states to material roles, retaining shape/spacing and the existing thin outline as the keyboard cue.
- Match neutral surfaces to their containing material in neumorphic mode, while retaining foreground/status contrast. Dense content does not need a shadow on every row.
- No technical blocker remains. Shadow strength and tint are visual tuning within the approved style scope; final browser evidence must demonstrate both themes and flat preservation.

## Workspace boundary

`web/next-env.d.ts` was already modified before this task. Preserve that change. Task creation reported an existing default-package name mismatch in `.trellis/config.yaml`; record `kiva-web` on this task rather than changing unrelated project configuration.
