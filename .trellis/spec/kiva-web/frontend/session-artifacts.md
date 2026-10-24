# Session artifacts and executable previews

## 1. Scope / trigger

Use for session-owned image/HTML listings, file provenance, preview resources, the conversation file/preview bubbles and independent preview tabs. File bubbles replace the earlier docked rail; do not reintroduce a permanent inspector. Project file trees and Git changes retain their existing behavior.

## 2. Signatures

`SessionArtifacts({ scope, refreshKey, onSource, children })` owns the same-tree conversation layout, header list Popover and independent floating preview state. Children retain message/composer/runtime identity. The48px transparent header stays outside scrolling; there is no fixed rail or mobile drawer.

Contracts live in `shared/session-artifacts.ts`: `SessionArtifactList`, `SessionArtifact`, `ArtifactSource`, `ArtifactPreviewLease`, and scope-aware wire guards. Lists contain `{ projectId, sessionId, artifacts, revision, complete, warnings }`. Artifact identities derive from exact scope and normalized file location, not list position or filenames alone; preserve existing internal relative-path IDs while deduplicating canonical aliases.

- `GET /api/projects/:projectId/sessions/:sessionId/artifacts` reads the passive list.
- `GET .../artifacts/:artifactId/content` reads the associated file only, as raw image or plain-text HTML.
- `POST .../artifacts/:artifactId/preview` creates a bounded, independent in-memory lease and returns its document URL.
- `DELETE .../artifacts/previews/:leaseId` revokes that instance.
- `GET /preview/:token/<path>` serves only the lease's explicit document/dependency allowlist.
- `GET /artifact-preview/:projectId/:sessionId/:artifactId` is a stable custom-server direct document/image resource: it validates exact session association, creates an independent bounded lease and returns the raw preview response, not a Next page/iframe/UI wrapper. Refresh recreates the resource lease, never starts Pi.

`server/artifact-files.ts` owns `inspectArtifactFile(absolutePath)`, `validateArtifactFile(locator)` and `readArtifactFile(locator, maxBytes)`. A locator contains the trusted logical path, canonical path and dev/ino; a legitimate alias is resolved once, then substitution is rejected around bounded descriptor reads. `rewriteArtifactResourceUrls(path, content, rewrite)` in the dependency parser rewrites only syntax-declared resource sites; fetch uses the document base and imports/import.meta URLs use the resource base.

Preview resource URLs use `/preview/:token/fs/<segment-encoded logical absolute path>`. This is a virtual exact-file map, not a filesystem route accepting arbitrary paths. Static local references are rewritten in response memory (including absolute/file URLs); originals are never edited, anchors and remote resources retain their semantics.

`ArtifactPreview` accepts optional `renderToolbar({ controls, currentVersion })`; controls retain state ownership and include compact source/secondary actions through the shared overflow menu. `ArtifactPreviewService.serveDocument(scope, artifactId, response, origin)` emits a direct stable-URL response through the same exact-resource renderer as token assets.

## 3. Contracts

Provenance comes from visible-branch successful structured tools and explicit local file references. `written`, `referenced` and `inherited` are distinct relations; a successful write/edit does not prove the path was newly created. A generated-file binding also requires a unique tool-call ID in the effective visible branch and a matching result tool name when present; duplicate IDs or name mismatches report incomplete provenance instead of assigning a result to the last call. Explicit output paths may still remain references. Uploads, inline base64, code-fence examples and arbitrary shell side effects do not become disk artifacts. Do not enumerate the workspace to guess ownership. Stable transcript entry/tool-call IDs own source links, never `history-N` projection positions.

The session owns artifact association, not a filesystem-directory sandbox. The user explicitly allows associated image/HTML files outside the execution directory; relative references resolve against its recorded execution directory and absolute references locate the exact file. HTML dependencies may cross directories through the same exact lease allowlist. Project files/diff endpoints retain their separate directory sandbox. Validate ownership before sharing pending work and again before serving bytes; preserve descriptor-based normal-file checks, canonical target identity/substitution guards and byte limits. Do not treat the entire filesystem as a project root. HTTP resource paths cannot introduce files outside the lease allowlist, even though explicit transcript ../ references may locate authorized files. Missing/removed workspaces never fall back to the original project, but do not block separately resolvable external absolute artifacts merely because the old directory was removed. Preview content is the current disk version, not a historical snapshot. File disappearance remains a truthful unavailable row.

Metadata is demanded while the list Popover, default modal or floating preview is open, so completed turns can update current-file notices without restarting an iframe. When all hosts close, metadata demand stops. Only explicit preview selection reads bodies or runs scripts. Merge completion invalidations instead of scanning on every token. Incomplete indexing and errors are distinct from an empty list. Resource reads and preview setup never create/acquire/continue a model runtime or modify histories.

Inside the conversation, the header output button toggles a bounded Base UI list Popover titled “输出”, closed by default, and never consumes conversation layout width. Use a simple down chevron when closed and an up chevron when open, matching the restrained sidebar-toggle stroke; the output heading uses a file/list glyph rather than a panel-collapse symbol. Cancel outside-press and focus-out close reasons through Base UI public change details; outside conversation click/typing remains usable. Trigger toggle and the list's own Escape retain close behavior; default modal selection keeps the list open (including filter/scroll/row state). Escape in the modal closes only that top host, not its background list. Do not make the list modal merely to keep it open. Rows use a compact approximately44px layout with icon/name, optional small parent directory, concise inline state and always reachable right actions, without a separate details row. Full paths remain accessible. The default row action remains a shared Dialog without dismissing the list; a separate link opens an independent raw-document tab. The former side preview is now one nonmodal floating preview bubble with titlebar dragging, width/height resize handles and close. Both default modal and floating host have exactly one compact header combining title, source/secondary action menu, existing content tools and close; the floating title additionally handles dragging. Neither has a separate title/tool/source row. Default modal reuses the toolbar slot without adding drag behavior. ArtifactPreview exposes a compositional toolbar slot while retaining state; narrow windows use a shared overflow menu instead of wrapping an extra header or removing functions. Geometry updates and list dismissal must retain the mounted ArtifactPreview/iframe and its interaction state. Closing the floating window or selecting another file releases only that instance's lease. Source focus restoration falls back to the persistent header trigger when the row is unmounted. Never keep the default Dialog inside a subtree that disappears when the list is dismissed.

Apply a bounded reading-column left alignment on sufficiently wide desktop viewports while either bubble is open; reset when all close. Preserve readable width on small viewports, clamp floating geometry after resize/rotation and provide keyboard move/resize support. Use pointer capture with cancel/lost-capture cleanup and do not intercept normal iframe/conversation input outside an active gesture. Reuse overlay-layer context so dialogs/menus appear above their hosts. Source-menu transitions must focus the global JSONL viewer correctly when the floating/menu hosts unmount. The preview is nonmodal; it must not trap conversation focus or close merely because the list is retracted. New tabs retain stable scope/artifact URL, noopener and independent lease/reload semantics, but render only original document content or native image view: no KivA header, toolbar, iframe or loader host. Remove the old App Router wrapper. Use the same exact-resource response builder and response-level sandbox even top-level. Old raw leases are TTL-reclaimed after close, because no app pagehide handler is injected.

HTML documents require both iframe `sandbox="allow-scripts"` and response CSP sandbox; never add `allow-same-origin` to make a dependency work. Apply response-level restrictions even to a directly opened document. SVG is an image with a nonexecuting document policy, not inline DOM. Explicit local dependencies may receive anonymous CORS only through the capability path; business APIs never gain wildcard/null-origin CORS. Local dependency discovery is bounded and syntax-aware, not an entire-directory grant.

Allow approved HTTPS external resources/API and external secure connections subject to normal browser CORS; never promise arbitrary third-party APIs work, proxy remote requests through KivA, or inject installation credentials. A sandbox may communicate externally with the artifact data it is explicitly given. It must not gain parent DOM/storage or business API access. Server origin/WebSocket boundaries, not replaceable JS wrappers, protect the application. Do not trust `Origin: null` or an arbitrary `postMessage` as identity.

Each preview instance owns its lease and iframe; changing/closing that instance revokes only its own capability. Server expiration handles abandoned tabs. Shutdown releases leases. Do not log tokens or send them in external referrers. No persistent index, user-history mutation, second preview server or dependency on the separate proxy feature is implied.

## 4. Validation and error matrix

| Condition | Required behavior |
| --- | --- |
| Wrong project/session pair or unknown artifact | Scoped failure, no fallback file |
| Failed write/read, shell without path evidence | No generated-file claim |
| Incomplete history/index budget or malformed data | Explicit completeness/warning/error, not false empty success |
| Missing file/removed workspace | Retained provenance and unavailable state |
| Client path spoofing, target substitution, FIFO, unlisted dependency | Reject safely before serving arbitrary bytes |
| Explicit session reference outside workspace | Preview the exact associated image/HTML; do not require copying or reject only by directory |
| Dependency absent from exact allowlist | Deny and expose diagnostic; never widen to directory |
| Business request from preview/opaque origin | Reject/withhold business data; no CORS exception |
| Canonical target or symlink substituted after lease creation | `artifact_file_changed`, 409; reopen to establish the new current-file identity |
| Expired/revoked/cross-scope lease | Deny; explicit refresh can create a new instance |
| Raw document non-GET/query/foreign or opaque origin/embedded fetch | 405/400/403 respectively, no lease creation or runtime acquisition |
| Raw native image document | Original image MIME/bytes; nonexecuting sandbox permits native viewer inline styles only, no CORS or extra resource grants |
| External service rejects CORS | Explain/browser diagnostic; do not weaken sandbox |
| Delayed request after navigation | Ignore old result; preserve current scope/draft |

## 5. Good / base / bad cases

Good: two sessions share a directory, each lists only its own referenced artifacts; opening a third-party-script HTML uses an isolated document and explicit assets. Base: an image opens in the default dialog, while a separate new-tab preview survives switching conversations. Bad: enumerate `*.html` in the repository and call every match a current-session output, add `allow-same-origin`, revoke all tabs when a dialog closes, or treat a truncated JSONL prefix as complete evidence.

## 6. Tests required

Cover generated/reference/inherited relations, current branch and failed tools, upload/code-fence exclusion, duplicate literal paths, old histories, long/partial/malformed inputs, shared-directory isolation, external absolute/../ references, canonical aliases and cross-directory dependency mapping, demand-driven reads, pending sharing and later freshness. Retain existing files/diff safety/semantics suites.

Use temporary Git/history roots and deterministic adapters. Real browser acceptance checks default dialog, floating preview drag/resize/close with usable conversation/composer and list toggle, independent new-tab/no-opener/reload, focus/Escape, source links, stale scope isolation, 1440/390/320px and light/dark. Exercise inline JS, CSS/ES modules/JSON, controlled HTTPS resources/API, DOM/storage/API/WS denial and directly opened document restrictions. Do not test with actual user histories, paid prompts or authentication secrets.

Run package/root type checks, meaningful suites, production build, task context validation and diff checks before reporting completion.

## 7. Wrong vs correct

Wrong: `selected HTML -> app DOM`, `read link -> arbitrary disk path`, `new tab -> reuse dialog token`, `CORS failure -> allow-same-origin`.

Correct: `exact session evidence -> scoped artifact ID -> validated file -> instance lease -> response-sandboxed document`, with the list popover, dialog, floating preview and new tab sharing a renderer but retaining independent lifetimes.
