import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { installMotionMocks } from "./helpers/mock-motion";
import type { ChatMessage } from "../lib/use-runtime";

installMotionMocks();
const { MessageContent } = await import("../components/message-content");

const message: ChatMessage = {
  id: "tool-message", role: "assistant", text: "", thinking: "",
  tools: [{ id: "read-1", name: "read", args: { path: "README.md" }, result: "# README", status: "done" }],
};

describe("compact tool messages", () => {
  it("preserves existing code blocks while another message streams or tool activity changes", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    let renderer: ReactTestRenderer | undefined;
    let history: ChatMessage = { ...message, id: "history", text: "```typescript\nconst value = 42;\n```", tools: [] };
    const current: ChatMessage = { ...message, id: "stream", text: "Generating", tools: [], streaming: true };
    function Timeline({ latest }: { latest: ChatMessage }) {
      return createElement(Fragment, null, createElement(MessageContent, { message: history }), createElement(MessageContent, { message: latest }));
    }
    try {
      await act(() => { renderer = create(createElement(Timeline, { latest: current })); });
      const codeBlock = renderer!.root.findByType("pre");
      await act(() => renderer!.update(createElement(Timeline, { latest: { ...current, text: "Generating more content" } })));
      assert.ok(renderer!.root.findByType("pre") === codeBlock, "Streaming must not replace history code nodes or lose the reader's selection");
      history = { ...history, tools: message.tools };
      await act(() => renderer!.update(createElement(Timeline, { latest: current })));
      assert.ok(renderer!.root.findAllByType("pre").includes(codeBlock), "Tool updates must retain unchanged Markdown");
      history = { ...history, text: `${history.text}\n\nA new paragraph after the existing code.` };
      await act(() => renderer!.update(createElement(Timeline, { latest: current })));
      assert.ok(renderer!.root.findAllByType("pre").includes(codeBlock), "Appending prose must not remount an existing syntax-highlighted block");
    } finally {
      if (renderer) await act(() => renderer!.unmount());
      if (previous) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previous);
      else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    }
  });

  it("renders native one-line tool summaries inside the real activity disclosure without a waiting placeholder or Markdown spacer", () => {
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
    assert.match(html, /工具记录 · 1 项/);
    assert.doesNotMatch(html, /Thought for|\d+s<\/span>/);
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

  it("previews the command in collapsed summaries across execution states while retaining full input and output", () => {
    const command = "pnpm --filter @fxkt-tech/kiva-web test -- --test-name-pattern='compact tool messages'\nprintf '验证完成'";
    for (const status of ["running", "done", "error"] as const) {
      const html = renderToStaticMarkup(createElement(MessageContent, { message: { ...message, tools: [{ id: "bash-1", name: "bash", args: { command, timeout: 120 }, result: "test output", status }] } }));
      assert.match(html, /<details class="tool-card tool-details">/);
      const summary = html.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
      assert.ok(summary);
      assert.match(summary, /bash · pnpm --filter @fxkt-tech\/kiva-web test/);
      assert.match(summary, /printf &#x27;验证完成&#x27;/);
      assert.match(summary, /title="bash · pnpm --filter/);
      assert.match(summary, new RegExp(`data-status="${status}"`));
      assert.doesNotMatch(summary, /timeout|test output/);
      assert.match(html, /&quot;timeout&quot;: 120/);
      assert.match(html, /test output/);
      assert.match(html, /复制/);
    }
  });

  it("keeps the tool name when command arguments are absent or not strings", () => {
    for (const args of [undefined, null, "partial input", {}, { command: 42 }, { command: "" }]) {
      const html = renderToStaticMarkup(createElement(MessageContent, { message: { ...message, tools: [{ ...message.tools[0], args }] } }));
      const summary = html.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
      assert.ok(summary);
      assert.equal(summary.replace(/<[^>]*>/g, ""), "read");
    }
  });

  it("only displays a thinking placeholder while an empty message is actually streaming", () => {
    const streaming = renderToStaticMarkup(createElement(MessageContent, { message: { ...message, tools: [], streaming: true } }));
    const complete = renderToStaticMarkup(createElement(MessageContent, { message: { ...message, tools: [] } }));
    assert.match(streaming, /正在思考/);
    assert.match(streaming, /正在处理请求，请稍候/);
    assert.doesNotMatch(streaming, /markdown-body|streaming-text/);
    assert.equal(complete, "");
  });
});
