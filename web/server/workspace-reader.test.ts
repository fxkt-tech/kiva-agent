import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, type TestContext } from "node:test";
import { WorkspaceError } from "../shared/workspace-contract";
import { inspectGitCapability } from "./workspace-registry";
import { WorkspaceReader, runWorkspaceGit, type WorkspaceGitRunner } from "./workspace-reader";

function fixture(t: TestContext, git = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-workspace-reader-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (git) execFileSync("git", ["init", "-q", "-b", "fixture-main", root], { stdio: "pipe" });
  return root;
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
const hasCode = (code: string) => (error: unknown) => error instanceof WorkspaceError && error.code === code;

it("returns complete Git and non-Git listings beyond 1,000 files and skips fallback symlinks", async (t) => {
  for (const git of [true, false]) {
    const root = fixture(t, git);
    mkdirSync(join(root, "nested"));
    for (let index = 0; index < 1_201; index++) writeFileSync(join(root, "nested", `file-${index}.txt`), "fixture\n");
    if (!git) {
      for (const ignored of ["node_modules", ".kiva", ".git", ".next"]) {
        mkdirSync(join(root, ignored)); writeFileSync(join(root, ignored, "ignored.txt"), "ignore\n");
      }
      symlinkSync(join(root, "nested"), join(root, "symlink"));
    }
    const data = await new WorkspaceReader().read(root, inspectGitCapability(root));
    assert.equal(data.project.files.length, 1_201);
    assert.ok(data.project.files.includes("nested/file-1200.txt"));
    assert.equal(data.project.changes.length, git ? 1_201 : 0);
    assert.deepEqual(Object.keys(data).sort(), ["project", "renderedAt"]);
  }
});

it("keeps valid empty Git listings empty instead of scanning ignored files", async (t) => {
  const root = fixture(t);
  execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "empty"], { stdio: "pipe" });
  writeFileSync(join(root, ".git", "info", "exclude"), "ignored.txt\n");
  writeFileSync(join(root, "ignored.txt"), "must not leak into fallback\n");
  const data = await new WorkspaceReader().read(root, inspectGitCapability(root));
  assert.deepEqual(data.project.files, []);
  assert.deepEqual(data.project.changes, []);
});

it("browses unborn repositories and explicit missing-Git directories", async (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "new.txt"), "untracked\n");
  const unborn = await new WorkspaceReader().read(root, inspectGitCapability(root));
  assert.equal(unborn.project.branch, "fixture-main");
  assert.deepEqual(unborn.project.changes, [{ status: "??", path: "new.txt" }]);
  const noGit = new WorkspaceReader({ runGit: async () => { throw new Error("Explicit fallback must not run Git"); } });
  assert.deepEqual((await noGit.read(root, { state: "missing-git", message: "fixture" })).project.files, ["new.txt"]);
});

it("coalesces equivalent in-flight reads, isolates roots and refreshes after completion", async (t) => {
  const root = fixture(t), other = fixture(t);
  writeFileSync(join(root, "first.txt"), "first\n");
  writeFileSync(join(other, "other.txt"), "other\n");
  const gate = deferred(), entered = deferred();
  let calls = 0;
  const runGit: WorkspaceGitRunner = async (...args) => { calls++; if (calls >= 8) entered.release(); await gate.promise; return runWorkspaceGit(...args); };
  const reader = new WorkspaceReader({ runGit });
  const capability = inspectGitCapability(root), otherCapability = inspectGitCapability(other);
  const first = reader.read(root, capability), duplicate = reader.read(root, capability), isolated = reader.read(other, otherCapability);
  await entered.promise;
  // Yield while the duplicate request completes its independent root validation.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 8, "four commands per root; the equivalent read must share work");
  gate.release();
  const [a, b, c] = await Promise.all([first, duplicate, isolated]);
  assert.equal(a, b);
  assert.deepEqual(a.project.files, ["first.txt"]);
  assert.deepEqual(c.project.files, ["other.txt"]);
  writeFileSync(join(root, "later.txt"), "new external file\n");
  const refreshed = await reader.read(root, capability);
  assert.equal(calls, 12);
  assert.ok(refreshed.project.files.includes("later.txt"));
  assert.notEqual(refreshed, a);
});

it("releases failed in-flight reads and never falls back after a Git or permission failure", async (t) => {
  const root = fixture(t), capability = inspectGitCapability(root);
  let fail = true, calls = 0;
  const reader = new WorkspaceReader({ runGit: async (...args) => { calls++; if (fail) throw Object.assign(new Error("permission denied"), { code: "EACCES" }); return runWorkspaceGit(...args); } });
  await assert.rejects(reader.read(root, capability), hasCode("workspace_read_failed"));
  assert.equal(calls, 4);
  fail = false;
  assert.deepEqual((await reader.read(root, capability)).project.files, []);
  assert.equal(calls, 8);
  const deniedProbe = new WorkspaceReader({ runGit: async () => { throw Object.assign(new Error("permission denied"), { code: 128, stderr: "fatal: cannot read configuration: Permission denied" }); } });
  await assert.rejects(deniedProbe.read(root), hasCode("workspace_read_failed"));
});

it("reports actual command output overflow and timeout instead of partial success", async (t) => {
  const root = fixture(t), capability = inspectGitCapability(root);
  writeFileSync(join(root, "filename-that-exceeds-the-small-fixture-buffer.txt"), "fixture\n");
  await assert.rejects(new WorkspaceReader({ maxBuffer: 16 }).read(root, capability), hasCode("workspace_read_too_large"));
  const runGit: WorkspaceGitRunner = (directory, args, options) => runWorkspaceGit(directory, ["-c", "core.fsmonitor=sleep 0.15; false", ...args], options);
  await assert.rejects(new WorkspaceReader({ runGit, timeoutMs: 20 }).read(root, capability), hasCode("workspace_read_timeout"));
  const plain = fixture(t, false);
  writeFileSync(join(plain, "filename-that-exceeds-the-small-fixture-buffer.txt"), "fixture\n");
  await assert.rejects(new WorkspaceReader({ maxBuffer: 16 }).read(plain, { state: "non-git", message: "fixture" }), hasCode("workspace_read_too_large"));
});

it("rejects replaced/missing roots and cannot reuse an old directory's in-flight result", async (t) => {
  const parent = fixture(t, false), root = join(parent, "workspace");
  mkdirSync(root);
  const gate = deferred(), entered = deferred();
  let calls = 0;
  const reader = new WorkspaceReader({ runGit: async (_root, args) => { calls++; if (calls === 4) entered.release(); await gate.promise; return args[0] === "branch" ? "fixture-main\n" : ""; } });
  const capability = { state: "no-commit", message: "fixture" } as const;
  const old = reader.read(root, capability);
  await entered.promise;
  renameSync(root, join(parent, "old-workspace"));
  mkdirSync(root);
  const replacement = reader.read(root, capability);
  const rejected = assert.rejects(old, hasCode("workspace_replaced"));
  gate.release();
  await rejected;
  assert.equal((await replacement).project.path, root);
  assert.equal(calls, 8);
  await assert.rejects(reader.read(join(parent, "missing")), hasCode("workspace_read_failed"));
});
