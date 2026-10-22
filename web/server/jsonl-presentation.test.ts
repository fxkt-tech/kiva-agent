import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSONL_BLOCK_LIMIT, JSONL_PAGE_BLOCK_LIMIT, JSONL_PAGE_LINE_LIMIT, JSONL_PAGE_TEXT_LIMIT, JSONL_TEXT_LIMIT, jsonInputPreview, presentJsonlBranch, presentJsonlPage, type JsonlContentBlock } from "../features/sessions/jsonl-presentation";
import { parseJsonlPage } from "../features/sessions/jsonl-structure";
import { buildJsonlSession, JSONL_READING_WINDOW, selectJsonlBranch } from "../features/sessions/jsonl-session";

const message = (id: string, parentId: string | null, role: string, content: unknown, rest = {}) => ({ type: "message", id, parentId, message: { role, content, ...rest } });
const call = (id = "tool", name = "bash") => ({ type: "toolCall", id, name, arguments: { command: "git status --short" } });
const result = (id = "tool", parent = "assistant", name = "bash", rest = {}) => message("result", parent, "toolResult", [{ type: "text", text: "clean" }], { toolCallId: id, toolName: name, ...rest });
const project = (values: unknown[]) => presentJsonlPage(parseJsonlPage(values.map((value) => JSON.stringify(value)).join("\n")));
const tool = (blocks: JsonlContentBlock[]) => blocks.find((block) => block.kind === "tool") as Extract<JsonlContentBlock, { kind: "tool" }>;

describe("readable JSONL presentation", () => {
  it("keeps file order, message blocks, event summaries and unknown source records without SDK reduction", () => {
    const page = parseJsonlPage([
      JSON.stringify({ type: "session", id: "root", timestamp: "2026-10-22T10:00:00Z", cwd: "/repo" }),
      JSON.stringify(message("user", "root", "user", "hello")),
      JSON.stringify(message("assistant", "user", "assistant", [{ type: "thinking", thinking: "reason" }, { type: "text", text: "**answer**" }, { type: "image", data: "private", mimeType: "image/png" }], { model: "fixture" })),
      JSON.stringify({ type: "compaction", summary: "retained summary", tokensBefore: 1200 }),
      JSON.stringify({ type: "branch_summary", summary: "earlier branch", fromId: "user" }),
      JSON.stringify({ type: "future", unknown: { important: true } }),
      "42", "bad json",
    ].join("\r\n"));
    const before = JSON.stringify(page);
    const views = presentJsonlPage(page);
    assert.deepEqual(views.map((view) => view.kind), ["event", "user", "assistant", "event", "event", "unknown", "unknown", "invalid"]);
    assert.equal(views[0].timestamp, "2026-10-22T10:00:00.000Z");
    assert.deepEqual(views[2].blocks.map((block) => block.kind), ["thinking", "text", "placeholder"]);
    assert.match(views[2].blocks[2].kind === "placeholder" ? views[2].blocks[2].text : "", /图片附件/);
    assert.equal(views[3].title, "上下文压缩"); assert.equal(views[3].blocks[0].kind, "text");
    assert.equal(views[4].title, "分支摘要"); assert.equal(views[7].record.raw, "bad json");
    assert.equal(JSON.stringify(page), before, "presentation never normalizes or mutates append-only evidence");
  });

  it("links only unique exact call IDs and reports only explicit result status", () => {
    const views = project([message("assistant", null, "assistant", [call()]), result("tool", "assistant", "bash", { isError: false }), { ...result("missing", "result", "read", { isError: true }), id: "missing-result" }, { ...result("unknown", "result"), id: "unknown-result" }]);
    assert.deepEqual(tool(views[0].blocks).relation, { line: 2, note: "查看输出" });
    assert.deepEqual(views[1].relation, { line: 1, note: "查看输入" });
    assert.deepEqual(views.map((view) => view.resultStatus), [undefined, "success", "error", undefined]);
    assert.equal(views[2].relation?.line, undefined); assert.match(views[2].relation!.note, /本页未找到/);
    const absent = project([message("assistant", null, "assistant", [call()])]);
    assert.match(tool(absent[0].blocks).relation!.note, /本页未找到对应输出/);
  });

  it("refuses duplicated IDs, contradictory branches, names and reversed results", () => {
    const cases = [
      [message("assistant", null, "assistant", [call(), call()]), result()],
      [message("assistant", null, "assistant", [call()]), result(), { ...result(), id: "second-result" }],
      [message("root", null, "user", "start"), message("assistant", "root", "assistant", [call()]), message("sibling", "root", "assistant", "different branch"), result("tool", "sibling")],
      [message("assistant", null, "assistant", [call()]), result("tool", "assistant", "read")],
      [result(), message("assistant", null, "assistant", [call()])],
      [message("assistant", null, "assistant", [call("tool", "x".repeat(161))]), result("tool", "assistant", "x".repeat(160) + "…")],
    ];
    for (const values of cases) {
      const views = project(values); const blocks = views.flatMap((view) => view.blocks);
      assert.equal(tool(blocks).relation?.line, undefined);
      assert.match(tool(blocks).relation!.note, /未关联/);
      assert.ok(views.filter((view) => view.kind === "tool-result").every((view) => view.relation?.line === undefined));
    }
  });

  it("bounds previews by record, page, block count and argument depth, and discloses every clipping", () => {
    const content = "x".repeat(JSONL_TEXT_LIMIT + 10);
    const views = project(Array.from({ length: 20 }, (_, index) => message(String(index), null, "assistant", [{ type: "text", text: content }])));
    assert.equal(views.flatMap((view) => view.blocks).reduce((size, block) => size + ("text" in block ? block.text.length : 0), 0), JSONL_PAGE_TEXT_LIMIT);
    assert.ok(views.every((view) => view.blocks.some((block) => "clipped" in block && block.clipped)));
    const blocks = Array.from({ length: JSONL_BLOCK_LIMIT + 2 }, () => call());
    const bounded = project([message("assistant", null, "assistant", blocks), result()]);
    assert.equal(bounded[0].blocks.length, JSONL_BLOCK_LIMIT + 1);
    const omitted = bounded[0].blocks.at(-1)!;
    assert.match(omitted.kind === "placeholder" ? omitted.text : "", /内容块已截取/);
    assert.equal(tool(bounded[0].blocks).relation?.line, undefined);
    const busy = project(Array.from({ length: 30 }, (_, index) => message(String(index), null, "assistant", blocks.slice(0, JSONL_BLOCK_LIMIT))));
    assert.equal(busy.flatMap((view) => view.blocks).filter((block) => block.kind === "tool").length, JSONL_PAGE_BLOCK_LIMIT);
    const lines = project(Array.from({ length: 20 }, (_, index) => message(String(index), null, "assistant", [{ type: "text", text: "```text\n" + "line\n".repeat(1000) + "```" }])));
    const lineCount = lines.flatMap((view) => view.blocks).reduce((count, block) => count + (block.kind === "text" && block.text ? block.text.split("\n").length : 0), 0);
    assert.equal(lineCount, JSONL_PAGE_LINE_LIMIT, "many short code lines cannot produce unbounded Prism rows");
    assert.ok(lines.every((view) => view.blocks.some((block) => "clipped" in block && block.clipped)));
    let deep: unknown = "secret"; for (let index = 0; index < 1000; index += 1) deep = { child: deep };
    const preview = jsonInputPreview({ deep, big: "x".repeat(100_000), wide: Array.from({ length: 1000 }, (_, index) => index) });
    assert.equal(preview.clipped, true); assert.ok(preview.text.length <= 6000);
  });

  it("does not reinterpret user-supplied tool blocks as executable tool calls", () => {
    const views = project([message("user", null, "user", [call()]), result()]);
    assert.equal(views[0].blocks[0].kind, "placeholder");
    assert.equal(views[1].relation?.line, undefined);
  });

  it("projects only a reading window while retaining confirmed tool relationships across all loaded records", () => {
    const values: unknown[] = [message("assistant", null, "assistant", [call()])];
    for (let index = 1; index < 450; index += 1) values.push(message(String(index), index === 1 ? "assistant" : String(index - 1), "user", "x".repeat(2000)));
    values.push(result("tool", "449"), message("answer", "result", "assistant", "late **answer**"));
    const session = buildJsonlSession(values.map((value) => JSON.stringify(value)).join("\n"));
    const branch = selectJsonlBranch(session).records;
    const start = presentJsonlBranch(branch, 0);
    assert.equal(start.length, JSONL_READING_WINDOW);
    assert.deepEqual(tool(start[0].blocks).relation, { line: 451, note: "查看输出" });
    const end = presentJsonlBranch(branch, 450);
    assert.deepEqual(end[0].relation, { line: 1, note: "查看输入" });
    assert.equal(end[1].blocks[0].kind, "text");
    assert.equal("text" in end[1].blocks[0] && end[1].blocks[0].text, "late **answer**");
    assert.equal("clipped" in end[1].blocks[0] && end[1].blocks[0].clipped, false, "an earlier window cannot consume this window's preview budget");
    assert.equal(presentJsonlBranch(branch, 0, 100_000).length, JSONL_READING_WINDOW);
    assert.equal(presentJsonlBranch(branch, -10, 0).length, 1);
    assert.equal(presentJsonlBranch(branch, Number.NaN, Number.NaN).length, JSONL_READING_WINDOW);
  });

  it("includes omitted and off-window tool calls in uniqueness checks without rendering their previews", () => {
    const values = [message("assistant", null, "assistant", [call(), ...Array.from({ length: 60 }, (_, index) => call(`other-${index}`)), call()]), result()];
    const branch = selectJsonlBranch(buildJsonlSession(values.map((value) => JSON.stringify(value)).join("\n"))).records;
    const views = presentJsonlBranch(branch);
    assert.equal(views[0].blocks.length, JSONL_BLOCK_LIMIT + 1);
    assert.equal(tool(views[0].blocks).relation?.line, undefined);
    assert.match(tool(views[0].blocks).relation!.note, /不唯一/);
    assert.equal(views[1].relation?.line, undefined);
    const later = [message("assistant", null, "assistant", [call()])];
    for (let index = 1; index < 70; index += 1) later.push(message(String(index), index === 1 ? "assistant" : String(index - 1), "user", "between"));
    later.push(message("duplicate-call", "69", "assistant", [call()]), result("tool", "duplicate-call"));
    const laterBranch = selectJsonlBranch(buildJsonlSession(later.map((value) => JSON.stringify(value)).join("\n"))).records;
    assert.match(tool(presentJsonlBranch(laterBranch)[0].blocks).relation!.note, /不唯一/);
  });

  it("never confirms a full-branch result across a broken path, sibling or duplicate record ID", () => {
    const cases = [
      [message("assistant", null, "assistant", [call()]), { ...result(), parentId: undefined }],
      [message("assistant", null, "assistant", [call()]), message("sibling", null, "assistant", "branch"), result("tool", "sibling")],
      [message("assistant", null, "assistant", [call()]), message("assistant", null, "assistant", "duplicate"), result()],
      [message("assistant", null, "assistant", [call()]), result("tool", "assistant", "different-name")],
      [message("assistant", null, "assistant", [call("")]), result("")],
      [result(), message("assistant", null, "assistant", [call()])],
    ];
    for (const values of cases) {
      const session = buildJsonlSession(values.map((value) => JSON.stringify(value)).join("\n"));
      const views = presentJsonlBranch(session.records);
      assert.equal(tool(views.flatMap((view) => view.blocks)).relation?.line, undefined);
      assert.ok(views.filter((view) => view.kind === "tool-result").every((view) => view.relation?.line === undefined));
    }
  });

  it("links each valid selected branch independently and marks hidden custom messages explicitly", () => {
    const session = buildJsonlSession([
      message("assistant", null, "assistant", [call()]), result(),
      { ...result("tool", "assistant"), id: "other-result" },
      { type: "custom_message", id: "hidden", parentId: "other-result", customType: "internal", display: false, content: "hidden text" },
    ].map((value) => JSON.stringify(value)).join("\n"));
    const left = presentJsonlBranch(selectJsonlBranch(session, 2).records);
    const right = presentJsonlBranch(selectJsonlBranch(session, 3).records);
    assert.equal(tool(left[0].blocks).relation?.line, 2);
    assert.equal(tool(right[0].blocks).relation?.line, 3);
    assert.equal(right.at(-1)?.hidden, true);
    assert.equal(right.at(-1)?.blocks[0].kind, "text");
  });
});
