# Directory Structure

The web package lives in `web/` and uses Next App Router with a custom server.

| Path | Responsibility |
| --- | --- |
| `app/` | Routes, root layout, global CSS imports and feature layout CSS |
| `styles/` | Semantic color palettes and visual material tokens in `themes.css` |
| `components/ui/` | Generic controls, overlays, feedback and scrolling primitives; local `primitives.css` |
| `components/shared/` | Compositions reused across features, including `ModelConfigurationFields` and `ConfirmDialog` |
| `components/` | Existing application-level rendering such as message content and extension dialogs |
| `features/settings/` | Settings categories, candidates, safe API client and focus restoration |
| `features/sessions/` | Conversation, composer, model picker, collections and JSONL viewer |
| `features/workspace/` | Persistent shell, project picker/removal, route identity and scoped resources |
| `features/files/`, `features/changes/` | File tree/preview and Git changes |
| `lib/` | Reusable browser hooks, preferences, shortcuts and utilities |
| `shared/` | Types/validators shared by frontend and backend; no UI components |
| `server/` | Backend implementation and tests; `helpers/` holds test-only fixtures/mocks |

Use kebab-case filenames for primitives and existing feature modules, PascalCase filenames for new shared compositions. Extract into `components/shared/` when multiple features share the same controlled UI concept; keep a single-feature wrapper beside its caller. Import application modules through `@/` from UI code, preserving dependency direction: features → shared compositions → UI primitives. See [Component Guidelines](./component-guidelines.md).
