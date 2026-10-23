import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync, renameSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, type TestContext } from "node:test";
import { WorkspaceError } from "../shared/workspace-contract";
import { ProjectDiffReader, readProjectFile } from "./workspace-files";
import { runWorkspaceGit, type WorkspaceGitRunner } from "./workspace-reader";

function fixture(t: TestContext, committed = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-async-diff-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
  git("init", "-q");
  for (const path of ["staged.txt", "unstaged.txt", "mixed.txt", "clean.txt"]) writeFileSync(join(root, path), "base\n");
  writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
  if (committed) { git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"); }
  return { root, git };
}
function deferred() { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; }
const hasCode = (code: string) => (error: unknown) => error instanceof WorkspaceError && error.code === code;

it("preserves HEAD versus final working contents for staged, unstaged, mixed and binary changes", async (t) => {
  const { root, git } = fixture(t);
  writeFileSync(join(root, "staged.txt"), "staged-only\n");
  writeFileSync(join(root, "mixed.txt"), "index-version\n");
  writeFileSync(join(root, "added.txt"), "staged addition\n");
  git("add", ".");
  writeFileSync(join(root, "mixed.txt"), "working-version\n");
  writeFileSync(join(root, "unstaged.txt"), "unstaged-only\n");
  writeFileSync(join(root, "binary.bin"), Buffer.from([0, 4, 5]));
  const reader = new ProjectDiffReader();
  for (const [path, expected] of [["staged.txt", "staged-only"], ["unstaged.txt", "unstaged-only"], ["mixed.txt", "working-version"], ["added.txt", "staged addition"]]) {
    const patch = (await reader.read(root, path)).content;
    assert.ok(patch.includes(`+${expected}`));
    assert.doesNotMatch(patch, /\+index-version/);
  }
  assert.match((await reader.read(root, "binary.bin")).content, /Binary files.*differ/);
  assert.equal((await reader.read(root, "clean.txt")).content, "该文件没有可显示的文本差异。");
});

it("retains untracked/no-HEAD compatibility but requires preparation for staged no-HEAD files", async (t) => {
  const { root, git } = fixture(t, false);
  const reader = new ProjectDiffReader();
  assert.match((await reader.read(root, "staged.txt")).content, /new file mode/);
  git("add", "staged.txt");
  await assert.rejects(reader.read(root, "staged.txt"), hasCode("diff_requires_head"));
});

it("bounds both untracked sources and synthesized output, including many short lines", async (t) => {
  const { root } = fixture(t);
  writeFileSync(join(root, "oversource.txt"), "x".repeat(2_000_001));
  writeFileSync(join(root, "overpatch.txt"), "\n".repeat(1_000_000));
  writeFileSync(join(root, "untracked-binary.bin"), Buffer.from([0, 2]));
  const reader = new ProjectDiffReader();
  await assert.rejects(reader.read(root, "oversource.txt"), hasCode("file_too_large"));
  await assert.rejects(reader.read(root, "overpatch.txt"), hasCode("diff_too_large"));
  await assert.rejects(reader.read(root, "untracked-binary.bin"), /binary/i);
  writeFileSync(join(root, "unstaged.txt"), "x".repeat(2_000_001));
  await assert.rejects(reader.read(root, "unstaged.txt"), hasCode("diff_too_large"));
  writeFileSync(join(root, "carriage.txt"), "first\rsecond\nlast\n");
  assert.ok((await reader.read(root, "carriage.txt")).content.endsWith("+first\rsecond\n+last\n+"));
});

it("coalesces validated root/path reads, isolates paths and roots, and reads fresh after completion", async (t) => {
  const { root } = fixture(t), other = fixture(t).root;
  const gate = deferred(), entered = deferred();
  let calls = 0;
  const reader = new ProjectDiffReader({ runGit: async () => { calls++; if (calls === 3) entered.release(); await gate.promise; return "tracked patch"; } });
  const first = reader.read(root, "staged.txt"), duplicate = reader.read(root, "staged.txt"), second = reader.read(root, "mixed.txt"), isolated = reader.read(other, "staged.txt");
  await entered.promise;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 3);
  gate.release();
  const [a, b] = await Promise.all([first, duplicate, second, isolated]);
  assert.equal(a, b);
  await reader.read(root, "staged.txt");
  assert.equal(calls, 4, "completed results must not be cached");
  const live = new ProjectDiffReader();
  writeFileSync(join(root, "unstaged.txt"), "before\n");
  assert.match((await live.read(root, "unstaged.txt")).content, /\+before/);
  writeFileSync(join(root, "unstaged.txt"), "after\n");
  assert.match((await live.read(root, "unstaged.txt")).content, /\+after/);
});

it("rejects nonzero partial stdout and failed status and releases coalesced failed work", async (t) => {
  const { root } = fixture(t);
  let fail = true, calls = 0;
  const gate = deferred(), entered = deferred();
  const reader = new ProjectDiffReader({ runGit: async () => { calls++; entered.release(); await gate.promise; if (fail) throw Object.assign(new Error("failed after writing output"), { code: 128, stdout: "partial patch" }); return "complete patch"; } });
  const first = reader.read(root, "staged.txt"), duplicate = reader.read(root, "staged.txt");
  const a = assert.rejects(first, hasCode("diff_read_failed")), b = assert.rejects(duplicate, hasCode("diff_read_failed"));
  await entered.promise;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 1);
  gate.release(); await Promise.all([a, b]);
  fail = false;
  assert.equal((await reader.read(root, "staged.txt")).content, "complete patch");
  assert.equal(calls, 2);
  const failedStatus = new ProjectDiffReader({ runGit: async (_root, args) => { if (args.includes("status")) throw Object.assign(new Error("failed status"), { code: 128 }); return ""; } });
  await assert.rejects(failedStatus.read(root, "clean.txt"), hasCode("diff_read_failed"));
});

it("uses a total preview deadline across command stages and reports actual subprocess overflow/timeout", async (t) => {
  const { root } = fixture(t);
  const budgets: number[] = [];
  const stages: WorkspaceGitRunner = async (_root, args, options) => {
    budgets.push(options.timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, args.includes("status") ? 300 : 50));
    return "";
  };
  await assert.rejects(new ProjectDiffReader({ runGit: stages, timeoutMs: 300 }).read(root, "clean.txt"), hasCode("diff_timeout"));
  assert.equal(budgets.length, 2);
  assert.ok(budgets[1] < budgets[0], "second command receives only remaining budget");
  writeFileSync(join(root, "unstaged.txt"), "changed line\n".repeat(100));
  await assert.rejects(new ProjectDiffReader({ maxBuffer: 64 }).read(root, "unstaged.txt"), hasCode("diff_too_large"));
  const slow: WorkspaceGitRunner = (directory, args, options) => runWorkspaceGit(directory, ["-c", "core.fsmonitor=sleep 0.15; false", ...args], options);
  await assert.rejects(new ProjectDiffReader({ runGit: slow, timeoutMs: 20 }).read(root, "clean.txt"), hasCode("diff_timeout"));
});

it("revalidates roots and paths around async work and before joining shared results", async (t) => {
  const { root } = fixture(t), other = fixture(t).root;
  const directory = join(root, "folder"); mkdirSync(directory);
  writeFileSync(join(directory, "file.txt"), "inside\n");
  const gate = deferred(), entered = deferred();
  const reader = new ProjectDiffReader({ runGit: async () => { entered.release(); await gate.promise; return "patch must not escape"; } });
  const pending = reader.read(root, "folder/file.txt");
  const rejected = assert.rejects(pending, /diff|escapes/i);
  await entered.promise;
  renameSync(directory, join(root, "original-folder"));
  symlinkSync(other, directory);
  await assert.rejects(reader.read(root, "folder/file.txt"), /escapes/i);
  gate.release(); await rejected;
  await assert.rejects(readProjectFile(root, "folder/file.txt"), /escapes/i);
});

it("rejects FIFO previews without waiting for a writer", (t) => {
  if (process.platform === "win32") return t.skip("POSIX named-pipe fixture");
  const { root } = fixture(t);
  execFileSync("mkfifo", [join(root, "pipe")]);
  const script = `import assert from 'node:assert/strict'; import {readProjectFile,readProjectDiff} from ${JSON.stringify(new URL("./workspace-files.ts", import.meta.url).href)}; await assert.rejects(readProjectFile(${JSON.stringify(root)},'pipe'),/not a file/); assert.equal((await readProjectDiff(${JSON.stringify(root)},'pipe')).content,'该文件没有可显示的文本差异。');`;
  execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "--eval", script], { timeout: 3_000, stdio: "pipe" });
});

it("rejects a replaced root instead of reusing its pending patch for the replacement directory", async (t) => {
  const { root } = fixture(t), destination = fixture(t).root;
  const gate = deferred(), entered = deferred();
  let calls = 0;
  const reader = new ProjectDiffReader({ runGit: async () => { calls++; entered.release(); await gate.promise; return "fixture patch"; } });
  const old = reader.read(root, "staged.txt");
  const rejected = assert.rejects(old, hasCode("workspace_replaced"));
  await entered.promise;
  renameSync(root, join(destination, "original-workspace"));
  mkdirSync(root);
  const replacement = reader.read(root, "staged.txt");
  gate.release();
  await rejected;
  assert.equal((await replacement).content, "fixture patch");
  assert.equal(calls, 2, "same path string with a different inode must not share work");
});
