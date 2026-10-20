import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, it } from "node:test";
import { SessionCatalog } from "./session-catalog";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kiva-session-catalog-"));
  roots.push(root);
  const sessions = join(root, ".kiva", "sessions");
  mkdirSync(join(sessions, "project"), { recursive: true });
  writeFileSync(join(sessions, "project", "one.jsonl"), [
    JSON.stringify({ type: "session", id: "one" }),
    JSON.stringify({ type: "session_info", name: "First session" }),
    JSON.stringify({ type: "message", message: { role: "user", content: "Hello catalog" } }),
  ].join("\n"));
  return { root, catalog: new SessionCatalog(root) };
}

describe("SessionCatalog", () => {
  it("lists active sessions and supports archive and restore", () => {
    const { catalog } = fixture();

    assert.deepEqual(catalog.list("active").map(({ id, name, preview, path }) => ({ id, name, preview, path })), [
      { id: "one", name: "First session", preview: "Hello catalog", path: "project/one.jsonl" },
    ]);

    catalog.archive("project/one.jsonl");
    assert.equal(catalog.list("active").length, 0);
    assert.equal(catalog.list("archived")[0].path, "project/one.jsonl");

    catalog.restore("project/one.jsonl");
    assert.equal(catalog.list("archived").length, 0);
    assert.equal(catalog.list("active")[0].id, "one");
  });

  it("moves deleted sessions to a recoverable trash directory", () => {
    const { root, catalog } = fixture();

    const trashPath = catalog.trash("project/one.jsonl", "active");

    assert.equal(catalog.list("active").length, 0);
    assert.equal(catalog.list("trash")[0].path, "active/project/one.jsonl");
    assert.match(trashPath, /\.kiva\/sessions\/\.trash\/active\/project\/one\.jsonl/);
    assert.match(readFileSync(trashPath, "utf8"), /Hello catalog/);

    catalog.restoreDeleted("active/project/one.jsonl");
    assert.equal(catalog.list("trash").length, 0);
    assert.equal(catalog.list("active")[0].id, "one");
  });

  it("rejects paths outside its managed roots", () => {
    const { catalog } = fixture();
    assert.throws(() => catalog.archive("../../outside.jsonl"), /invalid session path/i);
  });
});
