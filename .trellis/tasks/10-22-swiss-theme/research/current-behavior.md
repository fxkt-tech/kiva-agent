# Swiss style extension research

Inspected on 2026-10-22 before implementation. Current branch is `main`, synchronized with `origin/main`; the existing `web/next-env.d.ts` edit belongs to the user and must remain untouched.

## Existing ownership

- `web/shared/web-preferences.ts:9` defines only flat/neumorphic style values; `:110` defaults all non-neumorphic inputs to flat. Keep the v1 document and field-wise compatibility behavior when adding the third value.
- `web/lib/web-preferences.ts:21` applies normalized mode/style to root attributes; it currently treats neumorphic as the only non-flat style.
- `web/lib/theme-bootstrap.ts:4` contains the corresponding binary allowlist and shares the existing stored-document length bound. Runtime/bootstrap admission and stale-attribute cleanup must stay equivalent across all three styles.
- `web/features/settings/preferences-panels.tsx:25` owns the display labels. Preserve the recently requested label “扁平化”; add the new option through the existing controlled Select.
- `web/styles/themes.css` owns palettes/material roles. Shared primitives and feature CSS consume these values without style-dependent component trees.

## Presentation gaps relevant to scope

- Existing radius tokens cover generic controls, popups and dialogs. Button retains Tailwind `rounded-lg`; composer and many native feature rows have their own fixed radii. Setting the three existing variables alone cannot produce a coherent sharper Swiss treatment.
- `web/app/globals.css` owns the local Geist font stacks and fixed heading weights/tracking. Existing shared material tokens do not control typography hierarchy. Any needed typography/geometry roles should be small and consumed, preserving exact flat/neumorphic defaults.
- The user confirmed preserving the current layout and information density. Existing visual-system/component contracts therefore remain authoritative for geometry and local fonts; typography variation is limited to visual weight/tracking at existing sizes.
- Avoid changing resource ownership, UI component APIs, portal mechanics or business rendering. The existing third-style request does not require a backend endpoint or dependency.

## Existing regression seams

- `server/web-preferences.test.ts`: independent appearance values, compatibility fallback, persistence/reset and cross-tab behavior.
- `server/theme-bootstrap.test.ts`: actual runtime/pre-paint attribute parity across allowed/invalid modes and styles, malformed/versioned/oversized/denied storage.
- `server/settings-dialog.test.ts`: visible option labels and controlled style selection.
- `server/workbench-interactions.test.ts`: state/attachment/disclosure/DOM retention and cross-tab updates on `/projects` without business mutations.
- Existing theme, component, visual-system and global-settings specs are authoritative. The previous neumorphic task is archived at `.trellis/tasks/archive/2026-10/10-22-neumorphic-theme/`.

## Planning status

No product code changed. Q1 is resolved: preserve current layout/density. Use a minimal shared style admission owner for the third value rather than adding another independent special-case decoder in each layer. Read the authoritative `visual-system.md` sections Scope and ownership, Palette contract, Focus feedback contract, Typography contract, Layout and state contract, Session JSONL viewer and Verification before changing the corresponding presentation. That spec is too large to inject wholesale without truncation; these named sections and the injected theme/component contracts bound the task.
