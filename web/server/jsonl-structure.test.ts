import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jsonFieldRows, jsonValueSummary, parseJsonlPage } from "../features/sessions/jsonl-structure";

describe("read-only JSONL structure", () => {
  it("retains exact lines, unknown records, primitives and malformed diagnostics", () => {
    const source = '\r\n{"type":"session","id":"root"}\r\n {"type":"future","parentId":"root","opaque":{"x":true}} \n\nnull\n42\n"<script>"\n[1,2]\nnot json\n';
    const page = parseJsonlPage(source);
    assert.deepEqual(page.records.map((record) => record.line), [2, 3, 5, 6, 7, 8, 9]);
    assert.equal(page.records[1].raw, ' {"type":"future","parentId":"root","opaque":{"x":true}} ');
    assert.equal(page.records[1].parentLine, 2); assert.equal(page.records[1].depth, 1);
    assert.equal(page.records[1].type, "future"); assert.deepEqual(page.records[2].value, null);
    assert.equal(page.records[4].value, "<script>"); assert.ok(page.records[6].error);
    assert.equal(page.hasMore, false);
  });

  it("handles duplicate IDs, missing parents, prototype-looking keys and cycles safely", () => {
    const page = parseJsonlPage([
      '{"id":"__proto__","type":"root","__proto__":{"safe":true}}',
      '{"id":"constructor","parentId":"__proto__"}',
      '{"id":"dup"}', '{"id":"dup"}', '{"parentId":"dup"}', '{"parentId":"absent"}',
      '{"id":"a","parentId":"b"}', '{"id":"b","parentId":"a"}', '{"id":"self","parentId":"self"}',
    ].join("\n"));
    assert.equal(page.records[1].parentLine, 1);
    assert.deepEqual(page.records[2].issues, ["ID 重复"]);
    assert.deepEqual(page.records[4].issues, ["父 ID 不唯一"]);
    assert.deepEqual(page.records[5].issues, ["父记录缺失"]);
    for (const record of page.records.slice(6)) { assert.ok(record.issues.includes("父子关系成环")); assert.equal(record.depth, 0); }
    assert.equal(Object.hasOwn(page.records[0].value as object, "__proto__"), true);
  });

  it("paginates records without parsing skipped or excess records and preserves source line numbers", () => {
    const source = Array.from({ length: 450 }, (_, index) => `\n${JSON.stringify({ id: String(index), parentId: index ? String(index - 1) : null })}`).join("\n");
    const first = parseJsonlPage(source, 0, 50_000);
    assert.equal(first.records.length, 200); assert.equal(first.hasMore, true);
    const middle = parseJsonlPage(source, 200); assert.equal(middle.records[0].id, "200"); assert.equal(middle.records[0].line, 402);
    assert.ok(middle.records[0].issues.includes("父记录未在本页载入"));
    const last = parseJsonlPage(source, 400); assert.equal(last.records.length, 50); assert.equal(last.hasMore, false);
    assert.deepEqual(parseJsonlPage(" \r\n\n").records, []);
  });

  it("bounds huge, deeply nested field trees and keeps literal property keys", () => {
    const value: unknown = JSON.parse('{"__proto__":{"constructor":1},"many":[' + Array.from({ length: 3_000 }, (_, i) => i).join(",") + ']}');
    const root = jsonFieldRows(value, new Set(["[]", '["many"]', '["__proto__"]']), new Map());
    assert.ok(root.rows.some((row) => row.label === "constructor"));
    assert.equal(root.rows.filter((row) => row.depth === 2 && typeof row.value === "number").length, 51);
    assert.ok(root.rows.some((row) => row.kind === "pagination" && row.count === 3_000));
    const later = jsonFieldRows(value, new Set(["[]", '["many"]']), new Map([['["many"]', 59]]));
    assert.ok(later.rows.some((row) => row.label === "2999"));
    const deep = JSON.parse('{"x":'.repeat(2_000) + "0" + "}".repeat(2_000));
    const expanded = new Set(Array.from({ length: 2_001 }, (_, length) => JSON.stringify(Array.from({ length }, () => "x"))));
    assert.equal(jsonFieldRows(deep, expanded, new Map()).rows.length, 17);
    assert.equal(jsonFieldRows(value, new Set(["[]", '["many"]']), new Map(), 10).limited, true);
    assert.match(jsonValueSummary("x".repeat(3_000)), /完整内容见原始文本/);
  });
});
