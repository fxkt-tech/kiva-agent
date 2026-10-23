import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { buildWorkspaceTree, WorkspaceTree, type WorkspaceTreeNode } from "../features/files/workspace-tree";
import { WorkspaceBrowser } from "../features/files/workspace-browser";
import { WorkspaceShell, useWorkspace } from "../features/workspace/shell";
import type { DraftStore } from "../features/sessions/drafts";
import type { WorkspaceData } from "../shared/types";
import type { ProjectResource, SessionResource } from "../shared/workspace-contract";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
const event = (key = "") => ({ key, preventDefault() {}, stopPropagation() {} });
function flatten(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] { return nodes.flatMap((node) => [node, ...(node.kind === "directory" ? flatten(node.children) : [])]); }

describe("workspace path trees", () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(async () => { if (renderer) await act(() => renderer!.unmount()); renderer = undefined; });
  const item = (path: string, kind = "file") => renderer!.root.findAllByProps({ role: "treeitem" }).find((node) => node.props["data-path"] === path && node.props["data-kind"] === kind)!;
  const row = (path: string, kind = "file") => item(path, kind).findAllByProps({ className: "workspace-tree-row" }).find((node) => node.props["data-path"] === path && node.props["data-kind"] === kind)!;
  async function click(path: string, kind = "file") { await act(() => row(path, kind).props.onClick(event())); }
  async function key(path: string, value: string, kind = "file") { await act(() => item(path, kind).props.onKeyDown(event(value))); }

  it("builds sorted directories and basename leaves without changing any raw path", () => {
    const paths = ["z.txt", "src/z.ts", "src/nested/中文 空 格.ts", "src/nested/line\nbreak.ts", "src/nested/ literal → name ", ":(glob)*.ts", "src/A.ts", "src/a.ts", "a-dir/child", "constructor/toString", "__proto__/file", "src\\literal.ts"];
    const entries = paths.map((path) => ({ path }));
    const tree = buildWorkspaceTree(entries);
    assert.deepEqual(tree.map(({ name, kind }) => [name, kind]), [["__proto__", "directory"], ["a-dir", "directory"], ["constructor", "directory"], ["src", "directory"], [":(glob)*.ts", "file"], ["src\\literal.ts", "file"], ["z.txt", "file"]]);
    assert.deepEqual(flatten(tree).filter((node) => node.kind === "file").map((node) => node.path).sort(), paths.toSorted());
    assert.equal(flatten(tree).find((node) => node.path === "src/nested/ literal → name ")?.name, " literal → name ");
    assert.deepEqual(buildWorkspaceTree(entries.toReversed()), tree, "sorting must not depend on backend listing order");
    assert.deepEqual(entries.map(({ path }) => path), paths, "construction never mutates the resource list");
  });

  it("keeps deleted file/directory name collisions distinct and projects Git status accessibly", async () => {
    const entries = [{ path: "src", status: "D" }, { path: "src/new.ts", status: "??" }, { path: "renamed.ts", status: "RM" }, { path: "conflict.ts", status: "UU" }];
    const tree = buildWorkspaceTree(entries);
    assert.equal(tree.filter((node) => node.path === "src").length, 2);
    await act(() => { renderer = create(createElement(WorkspaceTree, { entries, rootName: "Alpha", scope: "原项目目录", onSelect() {} })); });
    assert.equal(item("src", "directory").props["aria-expanded"], false);
    assert.equal(item("src").findByProps({ className: "workspace-tree-status" }).props["aria-label"], "已删除");
    assert.equal(text(item("renamed.ts").findByProps({ className: "workspace-tree-status" })), "R");
    assert.equal(item("conflict.ts").findByProps({ className: "workspace-tree-status" }).props["aria-label"], "存在冲突");
    await click("src", "directory");
    assert.equal(item("src/new.ts").findByProps({ className: "workspace-tree-status" }).props["aria-label"], "未跟踪");
  });

  it("discloses directories without selecting, reveals changed deep links, and allows collapse-all", async () => {
    const selected: string[] = [];
    const entries = [{ path: "src/nested/deep.ts" }, { path: "other/final.ts" }];
    const render = (selectedPath?: string) => createElement(WorkspaceTree, { entries, selectedPath, rootName: "Alpha", scope: "会话工作区", onSelect: (path: string) => selected.push(path) });
    await act(() => { renderer = create(render("src/nested/deep.ts")); });
    assert.equal(item("src", "directory").props["aria-expanded"], true);
    assert.equal(item("src/nested", "directory").props["aria-expanded"], true);
    assert.equal(item("src/nested/deep.ts").props["aria-selected"], true);
    await click("src/nested", "directory");
    assert.equal(item("src/nested", "directory").props["aria-expanded"], false);
    assert.deepEqual(selected, []);
    await act(() => renderer!.update(render("other/final.ts")));
    assert.equal(item("other", "directory").props["aria-expanded"], true);
    await click("other/final.ts");
    assert.deepEqual(selected, ["other/final.ts"]);
    await act(() => renderer!.root.findByProps({ "aria-label": "全部折叠" }).props.onClick());
    assert.equal(item("other", "directory").props["aria-expanded"], false);
    await act(() => renderer!.update(render("src/nested/deep.ts")));
    assert.equal(item("src/nested/deep.ts").props["aria-selected"], true, "Back/Forward selection reveals every ancestor again");
  });

  it("supports roving focus, arrows, Home/End, activation and type-ahead without selecting on focus", async () => {
    const selected: string[] = []; const focused: string[] = [];
    const entries = [{ path: "src/nested/deep.ts" }, { path: "README.md" }, { path: "z.txt" }];
    await act(() => { renderer = create(createElement(WorkspaceTree, { entries, rootName: "Alpha", scope: "原项目目录", onSelect: (path: string) => selected.push(path) }), { createNodeMock: (element) => {
      const props = element.props as { "data-path"?: string };
      return element.type === "li" ? { focus: () => focused.push(String(props["data-path"])) } : null;
    } }); });
    assert.equal(item("src", "directory").props.tabIndex, 0);
    await key("src", "ArrowRight", "directory");
    assert.equal(item("src", "directory").props["aria-expanded"], true);
    await key("src", "ArrowRight", "directory");
    assert.equal(item("src/nested", "directory").props.tabIndex, 0);
    await key("src/nested", " ", "directory");
    await key("src/nested", "ArrowDown", "directory");
    assert.equal(item("src/nested/deep.ts").props.tabIndex, 0);
    assert.deepEqual(selected, []);
    await key("src/nested/deep.ts", "Enter");
    assert.deepEqual(selected, ["src/nested/deep.ts"]);
    await key("src/nested/deep.ts", "ArrowLeft");
    assert.equal(item("src/nested", "directory").props.tabIndex, 0);
    await key("src/nested", "ArrowLeft", "directory");
    assert.equal(item("src/nested", "directory").props["aria-expanded"], false);
    await key("src/nested", "End", "directory");
    assert.equal(item("z.txt").props.tabIndex, 0);
    await key("z.txt", "ArrowUp");
    assert.equal(item("README.md").props.tabIndex, 0);
    await key("README.md", "Home");
    assert.equal(item("src", "directory").props.tabIndex, 0);
    await key("src", "r", "directory");
    assert.equal(item("README.md").props.tabIndex, 0);
    assert.deepEqual(focused.slice(-2), ["src", "README.md"]);
    assert.equal(renderer!.root.findAllByProps({ role: "treeitem", tabIndex: 0 }).length, 1);
    assert.deepEqual(selected, ["src/nested/deep.ts"]);
  });

  it("renders a scoped, compact empty explorer without an empty ARIA tree", async () => {
    await act(() => { renderer = create(createElement(WorkspaceTree, { entries: [], rootName: "Alpha", scope: "原项目目录", rootTitle: "/repo · main", emptyMessage: "工作区没有未提交变更", onSelect() {} })); });
    assert.equal(renderer!.root.findAllByProps({ role: "tree" }).length, 0);
    assert.match(text(renderer!.root), /Alpha原项目目录工作区没有未提交变更/);
    assert.equal(renderer!.root.findByProps({ "aria-label": "全部折叠" }).props.disabled, true);
  });
});

describe("scoped file and change trees", () => {
  let renderer: ReactTestRenderer | undefined;
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.sessionStorage;
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount()); renderer = undefined;
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["window", originalWindow], ["sessionStorage", originalStorage]] as const) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name); else Object.defineProperty(globalThis, name, { configurable: true, value });
    }
  });
  it("keeps tree entries stable through selection and preview reads, and refreshes changed listing data", async () => {
    const project: ProjectResource = { id: "alpha", name: "Alpha", path: "/repo", capability: { state: "ready", branch: "main", head: "base", commonDirectory: "/repo/.git", repositoryRoot: "/repo", projectSubdirectory: "" } };
    let workspace: WorkspaceData = { renderedAt: "2026-10-21", project: { name: "Alpha", path: "/repo", branch: "main", dirtyFiles: 1, files: ["src/first.ts", "src/second.ts"], changes: [{ path: "src/first.ts", status: "M" }] } };
    let refresh: (() => void) | undefined;
    let resolvePreview: ((response: Response) => void) | undefined;
    let deferPreview = false;
    const requests: string[] = [];
    function Probe() { refresh = useWorkspace().refresh; return null; }
    Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { setItem() {} } });
    globalThis.fetch = async (input) => {
      const url = String(input); requests.push(url);
      if (url === "/api/projects") return Response.json({ projects: [project] });
      if (url === "/api/projects/alpha") return Response.json({ project });
      if (url.endsWith("/models")) return Response.json({ models: [] });
      if (url.endsWith("/sessions")) return Response.json({ active: [], archived: [], trash: [] });
      if (url.endsWith("/workspace")) return Response.json(workspace);
      if (deferPreview) return new Promise<Response>((resolve) => { resolvePreview = resolve; });
      return Response.json({ path: new URL(url, "http://localhost").searchParams.get("path"), content: "preview" });
    };
    async function render(path: string) {
      const element = createElement(WorkspaceShell, { pathname: "/projects/alpha/files", search: new URLSearchParams({ path }).toString(), navigate() {}, children: createElement(Fragment, null, createElement(WorkspaceBrowser, { target: { projectId: "alpha" }, kind: "files" }), createElement(Probe)) });
      await act(async () => { if (renderer) renderer.update(element); else renderer = create(element); await settle(); });
    }
    const entries = () => renderer!.root.findByType(WorkspaceTree).props.entries;
    await render("src/first.ts");
    const originalEntries = entries();
    deferPreview = true;
    await render("src/second.ts");
    assert.equal(entries(), originalEntries, "changing selected path must retain the tree memo input");
    assert.match(text(renderer!.root), /正在读取/);
    await act(async () => { resolvePreview!(Response.json({ path: "src/second.ts", content: "second preview" })); await settle(); });
    assert.equal(entries(), originalEntries, "preview completion must not invalidate the tree memo");
    assert.match(text(renderer!.root), /second preview/);
    assert.equal(requests.filter((url) => url.endsWith("/workspace")).length, 1);
    workspace = { ...workspace, project: { ...workspace.project, files: [...workspace.project.files, "src/third.ts"], changes: [{ path: "src/first.ts", status: "A" }] } };
    await act(async () => { refresh!(); await settle(); });
    assert.notEqual(entries(), originalEntries, "actual resource changes must update the tree");
    assert.ok(entries().some((entry: { path: string }) => entry.path === "src/third.ts"));
    assert.equal(entries().find((entry: { path: string }) => entry.path === "src/first.ts").status, "A");
    assert.equal(renderer!.root.findAllByProps({ role: "treeitem" }).find((node) => node.props["data-path"] === "src/second.ts")!.props["aria-selected"], true);
    assert.equal(requests.filter((url) => url.endsWith("/workspace")).length, 2);
  });

  it("preserves raw paths, scoped reads and ask drafts, and retains empty/non-Git/error states", async () => {
    const raw = "src/deep/ 中文 \n → :(glob)*.ts ";
    const requests: string[] = []; const hrefs: string[] = [];
    let drafts: DraftStore | undefined; let workspaceFailure = false;
    function DraftProbe() { drafts = useWorkspace().drafts; return null; }
    const project: ProjectResource = { id: "alpha", name: "Alpha", path: "/repo", capability: { state: "ready", branch: "main", head: "base", commonDirectory: "/repo/.git", repositoryRoot: "/repo", projectSubdirectory: "" } };
    const session: SessionResource = { id: "one", projectId: "alpha", name: "One", path: "/history/one.jsonl", createdAt: "2026-10-21", updatedAt: "2026-10-21", preview: "", collection: "active", legacy: false, executable: true };
    const workspace: WorkspaceData = { renderedAt: "2026-10-21", project: { name: "Alpha", path: "/repo", branch: "main", dirtyFiles: 1, files: [raw], changes: [{ path: raw, status: "M" }] } };
    Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { setItem() {} } });
    globalThis.fetch = async (input, init) => {
      assert.ok(!init?.method || init.method === "GET", "tree navigation never writes");
      const url = String(input); requests.push(url);
      if (url === "/api/projects") return Response.json({ projects: [project] });
      if (url === "/api/projects/alpha") return Response.json({ project });
      if (url.endsWith("/models")) return Response.json({ models: [] });
      if (url.endsWith("/workspace")) return workspaceFailure ? Response.json({ error: "workspace unavailable" }, { status: 500 }) : Response.json(workspace);
      if (url === "/api/projects/alpha/sessions") return Response.json({ active: [], archived: [], trash: [] });
      if (/\/(files|changes)\?/.test(url)) return Response.json({ path: raw, content: "exact preview" });
      return Response.json({ session, projectId: "alpha", sessionId: "one", lifecycle: "dormant", executable: true });
    };
    const render = async (sessionId: string | undefined, kind: "files" | "changes", path?: string) => {
      const pathname = `/projects/alpha${sessionId ? `/sessions/${sessionId}` : ""}/${kind}`;
      const element = createElement(WorkspaceShell, { pathname, search: path === undefined ? "" : new URLSearchParams({ path }).toString(), navigate: (href: string) => hrefs.push(href), children: createElement(Fragment, null, createElement(WorkspaceBrowser, { target: { projectId: "alpha", sessionId }, kind }), createElement(DraftProbe)) });
      await act(async () => { if (renderer) renderer.update(element); else renderer = create(element); await settle(); });
    };
    for (const sessionId of [undefined, "one"]) for (const kind of ["files", "changes"] as const) {
      await render(sessionId, kind);
      assert.equal(renderer!.root.findAllByProps({ className: "workspace-browser-heading" }).length, 0);
      const previewsBefore = requests.filter((url) => /\/(files|changes)\?/.test(url)).length;
      for (const path of ["src", "src/deep"]) {
        await act(() => renderer!.root.findAllByProps({ className: "workspace-tree-row" }).find((node) => node.props["data-path"] === path)!.props.onClick(event()));
      }
      assert.equal(requests.filter((url) => /\/(files|changes)\?/.test(url)).length, previewsBefore);
      assert.equal(hrefs.length, 0);
      await act(() => renderer!.root.findAllByProps({ className: "workspace-tree-row" }).find((node) => node.props["data-path"] === raw)!.props.onClick(event()));
      const selected = new URL(hrefs.pop()!, "http://localhost");
      assert.equal(selected.pathname, `/projects/alpha${sessionId ? `/sessions/${sessionId}` : ""}/${kind}`);
      assert.equal(selected.searchParams.get("path"), raw);
      await render(sessionId, kind, raw);
      assert.ok(requests.includes(`/api/projects/alpha${sessionId ? `/sessions/${sessionId}` : ""}/${kind}?path=${encodeURIComponent(raw)}`));
      assert.equal(renderer!.root.findAllByProps({ role: "treeitem" }).find((node) => node.props["data-path"] === raw)!.props["aria-selected"], true);
      assert.ok(renderer!.root.findAllByType("pre").some((node) => text(node) === "exact preview"));
      assert.ok(renderer!.root.findAllByProps({ className: "workspace-tree-scope" }).some((node) => text(node) === (sessionId ? "会话工作区" : "原项目目录")));
      await act(() => renderer!.root.findAllByType("button").find((node) => text(node) === "交给 KivA")!.props.onClick());
      assert.equal(hrefs.pop(), sessionId ? "/projects/alpha/sessions/one" : "/projects/alpha/sessions");
      assert.equal(drafts!.read(drafts!.key("alpha", sessionId)).text, kind === "files" ? `请查看文件 ${raw}` : `请检查 ${raw} 的代码变更`);
      assert.equal(drafts!.read(drafts!.key("alpha", sessionId ? undefined : "one")).text, "", "ask does not overwrite another scope's draft");
      await act(() => renderer!.unmount()); renderer = undefined;
    }
    workspace.project.files = []; workspace.project.changes = [];
    for (const kind of ["files", "changes"] as const) {
      await render(undefined, kind);
      assert.equal(renderer!.root.findAllByProps({ role: "tree" }).length, 0);
      assert.match(text(renderer!.root), kind === "files" ? /此工作区没有可显示的文件/ : /工作区没有未提交变更/);
      await act(() => renderer!.unmount()); renderer = undefined;
    }
    project.capability = { state: "non-git", message: "尚未初始化 Git" };
    await render(undefined, "changes");
    assert.match(text(renderer!.root), /暂时无法查看变更尚未初始化 Git/);
    assert.equal(renderer!.root.findAllByProps({ role: "tree" }).length, 0);
    await act(() => renderer!.unmount()); renderer = undefined;
    workspaceFailure = true;
    await render(undefined, "files");
    assert.match(text(renderer!.root), /无法打开此资源workspace unavailable/);
    assert.equal(renderer!.root.findAllByProps({ role: "tree" }).length, 0);
  });
});
