# Sidebar evidence

Current persistent shell is `web/features/workspace/shell.tsx`. Main nav already has icons and exact scoped URL navigation; project tree contains project name toggle, explicit new-session button, project menu(search/removal), query-backed search and session action menus. Sidebar footer settings is already icon + text. Do not turn layout toggling into project/session switching or runtime command calls.

`globals.css` owns the252px grid rail,60px brand header, sidebar scrolling and <=720px overlay drawer. A collapsed desktop width must be introduced through a scoped layout state/token, not by globally changing the existing mobile rule. Brand mark is a25px masked `/icon.svg`; text logo home navigation is currently on brand text, so compact logo needs its own accessible home link if text is hidden.

Previous session/sidebar work is available in current specs and archived task artifacts; session-insight skill explicitly says not to call mem when needed context is already present. No history CLI retrieval is needed for these code-answerable facts.

The initial project-icon popup choice was superseded by the latest user request: compact project area has exactly plus and More; hover More shows all projects with their sessions. Preserve existing ProjectGroup actions through the shared browser.

## Project popup integration

- `shell.tsx:176` ProjectGroup already owns expanded/search/filter/menu state; collection demand currently depends on expanded and current route collection. Compact mode should demand a list only for the open project popup, share the existing SessionListsProvider cache and never duplicate sidebar collection requests.
- `collections.tsx:26` SessionRows owns rename/delete/action-error state and reads shared JSONL viewer context. Moving its rendered content into a closing popup can unmount dialogs; split stable action/dialog ownership from presentation if necessary, retaining existing standalone collection behavior. A UI relocation must not discard pending renames/deletion or restore focus to a detached row.
- Opening another project popup should only browse passive session summaries; actual navigation/new-session remains explicit and cannot interrupt a running conversation.
- `shared/web-preferences.ts` and `frontend/global-settings.md` define v1 field-wise browser preferences with cross-tab subscription and no initialization writes. User explicitly requires persistence and a settings entry; use one appearance field shared by header and settings.

## Shared hover browser follow-up
- Pinned BaseUI PopoverTrigger types expose openOnHover, delay and closeDelay; implementation uses safePolygon for trigger-to-popup pointer transit. Use these public props and real browser verification.
- Keep the existing ProjectGroup/SessionRows owners mounted and declaratively portal only presentation into registry-ordered popup slots. This avoids remounting pending rename/delete candidates and preserves current refs/caches without an action-host rewrite.
- Native hover ancestry requires verification for portaled project content: nested menus/dialogs must retain the browser while being operated. Any dismissal guard should be local and reflect active interactions rather than a new window listener.
- Compact demand now follows the shared browser and expanded groups; all closed-browser groups release demand. Current-project prioritization and bounded background starts remain owned by SessionListStore.

## Outside-click dismissal and portal ancestry
A real Chromium run confirmed that the project action menu's Search item was classified as an outside press when blanket outside cancellation was removed. Declarative createPortal retains its controller's React context, not the context of the target DOM slot. BaseUI supplies floating-node ancestry in Popover.Positioner, so our stable controllers' menus do not automatically inherit that ancestry merely by rendering into the popup's DOM. The controlled browser must distinguish active nested menu/dialog interaction from a genuine external press, using public overlay semantics. Do not import private FloatingUI context or globally disable outside dismissal; external composer clicks must close even while a menu is active. The output popup has a separate explicit no-outside-dismiss requirement.
