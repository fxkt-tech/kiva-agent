# Code changes inspection

Static inspection 2026-10-23, baseline c0ad5c7. No runtime timings measured this planning turn.

- Project/session changes App Router pages render ChangesFeature from web/features/changes/changes.tsx, which delegates to WorkspaceBrowser kind=changes. FilesFeature in web/features/files/files.tsx wraps only the files view.
- web/features/files/workspace-browser.tsx:19 always requests workspace; :21 preview omits version; :27 already memoizes changes-tree entries. The previous task's tree optimizations apply to this view already.
- web/server/workspace-reader.ts:load always requests status, prefix, ls-files and branch. A changes view can omit ls-files and its output allocation/transfer. Status itself must still enumerate individual untracked leaves; removing ls-files does not make total cost proportional only to changed paths.
- web/server/workspace-files.ts:17-38 runs synchronous HEAD diff, then conditional synchronous path-specific status, then synchronous file reading/string synthesis for untracked text. maxBuffer is 2,000,000 bytes and no timeout is configured. stdout is returned before exit status is checked. Synthetic output is not separately bounded.
- web/features/workspace/resources.ts:useResource depends on URL/version and guards current request revisions. Existing frontend cancellation prevents late responses from overwriting route identity but does not terminate backend Git. Reuse the guard rather than inventing navigation state.
- web/server/scoped-transport.ts:138,166 returns readProjectDiff synchronously; these call sites need await during async conversion. Session resolveWorkspace remains before reader invocation.
- Existing tests in workspace-files.test.ts cover untracked/no-HEAD preview, path traversal, symlink escapes, rename/deletion, literal pathspecs, binary/size limits and non-Git errors. bootstrap.test.ts (retained filename after prior reader extraction) also checks raw filenames and cross-subdirectory diff behavior. Migrate assertions carefully if functions become async.
- Prior task research/performance.md under archive/2026-10/10-23-project-files-performance documents independent sidebar (~597 ms on 20 MB histories) and picker (~280 ms with eight projects) bottlenecks. These are not addressed by diff-only optimization; measurements must disclose them separately.

Expected comparisons stay HEAD versus current tracked content plus untracked additions. No stage/unstage action or historical comparison is currently provided by this view.
