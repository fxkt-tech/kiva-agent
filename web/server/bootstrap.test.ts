import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { getBootstrapData } from "./bootstrap";
import { readProjectDiff, readProjectFile } from "./workspace-files";

it("keeps exact Unicode, newline, whitespace and renamed paths in workspace listings and URLs", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-bootstrap-paths-")));
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git(["init", "-q"]);
  mkdirSync(join(root, "目录"));
  const source = "目录/中文 文件.txt", destination = "目录/新 -> 文件.txt";
  const newline = "line\nbreak.ts", whitespace = " leading and trailing ";
  for (const path of [source, newline, whitespace]) writeFileSync(join(root, path), `contents ${path}\n`);
  git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  renameSync(join(root, source), join(root, destination));
  git(["add", "--all"]);
  writeFileSync(join(root, newline), "changed newline filename\n");
  writeFileSync(join(root, whitespace), "changed whitespace filename\n");
  const untracked = "未跟踪 -> 文件.txt";
  writeFileSync(join(root, untracked), "untracked\n");

  const data = getBootstrapData(root, { installationRoot: root, recentProjects: [], historyRoot: root });
  for (const path of [destination, newline, whitespace, untracked]) {
    assert.ok(data.project.files.includes(path), `File listing must preserve ${JSON.stringify(path)}`);
    assert.ok(data.project.changes.some((change) => change.path === path), `Change listing must preserve ${JSON.stringify(path)}`);
    const query = new URLSearchParams({ path });
    const decoded = new URL(`http://fixture.local/files?${query}`).searchParams.get("path")!;
    assert.equal(readProjectFile(root, decoded).path, path);
    assert.ok(readProjectDiff(root, decoded).content.length > 0);
  }
  assert.equal(data.project.changes.filter((change) => change.path === destination).length, 1);
  assert.equal(data.project.changes.some((change) => change.path === source), false);
});

it("lists only selected-subdirectory changes using paths relative to its execution context", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-bootstrap-context-")));
  const context = join(root, "package");
  mkdirSync(context);
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git(["init", "-q"]);
  for (const path of ["outside.txt", "package/file.ts", "package/旧 文件.txt", "package/leaving.txt"]) writeFileSync(join(root, path), `${path}\n`);
  git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  writeFileSync(join(root, "outside.txt"), "outside changes must not appear\n");
  writeFileSync(join(context, "file.ts"), "inside changes\n");
  renameSync(join(context, "旧 文件.txt"), join(context, "新 文件.txt"));
  renameSync(join(context, "leaving.txt"), join(root, "moved-outside.txt"));
  git(["add", "--all"]);
  const data = getBootstrapData(context, { installationRoot: root, recentProjects: [], historyRoot: context });
  assert.deepEqual(data.project.changes.map((change) => change.path).sort(), ["file.ts", "leaving.txt", "新 文件.txt"].sort());
  assert.ok(data.project.changes.some((change) => change.path === "leaving.txt" && change.status === "D"));
  assert.ok(data.project.files.includes("file.ts"));
  assert.equal(data.project.files.some((path) => path.startsWith("package/") || path.includes("outside")), false);
  assert.match(readProjectDiff(context, "file.ts").content, /inside changes/);
  assert.match(readProjectDiff(context, "leaving.txt").content, /deleted file mode/);
});
