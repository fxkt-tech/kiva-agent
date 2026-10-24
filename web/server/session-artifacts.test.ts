import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { SessionArtifactReader, explicitPaths, normalizeArtifactPath } from "./session-artifacts";
import type { ArtifactContext } from "./session-repository";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(records: unknown[], id = "one") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "kiva-artifacts-"))); roots.push(root);
  await mkdir(join(root, ".kiva", "sessions"), { recursive: true });
  const history = join(root, ".kiva", "sessions", `${id}.jsonl`);
  await writeFile(history, [{ type: "session", id, version: 3, cwd: root, timestamp: "2026-10-24T00:00:00Z" }, ...records].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const context: ArtifactContext = { projectRoot: root, root, recordedRoot: root, known: true, persisted: true };
  const reader = new SessionArtifactReader({ artifactContext: () => context });
  return { root, history, context, reader, scope: { projectId: "project", sessionId: id } };
}
const msg = (id: string, parentId: string | null, role: string, content: unknown, extras = {}) => ({ type: "message", id, parentId, timestamp: "2026-10-24T01:00:00Z", message: { role, content, ...extras } });

describe("session artifact references", () => {
  it("uses branch-scoped successful write/read evidence and explicit links, never arbitrary directory files", async () => {
    const f = await fixture([
      msg("first", null, "user", "[预览](plots/demo.html) 和 `chart.svg`"),
      msg("call", "first", "assistant", [{ type: "toolCall", id: "write1", name: "write", arguments: { path: "plots/demo.html", content: "..." } }]),
      msg("result", "call", "toolResult", [{ type: "text", text: "Successfully wrote to plots/demo.html" }], { toolCallId: "write1", isError: false }),
      msg("failed", "result", "assistant", [{ type: "toolCall", id: "write2", name: "write", arguments: { path: "failed.html" } }]),
      msg("error", "failed", "toolResult", "failed.html", { toolCallId: "write2", isError: true }),
      msg("other", "first", "user", "`off-branch.html`"),
      msg("leaf", "error", "assistant", "`chart.svg`"),
    ]);
    await mkdir(join(f.root, "plots")); await writeFile(join(f.root, "plots/demo.html"), "<h1>demo</h1>"); await writeFile(join(f.root, "chart.svg"), "<svg/>"); await writeFile(join(f.root, "unrelated.html"), "not related");
    const { list } = await f.reader.read(f.scope);
    assert.equal(list.complete, true);
    assert.deepEqual(list.artifacts.map((item) => item.path), ["chart.svg", "plots/demo.html"]);
    const demo = list.artifacts[1];
    assert.deepEqual(demo.relations.sort(), ["referenced", "written"]);
    assert.ok(demo.sources.some((source) => source.entryId === "call" && source.toolCallId === "write1"));
    assert.equal(demo.availability, "available"); assert.ok(demo.version);
    assert.equal(list.artifacts.some((item) => item.path === "failed.html" || item.path === "off-branch.html"), false);
  });

  it("ignores uploaded text, thinking, code examples and remote URLs while decoding local links once", () => {
    const references = explicitPaths('See [图](plots/my%20chart.svg) and `demo.html:12`.\n```html\n<img src="fake.svg">\n```\n<attached_file name="upload.html">`attachment.svg`</attached_file>\n![external](https://example.test/a.png)');
    const paths = references.map((path) => normalizeArtifactPath(path)).filter(Boolean);
    assert.deepEqual(paths, ["plots/my chart.svg", "demo.html"]);
    for (const path of ["%252e%252e/x.svg", "https://example.test/image.png", "//example.test/image.png"]) assert.equal(normalizeArtifactPath(path), undefined);
  });

  it("recognizes local Markdown URLs with query/fragment metadata without corrupting encoded filenames", () => {
    const references = explicitPaths('[页面](demo.html#section) ![图](chart.svg?v=2) [特殊文件](literal%23name.html?view=1) 和 `literal#name.html`');
    assert.deepEqual(references.map((path) => normalizeArtifactPath(path)), ["demo.html", "chart.svg", "literal#name.html", "literal#name.html"]);
  });

  it("preserves missing entries, resolves recorded relative bases without a live workspace, and has no completed-result cache", async () => {
    const f = await fixture([msg("first", null, "user", "`later.html`")]);
    const first = await f.reader.read(f.scope);
    assert.equal(first.list.artifacts[0].availability, "missing");
    await writeFile(join(f.root, "later.html"), "now exists");
    const fresh = await f.reader.read(f.scope);
    assert.equal(fresh.list.artifacts[0].availability, "available");
    f.context.root = undefined; f.context.workspaceError = "工作区已删除";
    const removed = await f.reader.read(f.scope);
    assert.equal(removed.list.artifacts[0].availability, "available", "a recorded base remains authoritative without a live worktree");
  });

  it("allows an explicitly referenced symlink target and never resolves another session's same-named file", async () => {
    const f = await fixture([msg("first", null, "user", "`escape.html`")]);
    const external = await mkdtemp(join(tmpdir(), "kiva-external-")); roots.push(external);
    await writeFile(join(external, "escape.html"), "private"); await symlink(join(external, "escape.html"), join(f.root, "escape.html"));
    const { list } = await f.reader.read(f.scope);
    assert.equal(list.artifacts[0].availability, "available");
    assert.equal((await f.reader.artifact(f.scope, list.artifacts[0].id)).locator.canonicalPath, await realpath(join(external, "escape.html")));
    const secondScope = { ...f.scope, sessionId: "other" };
    f.context.known = false;
    await assert.rejects(f.reader.read(secondScope), /不属于/);
  });

  it("keeps deterministic legacy source identities and marks malformed tails incomplete", async () => {
    const f = await fixture([{ type: "message", message: { role: "user", content: "`legacy.html`" } }]);
    const first = await f.reader.read(f.scope), second = await f.reader.read(f.scope);
    assert.deepEqual(first.list.artifacts[0].sources, second.list.artifacts[0].sources);
    await writeFile(f.history, (await readFile(f.history, "utf8")) + '{"partial":');
    const partial = await f.reader.read(f.scope);
    assert.equal(partial.list.complete, false); assert.equal(partial.list.artifacts.length, 1); assert.ok(partial.list.warnings.length);
  });

  it("marks inherited writes as inherited instead of generated by the continuing session", async () => {
    const f = await fixture([
      { ...msg("call", null, "assistant", [{ type: "toolCall", id: "write1", name: "write", arguments: { path: "old.html" } }]), timestamp: "2026-10-23T00:00:00Z" },
      { ...msg("done", "call", "toolResult", "written", { toolCallId: "write1" }), timestamp: "2026-10-23T00:00:01Z" },
    ]);
    f.context.sourceSessionId = "original";
    const result = await f.reader.read(f.scope);
    assert.deepEqual(result.list.artifacts[0].relations, ["inherited"]);
  });

  it("requires unique call IDs and compatible result names before claiming a generated file", async () => {
    const f = await fixture([
      msg("call-first", null, "assistant", [{ type: "toolCall", id: "duplicate", name: "write", arguments: { path: "first.html" } }]),
      msg("done-first", "call-first", "toolResult", "complete", { toolCallId: "duplicate", toolName: "write" }),
      msg("call-second", "done-first", "assistant", [{ type: "toolCall", id: "duplicate", name: "write", arguments: { path: "second.html" } }]),
      msg("done-second", "call-second", "toolResult", "complete", { toolCallId: "duplicate", toolName: "write" }),
      msg("call-mismatch", "done-second", "assistant", [{ type: "toolCall", id: "mismatch", name: "write", arguments: { path: "mismatch.html" } }]),
      msg("done-mismatch", "call-mismatch", "toolResult", "complete", { toolCallId: "mismatch", toolName: "read" }),
      msg("call-valid", "done-mismatch", "assistant", [{ type: "toolCall", id: "valid", name: "write", arguments: { path: "valid.html" } }]),
      msg("done-valid", "call-valid", "toolResult", "complete", { toolCallId: "valid", toolName: "write" }),
    ]);
    const { list } = await f.reader.read(f.scope);
    assert.deepEqual(list.artifacts.map((item) => item.path), ["valid.html"]);
    assert.deepEqual(list.artifacts[0].relations, ["written"]);
    assert.equal(list.complete, false);
    assert.ok(list.warnings.some((warning) => warning.includes("重复")));
    assert.ok(list.warnings.some((warning) => warning.includes("不匹配")));
  });

  it("indexes target references beyond JSONL preview limits without retaining or budgeting unrelated transcripts", async () => {
    const rows: unknown[] = [];
    for (let index = 0; index < 9; index++) rows.push({ type: "custom", id: `padding-${index}`, parentId: index ? `padding-${index - 1}` : null, data: "x".repeat(1_000_000) });
    rows.push(msg("late-source", "padding-8", "assistant", "`late.html`"));
    const f = await fixture(rows);
    const unrelated = await open(join(f.root, ".kiva/sessions/unrelated.jsonl"), "w");
    try {
      await unrelated.write(JSON.stringify({ type: "session", id: "unrelated" }) + "\n");
      const record = JSON.stringify({ type: "custom", data: "y".repeat(1_000_000) }) + "\n";
      for (let index = 0; index < 68; index++) await unrelated.write(record);
      await unrelated.write('{"unfinished":');
    } finally { await unrelated.close(); }
    const result = await f.reader.read(f.scope);
    assert.equal(result.list.complete, true);
    assert.deepEqual(result.list.artifacts.map((item) => item.path), ["late.html"]);
    assert.equal(result.list.artifacts[0].sources[0].entryId, "late-source");
  });

  it("previews explicit external, parent-relative and file-URL artifacts and deduplicates canonical aliases", async () => {
    const f = await fixture([]);
    const external = await realpath(await mkdtemp(join(tmpdir(), "kiva-external-artifacts-"))); roots.push(external);
    const path = join(external, "outside.html"), alias = path.replace(/^\/private\/var\//, "/var/");
    await writeFile(path, "<h1>external</h1>");
    const link = relative(f.root, path);
    await writeFile(f.history, [
      { type: "session", version: 3, id: "one", cwd: f.root },
      msg("all-refs", null, "assistant", `[absolute](${path}) [relative](${link}) [alias](${alias}) [file](${pathToFileURL(path).href})`),
    ].map((entry) => JSON.stringify(entry)).join("\n"));
    f.context.root = undefined;
    const result = await f.reader.read(f.scope);
    assert.equal(result.list.artifacts.length, 1);
    assert.equal(result.list.artifacts[0].availability, "available");
    assert.equal(result.list.artifacts[0].path, path);
    assert.equal((await f.reader.artifact(f.scope, result.list.artifacts[0].id)).locator.canonicalPath, path);
  });
});
