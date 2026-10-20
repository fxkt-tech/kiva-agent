import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { readProjectDiff, readProjectFile } from "./workspace-files";

describe("workspace file access", () => {
  it("reads project text files and blocks path traversal", () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-files-"));
    writeFileSync(join(root, "README.md"), "# Project\n");

    assert.equal(readProjectFile(root, "README.md").content, "# Project\n");
    assert.throws(() => readProjectFile(root, "../outside.txt"), /escapes the active project/i);
  });

  it("renders an untracked text file as a Git diff", () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-diff-"));
    spawnSync("git", ["init", "-q", root]);
    writeFileSync(join(root, "new.txt"), "new line\n");

    const diff = readProjectDiff(root, "new.txt").content;
    assert.match(diff, /new file mode/);
    assert.match(diff, /\+new line/);
  });
});
