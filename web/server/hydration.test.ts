import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KivaWorkbenchClient } from "../components/kiva-workbench-client";
import { WorkspaceShell } from "../features/workspace/shell";

describe("workspace hydration seam", () => {
  it("does not server-render the interactive shell or routed feature tree", () => {
    const html = renderToStaticMarkup(createElement(KivaWorkbenchClient, { children: createElement("div", null, "interactive feature") }));
    assert.doesNotMatch(html, /class="workbench"|interactive feature/);
  });

  it("keeps the shell's initial output independent of browser time", () => {
    const original = Date.now;
    try {
      const element = createElement(WorkspaceShell, { pathname: "/projects/alpha/sessions/one", navigate() {}, children: null });
      Date.now = () => Date.parse("2026-10-20T16:00:30Z");
      const server = renderToStaticMarkup(element);
      Date.now = () => Date.parse("2026-10-20T16:01:30Z");
      assert.equal(renderToStaticMarkup(element), server);
    } finally { Date.now = original; }
  });
});
