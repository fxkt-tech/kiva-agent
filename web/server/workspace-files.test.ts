import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
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

  it("rejects absolute, encoded, NUL and Windows traversal paths", () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-paths-"));
    for (const path of ["/etc/passwd", "../secret", "a/../../secret", "a/../secret", "a\\secret", "C:\\secret", "file\0.txt", "%2e%2e/secret", "%252e%252e%252fsecret", "%2fetc/passwd"]) {
      assert.throws(() => readProjectFile(root, path), /path.*(invalid|escapes)|invalid.*path/i, path);
      assert.throws(() => readProjectDiff(root, path), /path.*(invalid|escapes)|invalid.*path/i, path);
    }
  });

  it("blocks target and ancestor symlinks outside the resolved workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-link-root-"));
    const outside = mkdtempSync(join(tmpdir(), "kiva-link-outside-"));
    writeFileSync(join(outside, "secret.txt"), "outside content");
    symlinkSync(join(outside, "secret.txt"), join(root, "target.txt"));
    symlinkSync(outside, join(root, "directory"));
    for (const path of ["target.txt", "directory/secret.txt", "directory/deleted.txt"]) {
      assert.throws(() => readProjectFile(root, path), /escapes/i);
      assert.throws(() => readProjectDiff(root, path), /escapes/i);
    }
    mkdirSync(join(root, "inside"));
    writeFileSync(join(root, "inside", "safe.txt"), "safe");
    symlinkSync(join(root, "inside"), join(root, "safe-directory"));
    assert.equal(readProjectFile(root, "safe-directory/safe.txt").content, "safe");
  });

  it("shows deleted and renamed tracked paths and treats Git pathspec syntax literally", () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-deleted-"));
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };
    git(["init", "-q"]);
    writeFileSync(join(root, "removed.txt"), "old content\n");
    writeFileSync(join(root, "renamed.txt"), "renamed content\n");
    writeFileSync(join(root, "unrelated.txt"), "unrelated\n");
    git(["add", "."]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
    unlinkSync(join(root, "removed.txt"));
    renameSync(join(root, "renamed.txt"), join(root, "destination.txt"));
    git(["add", "--all"]);
    assert.match(readProjectDiff(root, "removed.txt").content, /deleted file mode/);
    assert.match(readProjectDiff(root, "renamed.txt").content, /-renamed content/);
    assert.match(readProjectDiff(root, "destination.txt").content, /\+renamed content/);
    writeFileSync(join(root, "unrelated.txt"), "changed\n");
    assert.doesNotMatch(readProjectDiff(root, ":(glob)*").content, /unrelated|changed/);
  });

  it("reports non-Git directories and unsupported previews explicitly", () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-preview-"));
    writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
    writeFileSync(join(root, "large.txt"), "x".repeat(2_000_001));
    assert.throws(() => readProjectFile(root, "binary.bin"), /binary/i);
    assert.throws(() => readProjectFile(root, "large.txt"), /larger than 2 MB/i);
    assert.throws(() => readProjectDiff(root, "binary.bin"), /prepare Git/i);
  });
});
