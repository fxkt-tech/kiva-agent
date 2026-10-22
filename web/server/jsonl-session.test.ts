import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildJsonlSession, filterJsonlTree, selectJsonlBranch } from "../features/sessions/jsonl-session";

const message = (id: string, parentId: string | null, role = "user", content: unknown = id, rest = {}) => ({ type: "message", id, parentId, message: { role, content, ...rest } });
const source = (values: unknown[]) => values.map((value) => JSON.stringify(value)).join("\n");

describe("owned JSONL session model", () => {
  it("indexes every source line once and follows complete branches beyond the old page boundary", () => {
    const values = Array.from({ length: 450 }, (_, index) => message(String(index), index ? String(index - 1) : null));
    values.push(message("other", "210"));
    const content = "\r\n" + source(values).replaceAll("\n", "\r\n\r\n") + "\r\n";
    const session = buildJsonlSession(content);
    assert.equal(session.records.length, 451);
    assert.equal(session.byId.get("210")?.record.line, 422);
    assert.equal(session.byId.get("449")?.parentLine, 898);
    assert.equal(session.initialLeafLine, 902);
    const selected = selectJsonlBranch(session, 422);
    assert.equal(selected.leafLine, 902);
    assert.equal(selected.targetLine, 422);
    assert.equal(selected.records.length, 212);
    assert.equal(selected.records.at(-1)?.id, "other");
    const originalBranch = selectJsonlBranch(session, 422, 900);
    assert.equal(originalBranch.leafLine, 900);
    assert.equal(originalBranch.records.length, 450);
    assert.equal(originalBranch.missing, false);
    assert.equal(session.records[0].raw, JSON.stringify(values[0]));
    assert.equal(session.tree.length, 451);
    assert.ok(Math.max(...session.tree.map((row) => row.depth)) <= 1, "single-child chains do not drift across the sidebar");
  });

  it("keeps duplicate, missing, forward, cyclic, primitive and malformed evidence out of trusted ancestry", () => {
    const content = source([
      message("root", null), message("good", "root", "assistant"),
      message("dup", null), message("dup", "good"), message("ambiguous", "dup"),
      message("orphan", "missing"), message("orphan-child", "orphan"),
      message("forward", "later"), message("later", null),
      message("cycle-a", "cycle-b"), message("cycle-b", "cycle-a"), message("self", "self"),
      { type: "future", id: "future", parentId: "later", unknown: true },
      { type: "message", message: { role: "user", content: "missing id" } }, null, 42,
    ]) + "\nbad json\n";
    const session = buildJsonlSession(content);
    assert.equal(session.byId.has("dup"), false);
    for (const line of [3, 4, 5, 6, 8, 10, 11, 12, 14, 15, 16, 17]) assert.equal(session.byLine.get(line)?.parentLine, undefined);
    assert.ok(session.byLine.get(3)?.record.issues.includes("ID 重复"));
    assert.ok(session.byLine.get(5)?.record.issues.includes("父 ID 不唯一"));
    assert.ok(session.byLine.get(6)?.record.issues.includes("父记录缺失"));
    assert.ok(session.byLine.get(7)?.record.issues.includes("祖先记录关系未确认"));
    assert.match(session.byLine.get(8)!.record.issues.join(" "), /晚于/);
    for (const line of [10, 11, 12]) assert.ok(session.byLine.get(line)?.record.issues.includes("父子关系成环"));
    assert.equal(session.initialLeafLine, 9, "a diagnostic child cannot hide the last valid loaded leaf");
    assert.equal(selectJsonlBranch(session).targetLine, 9);
    assert.deepEqual(selectJsonlBranch(session, 7).records.map((record) => record.line), [6, 7]);
    assert.deepEqual(selectJsonlBranch(session, 17).records.map((record) => record.raw), ["bad json"]);
    assert.equal(session.records.length, session.tree.length);
    assert.equal(new Set(session.tree.map((row) => row.record.line)).size, session.records.length);
  });

  it("does not let an invalid trailing child hijack a normal branch", () => {
    const session = buildJsonlSession(source([message("root", null), message("answer", "root", "assistant"), { type: "future", id: "future", parentId: "answer" }]));
    assert.equal(session.initialLeafLine, 2);
    assert.equal(selectJsonlBranch(session, 1).leafLine, 2);
    assert.deepEqual(selectJsonlBranch(session, 3).records.map((record) => record.line), [1, 2, 3]);
  });

  it("resolves exact source selection with a recoverable missing or conflicting link", () => {
    const session = buildJsonlSession(source([message("root", null), message("left", "root"), message("right", "root")]));
    assert.deepEqual(selectJsonlBranch(session, 2, 3).records.map((record) => record.id), ["root", "left"]);
    assert.equal(selectJsonlBranch(session, 2, 3).missing, true);
    assert.equal(selectJsonlBranch(session, 99).missing, true);
    assert.equal(selectJsonlBranch(session, 99).leafLine, 3);
    assert.equal(selectJsonlBranch(session, undefined, 2).targetLine, 2);
    assert.deepEqual(selectJsonlBranch(buildJsonlSession(" \r\n\n")), { records: [], missing: false, leafLine: undefined, targetLine: undefined });
    assert.equal(selectJsonlBranch(buildJsonlSession("bad\nnull")).records[0].raw, "bad");
  });

  it("offers five Pi navigation filters, token search, latest labels and active-target retention", () => {
    const session = buildJsonlSession(source([
      message("root", null), message("answer", "root", "assistant", "Earlier UNIQUE searchable reply"),
      message("tool", "answer", "toolResult", "stdout"),
      { type: "model_change", id: "model", parentId: "tool", modelId: "fixture" },
      { type: "label", id: "label", parentId: "model", targetId: "answer", label: "Review point" },
      { type: "custom_message", id: "hidden", parentId: "label", display: false, content: "hidden source" },
    ]));
    const filtered = (filter: Parameters<typeof filterJsonlTree>[1]["filter"], search?: string, activeLine?: number) => filterJsonlTree(session, { filter, search, activeLine }).map((row) => row.record.id);
    assert.deepEqual(filtered("all"), ["root", "answer", "tool", "model", "label", "hidden"]);
    assert.deepEqual(filtered("default"), ["root", "answer", "tool", "hidden"]);
    assert.deepEqual(filtered("no-tools"), ["root", "answer", "hidden"]);
    assert.deepEqual(filtered("user-only"), ["root"]);
    assert.deepEqual(filtered("labeled-only"), ["answer"]);
    assert.deepEqual(filtered("all", "unique REPLY"), ["answer"]);
    assert.deepEqual(filtered("all", "review point"), ["answer", "label"]);
    assert.deepEqual(filtered("user-only", "does-not-exist", 6), ["hidden"]);
    const removed = buildJsonlSession(source([...session.records.map((record) => record.value), { type: "label", id: "remove", targetId: "answer", label: null }]));
    assert.deepEqual(filterJsonlTree(removed, { filter: "labeled-only" }), []);
  });

  it("reports only finite, explicitly complete usage and keeps missing statistics unavailable", () => {
    const usage = { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cost: { input: 0.1, output: 0.2, cacheRead: 0.3, cacheWrite: 0.4 } };
    const session = buildJsonlSession(source([message("one", null, "assistant", [{ type: "toolCall", id: "tool", name: "read" }], { model: "fixture", provider: "test", usage }), message("two", "one", "assistant", "reply", { model: "fixture", provider: "test", usage: { ...usage, cost: { total: 2 } } })]));
    assert.deepEqual(session.summary.tokens, { input: 4, output: 6, cacheRead: 8, cacheWrite: 10 });
    assert.equal(session.summary.cost, 3); assert.equal(session.summary.partialUsage, false);
    assert.equal(session.summary.usageRecords, 2); assert.equal(session.summary.toolCalls, 1);
    assert.deepEqual(session.summary.models, ["test/fixture"]);
    const missing = buildJsonlSession(source([message("one", null, "assistant", "reply", { usage }), message("two", "one", "assistant")]));
    assert.equal(missing.summary.tokens, undefined); assert.equal(missing.summary.cost, undefined); assert.equal(missing.summary.partialUsage, true);
    for (const input of [-1, "10", null]) {
      const invalid = buildJsonlSession(source([message("one", null, "assistant", "reply", { usage: { ...usage, input } })]));
      assert.equal(invalid.summary.tokens, undefined);
    }
    const overflow = buildJsonlSession(source([message("one", null, "assistant", "reply", { usage: { ...usage, input: Number.MAX_VALUE } }), message("two", "one", "assistant", "reply", { usage: { ...usage, input: Number.MAX_VALUE } })]));
    assert.equal(overflow.summary.tokens, undefined);
    assert.equal(buildJsonlSession(source([message("one", null)])).summary.tokens, undefined);
  });

  it("iteratively indexes and selects deep chains and wide branches without ancestry-sized metadata", () => {
    const count = 25_000;
    const values = Array.from({ length: count }, (_, index) => message(String(index), index ? String(index - 1) : null));
    const deep = buildJsonlSession(source(values));
    assert.equal(deep.byLine.get(count)?.depth, count - 1);
    assert.equal(deep.byLine.get(1)?.newestLeafLine, count);
    assert.equal(selectJsonlBranch(deep, Math.floor(count / 2)).records.length, count);
    assert.ok(deep.tree.every((row) => row.depth === 0));
    const wide = buildJsonlSession(source([message("root", null), ...Array.from({ length: count }, (_, index) => message(String(index), "root"))]));
    assert.equal(wide.byId.get("root")?.children.length, count);
    assert.equal(selectJsonlBranch(wide, 1).leafLine, count + 1);
    assert.equal(wide.tree.length, count + 1);
    assert.deepEqual(filterJsonlTree(wide, { filter: "all", search: '"id":"24999"' }).map((row) => row.record.line), [count + 1]);
  });
});
