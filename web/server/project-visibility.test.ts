import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { WorkspaceShell, useWorkspace } from "../features/workspace/shell";
import type { ProjectResource } from "../shared/workspace-contract";

const alpha: ProjectResource = { id: "alpha", name: "Alpha <script>", path: "/repo/alpha", capability: { state: "ready", repositoryRoot: "/repo/alpha", commonDirectory: "/repo/alpha/.git", projectSubdirectory: "", head: "base", branch: "main" } };
const beta: ProjectResource = { ...alpha, id: "beta", name: "Beta", path: "/repo/beta" };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function text(node: ReactTestInstance): string { return node.children.map((child) => typeof child === "string" ? child : text(child)).join(""); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("project presentation removal", () => {
  let renderer: ReactTestRenderer | undefined;
  let href: string;
  let projects: ProjectResource[];
  let requests: Array<{ url: string; body?: Record<string, unknown> }>;
  let customFetch: ((url: string, init?: RequestInit) => Promise<Response | undefined>) | undefined;
  let workspace: ReturnType<typeof useWorkspace>;
  const events = new Map<string, Set<(event: unknown) => void>>();
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window, originalStorage = globalThis.sessionStorage;
  function Probe() { workspace = useWorkspace(); return createElement("div", { "data-probe": true }); }
  function render(next: string) {
    href = next;
    const url = new URL(next, "http://localhost");
    const element = createElement(WorkspaceShell, { pathname: url.pathname, search: url.search.slice(1), navigate: render, children: createElement(Probe) });
    if (renderer) renderer.update(element); else renderer = create(element);
  }
  async function open(next = "/projects/alpha/sessions/one") { await act(async () => { render(next); await settle(); }); }
  async function click(node: ReactTestInstance) { await act(async () => { node.props.onClick({ button: 0, preventDefault() {}, stopPropagation() {} }); await settle(); }); }
  const labelled = (label: string) => renderer!.root.findByProps({ "aria-label": label });
  const button = (label: string) => renderer!.root.findAllByType("button").find((node) => text(node) === label)!;
  const removals = () => requests.filter((entry) => entry.url.endsWith("/actions"));
  async function requestRemoval(project = alpha) { await click(labelled(`项目操作 ${project.name}`)); await click(button("移除")); }
  beforeEach(() => {
    projects = [alpha, beta]; renderer = undefined; requests = []; customFetch = undefined; events.clear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener(name: string, callback: (event: unknown) => void) { const listeners = events.get(name) ?? new Set(); listeners.add(callback); events.set(name, listeners); }, removeEventListener(name: string, callback: (event: unknown) => void) { events.get(name)?.delete(callback); } } });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { setItem() {} } });
    globalThis.fetch = async (input, init) => {
      const url = String(input), body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, body });
      const custom = await customFetch?.(url, init); if (custom) return custom;
      if (url === "/api/projects") return Response.json({ projects });
      if (url.endsWith("/actions")) {
        const projectId = url.split("/")[3]; projects = projects.filter((item) => item.id !== projectId);
        return Response.json({ projectId, projects });
      }
      if (url.endsWith("/models")) return Response.json({ models: [] });
      if (url.endsWith("/sessions") && !body) return Response.json({ active: [], archived: [], trash: [] });
      if (url.endsWith("/sessions") && body) {
        const projectId = url.split("/")[3];
        return Response.json({ projectId, sessionId: "created", session: { id: "created", projectId } });
      }
      return Response.json({ project: url.includes("/beta") ? beta : alpha });
    };
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount());
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["window", originalWindow], ["sessionStorage", originalStorage]] as const) {
      if (value !== undefined) Object.defineProperty(globalThis, name, { configurable: true, value }); else Reflect.deleteProperty(globalThis, name);
    }
  });

  it("requires confirmation, preserves escaped names and explains retained data and running tasks", async () => {
    await open(); await requestRemoval();
    const dialog = renderer!.root.findByProps({ role: "dialog" });
    assert.match(text(dialog), /Alpha <script>/);
    assert.equal(dialog.findAllByType("script").length, 0);
    assert.match(text(dialog), /项目文件、会话历史、工作区和配置不会被删除/);
    assert.match(text(dialog), /正在运行的任务会继续/);
    assert.match(text(dialog), /重新导入同一目录/);
    assert.equal(removals().length, 0);
    await click(button("取消"));
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
    assert.equal(removals().length, 0);
    await requestRemoval();
    await act(async () => { for (const listener of events.get("keydown") ?? []) listener({ key: "Escape", preventDefault() {} }); });
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
    assert.equal(removals().length, 0);
  });

  it("hides the current project immediately after confirmation and chooses a visible fallback", async () => {
    await open(); await requestRemoval(); await click(button("移除项目"));
    assert.equal(href, "/projects/beta/sessions");
    assert.equal(renderer!.root.findAllByProps({ "aria-label": `项目操作 ${alpha.name}` }).length, 0);
    assert.equal(removals().length, 1);
    assert.deepEqual(removals()[0].body, { type: "remove" });
    assert.equal(requests.some((entry) => /commands|deletion-preview|\/events/.test(entry.url)), false);
    await requestRemoval(beta); await click(button("移除项目"));
    assert.equal(href, "/projects");
    assert.equal(renderer!.root.findAllByProps({ className: "project-card" }).length, 0);
  });

  it("preserves another project's route and every scoped draft", async () => {
    await open("/projects/beta/files?path=src%2Fmain.ts");
    workspace!.drafts.update("alpha/one", { text: "alpha draft" });
    workspace!.drafts.update("beta/two", { text: "beta draft" });
    await requestRemoval(); await click(button("移除项目"));
    assert.equal(href, "/projects/beta/files?path=src%2Fmain.ts");
    assert.equal(workspace!.drafts.read("alpha/one").text, "alpha draft");
    assert.equal(workspace!.drafts.read("beta/two").text, "beta draft");
  });

  it("keeps failed removals retryable and pending confirmation non-dismissable", async () => {
    await open(); await requestRemoval();
    const pending = deferred<Response>();
    customFetch = async (url) => url.endsWith("/actions") ? pending.promise : undefined;
    await click(button("移除项目"));
    assert.equal(button("正在移除…").props.disabled, true);
    await act(async () => { for (const listener of events.get("keydown") ?? []) listener({ key: "Escape", preventDefault() {} }); });
    assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 1);
    await act(async () => { pending.resolve(Response.json({ error: { message: "write failed" } }, { status: 409 })); await settle(); });
    assert.match(text(renderer!.root), /无法移除项目write failed/);
    assert.equal(href, "/projects/alpha/sessions/one");
    assert.equal(renderer!.root.findAllByProps({ className: "project-card" }).length, 2);
    customFetch = undefined; await click(button("重试移除"));
    assert.equal(href, "/projects/beta/sessions");
  });

  it("does not navigate over a route changed while the removal response is pending", async () => {
    await open(); await requestRemoval();
    const pending = deferred<Response>();
    customFetch = async (url) => url.endsWith("/actions") ? pending.promise : undefined;
    await click(button("移除项目")); await open("/projects/beta/changes?path=README.md");
    projects = [beta];
    await act(async () => { pending.resolve(Response.json({ projectId: alpha.id, projects })); await settle(); });
    assert.equal(href, "/projects/beta/changes?path=README.md");
    assert.equal(renderer!.root.findAllByProps({ "aria-label": `项目操作 ${alpha.name}` }).length, 0);
  });

  it("excludes creation while removing and removal while a same-project create is pending", async () => {
    await open();
    const creation = deferred<Response>();
    customFetch = async (url, init) => url.endsWith("/sessions") && init?.method === "POST" ? creation.promise : undefined;
    await act(async () => { void workspace!.createSession(alpha.id); await settle(); });
    await click(labelled(`项目操作 ${alpha.name}`));
    assert.equal(button("移除").props.disabled, true);
    assert.equal(removals().length, 0);
    await act(async () => { creation.resolve(Response.json({ projectId: alpha.id, sessionId: "created", session: { id: "created", projectId: alpha.id } })); await settle(); });
    assert.equal(href, "/projects/alpha/sessions/created");
    await requestRemoval();
    const removal = deferred<Response>();
    customFetch = async (url) => url.endsWith("/actions") ? removal.promise : undefined;
    await click(button("移除项目"));
    const count = requests.filter((entry) => entry.url.endsWith("/sessions") && entry.body).length;
    await act(async () => { await workspace!.createSession(alpha.id); await settle(); });
    assert.equal(requests.filter((entry) => entry.url.endsWith("/sessions") && entry.body).length, count);
    projects = [beta];
    await act(async () => { removal.resolve(Response.json({ projectId: alpha.id, projects })); await settle(); });
    assert.equal(href, "/projects/beta/sessions");
    await act(async () => { await workspace!.createSession(alpha.id); await settle(); });
    assert.equal(requests.filter((entry) => entry.url.endsWith("/sessions") && entry.body).length, count);
  });
});
