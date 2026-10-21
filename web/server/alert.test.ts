import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert } from "../components/ui/alert";
import WorkspaceError from "../app/(workspace)/error";
import NotFound from "../app/(workspace)/not-found";

describe("shared application Alerts", () => {
  it("pairs each severity with an icon, title and appropriate announcement priority", () => {
    for (const variant of ["info", "success", "warning", "error"] as const) {
      const html = renderToStaticMarkup(createElement(Alert, { title: "操作结果", variant, children: "消息详情" }));
      assert.match(html, new RegExp(`data-variant="${variant}"`));
      assert.match(html, new RegExp(`role="${variant === "error" || variant === "warning" ? "alert" : "status"}"`));
      assert.match(html, /<svg[^>]*class="[^"]*alert-icon[^>]*aria-hidden="true"/);
      assert.match(html, /class="alert-title">操作结果/);
      assert.match(html, /class="alert-description">消息详情/);
      assert.doesNotMatch(html, /autofocus|role="dialog"|alert-dismiss/);
    }
  });

  it("keeps server messages escaped and makes dismissal optional and labelled", () => {
    const html = renderToStaticMarkup(createElement(Alert, { title: "操作失败", variant: "error", onDismiss() {}, children: "<script>alert('error')</script>" }));
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /type="button" aria-label="关闭提示：操作失败"/);
  });

  it("uses the same feedback component for route failures and missing resources", () => {
    const error = renderToStaticMarkup(createElement(WorkspaceError, { error: new Error("route failed"), reset() {} }));
    const missing = renderToStaticMarkup(createElement(NotFound));
    assert.match(error, /data-slot="alert" data-variant="error"/);
    assert.match(error, /route failed/);
    assert.match(error, />重试</);
    assert.match(missing, /data-slot="alert" data-variant="warning"/);
    assert.match(missing, /href="\/projects"/);
  });
});
