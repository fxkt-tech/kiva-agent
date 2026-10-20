import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { KivaWorkbench } from "../components/kiva-workbench";
import type { BootstrapData } from "../shared/types";

const data: BootstrapData = {
  renderedAt: "2026-10-20T16:00:30.000Z",
  project: { name: "kiva-agent", path: "/repo", branch: "main", dirtyFiles: 1, files: ["README.md"], changes: [{ status: "M", path: "README.md" }] },
  runtime: { piVersion: "1.3.0", modelConfigFound: true, status: "ready" },
  sessions: [],
  recentProjects: ["/repo"],
};

class FakeWebSocket {
  onopen?: () => void;
  onmessage?: (message: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;
  close() {}
}

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : textContent(child)).join("");
}

describe("KivaWorkbench sidebar", () => {
  let renderer: ReactTestRenderer;
  let reloads = 0;
  let requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    reloads = 0;
    requests = [];
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol: "http:", host: "localhost:30141", reload: () => { reloads += 1; } } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: globalThis.location, addEventListener() {}, removeEventListener() {} } });
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: FakeWebSocket });
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.startsWith("/api/project/directories")) {
        const path = new URL(url, "http://localhost").searchParams.get("path") ?? "/repo";
        return Response.json({ path, parent: path === "/repo" ? "/" : "/repo", directories: path === "/repo" ? [{ name: "other-project", path: "/repo/other-project" }] : [] });
      }
      if (url.startsWith("/api/project/file")) return Response.json({ path: "README.md", content: "# Real project" });
      if (url === "/api/project/open") return Response.json(data);
      return Response.json({ active: [], archived: [], trash: [] });
    };
  });

  afterEach(async () => {
    if (renderer) await act(() => renderer.unmount());
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: originalWebSocket });
    if (originalWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    else Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "location");
  });

  it("opens a real file workspace from the File navigation item", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });
    const fileButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "文件");

    assert.ok(fileButton, "File navigation item should exist");
    assert.equal(typeof fileButton.props.onClick, "function", "File navigation item should be interactive");
    await act(() => fileButton.props.onClick());
    assert.ok(renderer.root.findAll((node) => textContent(node) === "文件浏览").length > 0);
    const readmeButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "README.md");
    await act(async () => { readmeButton?.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); });
    assert.ok(renderer.root.findAllByType("pre").some((node) => textContent(node) === "# Real project"));
  });

  it("wires the remaining sidebar controls to visible state changes", async () => {
    await act(() => { renderer = create(createElement(KivaWorkbench, { data })); });

    const changeButton = renderer.root.findAllByType("button").find((button) => textContent(button).startsWith("代码变更"));
    assert.equal(typeof changeButton?.props.onClick, "function");
    await act(() => changeButton?.props.onClick());
    assert.ok(renderer.root.findAll((node) => node.type === "h1" && textContent(node) === "代码变更").length > 0);

    const settingsButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "运行上下文");
    assert.equal(renderer.root.findAll((node) => node.props.className === "inspector").length, 0, "Context starts collapsed to keep the conversation focused");
    await act(() => settingsButton?.props.onClick());
    assert.equal(renderer.root.findAll((node) => node.props.className === "inspector").length, 1);
    await act(() => renderer.root.findByProps({ "aria-label": "关闭运行上下文" }).props.onClick());
    assert.equal(renderer.root.findAll((node) => node.props.className === "inspector").length, 0);

    const projectButton = renderer.root.findAllByType("button").find((button) => textContent(button).includes("打开本地项目"));
    assert.ok(projectButton, "A clearly labelled local-project picker should exist");
    await act(async () => { projectButton.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); });
    assert.equal(renderer.root.findAllByProps({ role: "dialog" }).length, 1);
    assert.ok(requests.some((request) => request.url.startsWith("/api/project/directories")), "Opening the picker should browse real local directories");
    const directoryButton = renderer.root.findAllByType("button").find((button) => textContent(button).includes("other-project"));
    assert.ok(directoryButton, "Directory entries should be navigable");
    await act(async () => { directoryButton.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); });
    const useFolderButton = renderer.root.findAllByType("button").find((button) => textContent(button) === "使用此文件夹");
    assert.ok(useFolderButton);
    await act(async () => { useFolderButton.props.onClick(); await new Promise((resolve) => setImmediate(resolve)); });
    assert.ok(requests.some((request) => request.url === "/api/project/open" && request.init?.body === JSON.stringify({ path: "/repo/other-project" })));
    assert.equal(reloads, 1);

    const commandButton = renderer.root.findByProps({ "aria-label": "打开命令面板" });
    await act(() => commandButton.props.onClick());
    assert.equal(renderer.root.findAll((node) => node.props.className === "command-palette").length, 1);

    const searchButton = renderer.root.findByProps({ "aria-label": "搜索会话" });
    await act(() => searchButton.props.onClick());
    assert.equal(renderer.root.findAllByProps({ placeholder: "搜索会话" }).length, 1);
  });
});
