import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { listWorkspaceDirectories } from "./workspace-directories";

describe("workspace directory browser", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("lists only child directories and exposes the parent for navigation", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-directories-")));
    roots.push(root);
    mkdirSync(join(root, "beta"));
    mkdirSync(join(root, "alpha"));
    writeFileSync(join(root, "README.md"), "not a directory");

    const result = listWorkspaceDirectories(root);

    assert.equal(result.path, root);
    assert.equal(result.parent, realpathSync(tmpdir()));
    assert.deepEqual(result.directories.map((entry) => entry.name), ["alpha", "beta"]);
    assert.deepEqual(result.directories.map((entry) => entry.path), [join(root, "alpha"), join(root, "beta")]);
  });

  it("rejects files as directory locations", () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-directories-"));
    roots.push(root);
    const file = join(root, "README.md");
    writeFileSync(file, "text");

    assert.throws(() => listWorkspaceDirectories(file), /not a directory/i);
  });
});
