import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KivaWorkbench } from "../components/kiva-workbench";
import { KivaWorkbenchClient } from "../components/kiva-workbench-client";
import type { BootstrapData } from "../shared/types";

const data: BootstrapData = {
  renderedAt: "2026-10-20T16:00:30.000Z",
  project: { name: "kiva-agent", path: "/repo", branch: "main", dirtyFiles: 0, files: ["README.md"], changes: [] },
  runtime: { piVersion: "1.3.0", modelConfigFound: true, status: "ready" },
  sessions: [{
    id: "session-1",
    path: "/repo/.kiva/sessions/session-1.jsonl",
    name: "Hydration test",
    preview: "Check deterministic rendering",
    updatedAt: "2026-10-20T16:00:00.000Z",
  }],
  recentProjects: ["/repo"],
};

describe("KivaWorkbench hydration", () => {
  it("does not server-render the interactive workbench tree", () => {
    const html = renderToStaticMarkup(createElement(KivaWorkbenchClient, { data }));

    assert.doesNotMatch(html, /class="workbench"/);
  });

  it("renders identical initial HTML when server and client clocks cross a minute boundary", () => {
    const originalNow = Date.now;
    try {
      Date.now = () => Date.parse("2026-10-20T16:00:30.000Z");
      const serverHtml = renderToStaticMarkup(createElement(KivaWorkbench, { data }));
      Date.now = () => Date.parse("2026-10-20T16:01:30.000Z");
      const clientHtml = renderToStaticMarkup(createElement(KivaWorkbench, { data }));

      assert.equal(clientHtml, serverHtml);
    } finally {
      Date.now = originalNow;
    }
  });

});
