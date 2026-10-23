import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { readProjectDiff, readProjectFile } from "./workspace-files";

describe("workspace file access", async () => {
  it("reads project text files and blocks path traversal", async () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-files-"));
    writeFileSync(join(root, "README.md"), "# Project\n");

    assert.equal((await readProjectFile(root, "README.md")).content, "# Project\n");
    await assert.rejects(() => readProjectFile(root, "../outside.txt"), /escapes the active project/i);
  });

  it("renders an untracked text file as a Git diff", async () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-diff-"));
    spawnSync("git", ["init", "-q", root]);
    writeFileSync(join(root, "new.txt"), "new line\n");

    const diff = (await readProjectDiff(root, "new.txt")).content;
    assert.match(diff, /new file mode/);
    assert.match(diff, /\+new line/);
  });

  it("rejects absolute, encoded, NUL and Windows traversal paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-paths-"));
    for (const path of ["/etc/passwd", "../secret", "a/../../secret", "a/../secret", "a\\secret", "C:\\secret", "file\0.txt", "%2e%2e/secret", "%252e%252e%252fsecret", "%2fetc/passwd"]) {
      await assert.rejects(() => readProjectFile(root, path), /path.*(invalid|escapes)|invalid.*path/i, path);
      await assert.rejects(() => readProjectDiff(root, path), /path.*(invalid|escapes)|invalid.*path/i, path);
    }
  });

  it("blocks target and ancestor symlinks outside the resolved workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-link-root-"));
    const outside = mkdtempSync(join(tmpdir(), "kiva-link-outside-"));
    writeFileSync(join(outside, "secret.txt"), "outside content");
    symlinkSync(join(outside, "secret.txt"), join(root, "target.txt"));
    symlinkSync(outside, join(root, "directory"));
    for (const path of ["target.txt", "directory/secret.txt", "directory/deleted.txt"]) {
      await assert.rejects(() => readProjectFile(root, path), /escapes/i);
      await assert.rejects(() => readProjectDiff(root, path), /escapes/i);
    }
    mkdirSync(join(root, "inside"));
    writeFileSync(join(root, "inside", "safe.txt"), "safe");
    symlinkSync(join(root, "inside"), join(root, "safe-directory"));
    assert.equal((await readProjectFile(root, "safe-directory/safe.txt")).content, "safe");
  });

  it("shows deleted and renamed tracked paths and treats Git pathspec syntax literally", async () => {
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
    assert.match((await readProjectDiff(root, "removed.txt")).content, /deleted file mode/);
    assert.match((await readProjectDiff(root, "renamed.txt")).content, /-renamed content/);
    assert.match((await readProjectDiff(root, "destination.txt")).content, /\+renamed content/);
    writeFileSync(join(root, "unrelated.txt"), "changed\n");
    assert.doesNotMatch((await readProjectDiff(root, ":(glob)*")).content, /unrelated|changed/);
  });

  it("reports non-Git directories and unsupported previews explicitly", async () => {
    const root = mkdtempSync(join(tmpdir(), "kiva-preview-"));
    writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
    writeFileSync(join(root, "large.txt"), "x".repeat(2_000_001));
    await assert.rejects(() => readProjectFile(root, "binary.bin"), /binary/i);
    await assert.rejects(() => readProjectFile(root, "large.txt"), /larger than 2 MB/i);
    await assert.rejects(() => readProjectDiff(root, "binary.bin"), /prepare Git/i);
  });
});
