import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { WorkspaceDiff, diffNotices, diffSections, diffTotals, parseUnifiedDiff } from "../features/files/workspace-diff";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");

const patch = [
  "diff --git a/src/main.ts b/src/main.ts",
  "index 4f2a1cd..8b90ee2 100644",
  "--- a/src/main.ts",
  "+++ b/src/main.ts",
  "@@ -1,5 +1,6 @@ export function main() {",
  " import { read } from \"./read\";",
  "-const limit = 10;",
  "+const limit = 20;",
  "+const retries = 3;",
  " export function main() {",
  "-  return read(limit);",
  "+  return read(limit, retries);",
  " }",
  "\\ No newline at end of file",
  "",
].join("\n");

describe("workspace diff presentation", () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(async () => { if (renderer) await act(() => renderer!.unmount()); renderer = undefined; });

  it("parses hunks into numbered context, added and removed rows", () => {
    const rows = parseUnifiedDiff(patch);
    assert.deepEqual(rows.map(({ kind }) => kind), ["meta", "meta", "meta", "meta", "hunk", "context", "removed", "added", "added", "context", "removed", "added", "context", "note"]);
    const body = rows.slice(5);
    assert.deepEqual(body.map(({ oldLine, newLine }) => [oldLine, newLine]), [[1, 1], [2, undefined], [undefined, 2], [undefined, 3], [3, 4], [4, undefined], [undefined, 5], [5, 6], [undefined, undefined]]);
    assert.equal(body[6].text, "  return read(limit, retries);");
    assert.equal(body.at(-1)!.kind, "note");
    assert.equal(body.at(-1)!.text, "No newline at end of file");
    assert.deepEqual(diffTotals(rows), { added: 3, removed: 2 });
  });

  it("keeps multi-hunk numbering and treats dashes inside a hunk as content", () => {
    const rows = parseUnifiedDiff([
      "diff --git a/a.sql b/a.sql",
      "--- a/a.sql",
      "+++ b/a.sql",
      "@@ -8,2 +8,3 @@",
      "--- removed separator",
      "+-- added separator",
      " tail",
      "@@ -40,1 +41,1 @@ named",
      "-old",
      "+new",
      "",
    ].join("\r\n"));
    assert.deepEqual(rows.filter(({ kind }) => kind === "hunk").map(({ text: label }) => label), ["@@ -8,2 +8,3 @@", "@@ -40,1 +41,1 @@ named"]);
    const removed = rows.filter(({ kind }) => kind === "removed");
    assert.deepEqual(removed.map(({ text: value, oldLine }) => [value, oldLine]), [["-- removed separator", 8], ["old", 40]]);
    assert.deepEqual(rows.filter(({ kind }) => kind === "added").map(({ text: value, newLine }) => [value, newLine]), [["-- added separator", 8], ["new", 41]]);
    assert.deepEqual(rows.filter(({ kind }) => kind === "context").map(({ text: value, oldLine, newLine }) => [value, oldLine, newLine]), [["tail", 9, 9]]);
  });

  it("splits multi-file patches and headlines meaningful metadata only", () => {
    const rows = parseUnifiedDiff([
      "diff --git a/old/name.ts b/new/name.ts",
      "similarity index 96%",
      "rename from old/name.ts",
      "rename to new/name.ts",
      "index 1111111..2222222 100644",
      "--- a/old/name.ts",
      "+++ b/new/name.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "diff --git a/img.png b/img.png",
      "new file mode 100644",
      "index 0000000..3333333",
      "Binary files /dev/null and b/img.png differ",
      "",
    ].join("\n"));
    const sections = diffSections(rows);
    assert.deepEqual(sections.map(({ path }) => path), ["new/name.ts", "img.png"]);
    assert.deepEqual(sections.map(({ lines }) => diffTotals(lines)), [{ added: 1, removed: 1 }, { added: 0, removed: 0 }]);
    assert.deepEqual(diffNotices(sections[0].lines), ["重命名 old/name.ts → new/name.ts"]);
    assert.deepEqual(diffNotices(sections[1].lines), ["新建文件", "二进制文件差异，无法显示逐行内容"]);
  });

  it("bounds the rendered rows of a pathological patch while keeping true totals", async () => {
    const body = Array.from({ length: 2100 }, (_, index) => `+line ${index}`);
    const content = ["diff --git a/huge.ts b/huge.ts", "--- a/huge.ts", "+++ b/huge.ts", "@@ -0,0 +1,2100 @@", ...body, ""].join("\n");
    await act(() => { renderer = create(createElement(WorkspaceDiff, { content })); });
    assert.equal(renderer!.root.findAllByProps({ className: "workspace-diff-row" }).length, 2000);
    assert.deepEqual(diffTotals(parseUnifiedDiff(content)), { added: 2100, removed: 0 });
    assert.match(text(renderer!.root.findByProps({ className: "workspace-diff-truncated" })), /仅显示前 2,000 行（共 2,100 行）/);
  });

  it("renders gutters, signs and tinted rows without a raw pre block", async () => {
    await act(() => { renderer = create(createElement(WorkspaceDiff, { content: patch })); });
    assert.equal(renderer!.root.findAllByType("pre").length, 0);
    const rows = () => renderer!.root.findAllByProps({ className: "workspace-diff-row" });
    assert.deepEqual(rows().map((node) => node.props["data-kind"]), ["context", "removed", "added", "added", "context", "removed", "added", "context"]);
    const added = rows()[2];
    assert.equal(text(added.findAllByProps({ className: "workspace-diff-sign" })[0]), "+");
    assert.deepEqual(added.findAllByProps({ className: "workspace-diff-number" }).map((node) => text(node)), ["", "2"]);
    assert.equal(text(added.findAllByProps({ className: "workspace-diff-text" })[0]), "const limit = 20;");
    const removed = rows()[1];
    assert.equal(text(removed.findAllByProps({ className: "workspace-diff-sign" })[0]), "−");
    assert.equal(text(removed.findAllByProps({ className: "workspace-diff-text" })[0]), "const limit = 10;");
    assert.equal(text(renderer!.root.findByProps({ className: "workspace-diff-hunk" })), "@@ -1,5 +1,6 @@ export function main() {");
    assert.match(text(renderer!.root.findByProps({ className: "workspace-diff-note" })), /No newline at end of file/);
    assert.equal(renderer!.root.findAllByProps({ className: "workspace-diff-notices" }).length, 0, "plain patches need no metadata band");
  });

  it("announces metadata for new, deleted and binary files and drops structural noise", async () => {
    await act(() => { renderer = create(createElement(WorkspaceDiff, { content: ["diff --git a/logo.png b/logo.png", "new file mode 100644", "index 0000000..4444444", "Binary files /dev/null and b/logo.png differ", ""].join("\n") })); });
    const notices = renderer!.root.findAllByProps({ className: "workspace-diff-notices" });
    assert.equal(notices.length, 1);
    assert.match(text(notices[0]), /新建文件/);
    assert.match(text(notices[0]), /二进制文件差异/);
    assert.doesNotMatch(text(notices[0]), /diff --git|index 0000000/);
    assert.equal(renderer!.root.findAllByProps({ className: "workspace-diff-row" }).length, 0);

    await act(() => { renderer!.update(createElement(WorkspaceDiff, { content: "" })); });
    assert.equal(renderer!.root.findAllByProps({ className: "workspace-diff-row" }).length, 0);
    assert.match(text(renderer!.root.findByProps({ className: "workspace-diff-empty" })), /没有可显示的差异/);

    await act(() => { renderer!.update(createElement(WorkspaceDiff, { content: "not a patch" })); });
    assert.equal(text(renderer!.root.findByType("pre")), "not a patch", "non-patch payloads keep the plain preview");
  });
});
