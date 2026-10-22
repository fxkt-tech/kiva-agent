import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { ExecutionWorkspace } from "./execution-workspace";
import { WorkspaceRegistry } from "./workspace-registry";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim(); }
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-workspace-unit-"))); roots.push(root);
  const source = join(root, "source"); const install = join(root, "install");
  mkdirSync(join(source, "package"), { recursive: true }); mkdirSync(install);
  git(source, "init"); git(source, "config", "user.email", "fixture@example.invalid"); git(source, "config", "user.name", "Fixture");
  writeFileSync(join(source, ".gitignore"), ".kiva/\nignored/\n"); writeFileSync(join(source, "package", "file.txt"), "base");
  git(source, "add", "."); git(source, "commit", "-m", "base");
  const registry = new WorkspaceRegistry(install); const project = registry.register(join(source, "package"));
  const workspaces = new ExecutionWorkspace(install, join(root, "managed"));
  return { root, source, install, registry, project, workspaces };
}

describe("ExecutionWorkspace", () => {
  it("uses the registered current subdirectory with dirty contents and does not mutate Git", () => {
    const { source, project, workspaces, registry, root } = fixture();
    writeFileSync(join(source, "package", "file.txt"), "staged contents");
    git(source, "add", "package/file.txt");
    writeFileSync(join(source, "package", "file.txt"), "unstaged local contents");
    writeFileSync(join(source, "package", "local.txt"), "untracked contents");
    const index = readFileSync(join(source, ".git", "index"));
    const registration = git(source, "worktree", "list", "--porcelain");
    const refs = git(source, "show-ref");
    const intent = workspaces.reserveCurrent(registry.resolve(project.id), "session_current", "operation");
    const ready = workspaces.prepareCurrent(intent, registry.resolve(project.id));
    assert.equal(workspaces.resolveCurrent(ready, registry.resolve(project.id)), project.path);
    assert.equal(ready.treeRoot, source);
    assert.equal(readFileSync(join(ready.executionRoot, "file.txt"), "utf8"), "unstaged local contents");
    assert.equal(readFileSync(join(ready.executionRoot, "local.txt"), "utf8"), "untracked contents");
    assert.deepEqual(readFileSync(join(source, ".git", "index")), index);
    assert.equal(git(source, "worktree", "list", "--porcelain"), registration);
    assert.equal(git(source, "show-ref"), refs);
    assert.equal(existsSync(join(root, "managed")), false);
    git(source, "switch", "-c", "user_selected_branch");
    assert.equal(workspaces.resolveCurrent(ready, registry.resolve(project.id)), project.path, "follow the checkout without forcing its original branch");
    assert.equal(ready.baseCommit, intent.baseCommit);
  });

  it("rejects a current directory other than the exact canonical registration or Git identity", () => {
    const { project, source, root, workspaces, registry } = fixture();
    const ready = workspaces.prepareCurrent(workspaces.reserveCurrent(project, "session_current", "operation"), project);
    const other = join(source, "other"); mkdirSync(other);
    assert.throws(() => workspaces.resolveCurrent({ ...ready, executionRoot: other, projectSubdirectory: "other" }, registry.resolve(project.id)), /ownership changed/);
    assert.throws(() => workspaces.resolveCurrent({ ...ready, commonDirectory: join(root, "different-git") }, registry.resolve(project.id)), /ownership changed/);
    const moved = join(source, "moved-package"); renameSync(project.path, moved); symlinkSync(moved, project.path);
    assert.throws(() => workspaces.resolveCurrent(ready, registry.resolve(project.id)), /ownership changed/);
    assert.equal(readFileSync(join(moved, "file.txt"), "utf8"), "base");
  });

  it("pins the reservation and retains subdirectory context despite source HEAD movement", () => {
    const { source, project, workspaces, registry } = fixture();
    const intent = workspaces.reserve(project, "session_one", "operation", registry.list().map((entry) => entry.path));
    writeFileSync(join(source, "package", "file.txt"), "new committed source");
    git(source, "add", "."); git(source, "commit", "-m", "moved");
    const ready = workspaces.prepare(intent);
    assert.equal(git(ready.treeRoot, "rev-parse", "HEAD"), intent.baseCommit);
    assert.equal(readFileSync(join(workspaces.resolve(ready), "file.txt"), "utf8"), "base");
    assert.equal(ready.executionRoot, join(ready.treeRoot, "package"));
    assert.equal(workspaces.prepare(intent).treeRoot, ready.treeRoot, "recover interrupted preparation without reset");
  });

  it("blocks local contents across the entire tree, including outside selected context", () => {
    const { project, workspaces, registry } = fixture();
    const ready = workspaces.prepare(workspaces.reserve(project, "session_two", "operation", registry.list().map((entry) => entry.path)));
    const preview = workspaces.inspectRemoval(ready);
    assert.equal(preview.state, "clean");
    writeFileSync(join(ready.treeRoot, "outside.txt"), "untracked");
    assert.equal(workspaces.inspectRemoval(ready).state, "dirty");
    assert.throws(() => workspaces.remove(ready, preview.revision), /changed after deletion preview/);
    git(ready.treeRoot, "add", "outside.txt");
    const staged = workspaces.inspectRemoval(ready);
    assert.equal(staged.state, "dirty"); assert.match(staged.localChanges.join("\n"), /outside.txt/);
    assert.throws(() => workspaces.remove(ready, staged.revision), /Local files would be discarded/);
    assert.equal(existsSync(ready.treeRoot), true);
  });

  it("blocks changed branch, locked worktree and symlink substitutions", () => {
    const { project, source, root, workspaces, registry } = fixture();
    const ready = workspaces.prepare(workspaces.reserve(project, "session_three", "operation", registry.list().map((entry) => entry.path)));
    git(source, "worktree", "lock", ready.treeRoot);
    assert.equal(workspaces.inspectRemoval(ready).state, "unavailable");
    git(source, "worktree", "unlock", ready.treeRoot);
    git(ready.treeRoot, "switch", "-c", "external_branch");
    assert.equal(workspaces.inspectRemoval(ready).state, "unavailable");
    git(ready.treeRoot, "switch", ready.branch);
    const moved = join(root, "moved"); renameSync(ready.treeRoot, moved); symlinkSync(moved, ready.treeRoot);
    assert.equal(workspaces.inspectRemoval(ready).state, "unavailable");
    assert.throws(() => workspaces.resolve(ready), /ownership|location/);
  });

  it("blocks cleanup when index flags can conceal modified tracked files", () => {
    for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
      const { project, workspaces, registry } = fixture();
      const ready = workspaces.prepare(workspaces.reserve(project, "session_flags", "operation", registry.list().map((entry) => entry.path)));
      git(ready.treeRoot, "update-index", flag, "package/file.txt");
      writeFileSync(join(ready.executionRoot, "file.txt"), "local contents concealed from Git status");
      assert.equal(git(ready.treeRoot, "status", "--porcelain=v1"), "", "Git status alone cannot prove cleanup is safe");
      const inspection = workspaces.inspectRemoval(ready);
      assert.equal(inspection.state, "unavailable");
      assert.match(inspection.message ?? "", /index|assume|skip/i);
      assert.throws(() => workspaces.remove(ready, inspection.revision), /index|assume|skip/i);
      assert.equal(readFileSync(join(ready.executionRoot, "file.txt"), "utf8"), "local contents concealed from Git status");
    }
  });

  it("uses stored workspace locations after the configured managed root changes", () => {
    const { project, workspaces, registry, install, root } = fixture();
    const ready = workspaces.prepare(workspaces.reserve(project, "session_four", "operation", registry.list().map((entry) => entry.path)));
    const reconfigured = new ExecutionWorkspace(install, join(root, "new-managed"));
    assert.equal(reconfigured.resolve(ready), ready.executionRoot);
    assert.equal(reconfigured.inspectRemoval(ready).state, "clean");
  });
});
