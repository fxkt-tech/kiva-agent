import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageContent } from "../components/message-content";
import type { ChatMessage } from "../lib/use-runtime";

const message: ChatMessage = {
  id: "tool-message", role: "assistant", text: "", thinking: "",
  tools: [{ id: "read-1", name: "read", args: { path: "README.md" }, result: "# README", status: "done" }],
};

describe("compact tool messages", () => {
  it("renders a one-line summary without redundant tool placeholders or a Markdown spacer", () => {
    const html = renderToStaticMarkup(createElement(MessageContent, { message }));
    assert.doesNotMatch(html, /正在使用工具|正在思考|markdown-body|执行完成/);
    assert.match(html, /<span class="tool-summary"[^>]*>read<\/span>/);
    assert.match(html, /data-status="done"/);
    assert.match(html, /role="img" aria-label="完成" title="完成"/);
    const summary = html.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
    assert.ok(summary);
    assert.equal(summary.replace(/<[^>]*>/g, ""), "read", "The tool name is the only visible summary text; status uses an icon");
    assert.match(html, /tool-detail-body/);
    assert.match(html, /输入/);
    assert.match(html, /输出/);
    assert.match(html, /复制/);
    assert.match(html, /# README/);
  });

  it("retains running and failure statuses without duplicating a second status line", () => {
    for (const status of ["running", "error"] as const) {
      const html = renderToStaticMarkup(createElement(MessageContent, { message: { ...message, streaming: status === "running", tools: [{ ...message.tools[0], status }] } }));
      assert.match(html, new RegExp(`data-status="${status}"`));
      assert.match(html, new RegExp(`aria-label="${status === "running" ? "运行中" : "失败"}"`));
      const summary = html.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
      assert.ok(summary);
      assert.equal(summary.replace(/<[^>]*>/g, ""), "read");
      assert.doesNotMatch(html, /正在使用工具|正在执行|执行失败|markdown-body/);
    }
  });

  it("only displays a thinking placeholder while an empty message is actually streaming", () => {
    const streaming = renderToStaticMarkup(createElement(MessageContent, { message: { ...message, tools: [], streaming: true } }));
    const complete = renderToStaticMarkup(createElement(MessageContent, { message: { ...message, tools: [] } }));
    assert.match(streaming, /正在思考/);
    assert.equal(complete, "");
  });
});
