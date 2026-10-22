import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { SessionRepository } from "./session-repository";
import { WorkspaceRegistry } from "./workspace-registry";
import { ExecutionWorkspace } from "./execution-workspace";
import { SessionCatalog } from "./session-catalog";
import type { CurrentBranchWorkspace, OwnedWorkspace, ProjectResource } from "../shared/workspace-contract";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim(); }
function fixture(withGit = true) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-session-repository-")));
  roots.push(root);
  const installation = join(root, "installation");
  const projectRoot = join(root, "source");
  mkdirSync(installation); mkdirSync(projectRoot);
  if (withGit) {
    git(projectRoot, "init"); git(projectRoot, "config", "user.email", "fixture@example.invalid"); git(projectRoot, "config", "user.name", "Fixture");
    writeFileSync(join(projectRoot, ".gitignore"), ".kiva/\nignored/\n");
    writeFileSync(join(projectRoot, "file.txt"), "base\n");
    git(projectRoot, "add", "."); git(projectRoot, "commit", "-m", "base");
  }
  const registry = new WorkspaceRegistry(installation);
  const project = registry.register(projectRoot);
  const options = { worktreeRoot: join(root, "worktrees") };
  const repository = new SessionRepository(registry, options);
  return { root, projectRoot, installation, registry, project, repository, options };
}
function transcript(root: string, id: string, name = id) {
  const directory = join(root, ".kiva", "sessions");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${id}.jsonl`);
  writeFileSync(file, [
    { type: "session", version: 3, id, cwd: root, timestamp: "2026-10-21T00:00:00.000Z" },
    { type: "message", id: "m1", parentId: null, timestamp: "2026-10-21T00:00:00.000Z", message: { role: "user", content: [{ type: "text", text: `hello ${name}` }], timestamp: 1792540800000 } },
    { type: "session_info", id: "n1", parentId: "m1", timestamp: "2026-10-21T00:00:00.000Z", name },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  return file;
}

describe("SessionRepository", () => {
  it("defaults to the dirty registered checkout, survives restart and follows user branch changes", async () => {
    const { projectRoot, project, registry, repository, options } = fixture();
    writeFileSync(join(projectRoot, "file.txt"), "staged source\n"); git(projectRoot, "add", "file.txt");
    writeFileSync(join(projectRoot, "file.txt"), "dirty source\n");
    writeFileSync(join(projectRoot, "local.txt"), "untracked source");
    const index = readFileSync(join(projectRoot, ".git", "index"));
    const refs = git(projectRoot, "show-ref");
    const worktrees = git(projectRoot, "worktree", "list", "--porcelain");
    const session = await repository.create(project.id, { operationId: "current_once" });
    assert.equal(session.workspace!.mode, "current-branch");
    assert.equal(session.workspace!.executionRoot, projectRoot);
    const baseCommit = session.workspace!.baseCommit;
    assert.equal(repository.resolveWorkspace(project.id, session.id), projectRoot);
    assert.equal(repository.resolveExecution(project.id, session.id).executionRoot, projectRoot);
    assert.match(repository.resolveExecution(project.id, session.id).workspaceNotice!, /current project files|local changes/);
    const restarted = new SessionRepository(registry, options);
    assert.equal((await restarted.create(project.id, { operationId: "current_once" })).id, session.id);
    await assert.rejects(restarted.create(project.id, { operationId: "current_once", workspaceMode: "worktree" }), /original workspace mode/);
    assert.equal(restarted.resolveExecution(project.id, session.id).executionRoot, projectRoot);
    assert.deepEqual(readFileSync(join(projectRoot, ".git", "index")), index);
    assert.equal(readFileSync(join(projectRoot, "file.txt"), "utf8"), "dirty source\n");
    assert.equal(readFileSync(join(projectRoot, "local.txt"), "utf8"), "untracked source");
    assert.equal(git(projectRoot, "show-ref"), refs);
    assert.equal(git(projectRoot, "worktree", "list", "--porcelain"), worktrees);
    assert.equal(existsSync(options.worktreeRoot), false);
    git(projectRoot, "switch", "-c", "user-changed-branch");
    assert.equal(restarted.read(project.id, session.id).session.workspace!.branch, "user-changed-branch");
    assert.equal(restarted.read(project.id, session.id).session.workspace!.baseCommit, baseCommit);
    assert.equal(restarted.resolveExecution(project.id, session.id).executionRoot, projectRoot);
  });

  it("retains failed creation mode and IDs on retry while rejecting invalid or conflicting modes before writes", async () => {
    const { projectRoot, project, registry, repository, options, installation } = fixture();
    await assert.rejects(repository.create(project.id, { workspaceMode: "unsafe" as "worktree" }), (error: unknown) => (error as { code: string }).code === "invalid_workspace_mode");
    assert.equal(existsSync(join(projectRoot, ".kiva", "web")), false);
    class InterruptedCurrent extends ExecutionWorkspace {
      override prepareCurrent(_workspace: CurrentBranchWorkspace, _project: ProjectResource): CurrentBranchWorkspace { throw new Error("temporary current-directory failure"); }
    }
    const interrupted = new SessionRepository(registry, { ...options, workspaces: new InterruptedCurrent(installation, options.worktreeRoot) });
    await assert.rejects(interrupted.create(project.id, { operationId: "retry_current" }), /temporary current-directory failure/);
    const failed = repository.list(project.id)[0];
    assert.equal(failed.workspace!.mode, "current-branch"); assert.equal(failed.workspace!.state, "failed");
    const metadata = join(projectRoot, ".kiva", "web", "sessions", `${failed.id}.json`);
    const before = readFileSync(metadata, "utf8");
    await assert.rejects(repository.create(project.id, { operationId: "retry_current", workspaceMode: "worktree" }), /original workspace mode/);
    assert.equal(readFileSync(metadata, "utf8"), before);
    const restarted = new SessionRepository(registry, options);
    const ready = await restarted.create(project.id, { operationId: "retry_current" });
    assert.equal(ready.id, failed.id); assert.equal(ready.workspace!.mode, "current-branch");
    assert.equal(restarted.resolveExecution(project.id, ready.id).executionRoot, projectRoot);
    assert.equal(existsSync(options.worktreeRoot), false);
  });

  it("retries a failed worktree creation at its original base despite the new omitted-mode default", async () => {
    const { projectRoot, project, registry, repository, options, installation } = fixture();
    class InterruptedOwned extends ExecutionWorkspace {
      override prepare(_workspace: OwnedWorkspace): OwnedWorkspace { throw new Error("temporary owned-worktree failure"); }
    }
    const interrupted = new SessionRepository(registry, { ...options, workspaces: new InterruptedOwned(installation, options.worktreeRoot) });
    await assert.rejects(interrupted.create(project.id, { operationId: "retry_owned", workspaceMode: "worktree" }), /temporary owned-worktree failure/);
    const failed = repository.list(project.id)[0];
    writeFileSync(join(projectRoot, "file.txt"), "later committed source\n"); git(projectRoot, "add", "file.txt"); git(projectRoot, "commit", "-m", "later");
    const restarted = new SessionRepository(registry, options);
    const ready = await restarted.create(project.id, { operationId: "retry_owned" });
    assert.equal(ready.id, failed.id); assert.equal(ready.workspace!.mode, "worktree");
    assert.equal(ready.workspace!.baseCommit, failed.workspace!.baseCommit);
    assert.equal(readFileSync(join(restarted.resolveWorkspace(project.id, ready.id), "file.txt"), "utf8"), "base\n");
    assert.equal(readFileSync(join(projectRoot, "file.txt"), "utf8"), "later committed source\n");
  });

  it("never offers or performs source cleanup, including forged requests and deletion retries", async () => {
    const { projectRoot, project, registry, repository, options } = fixture();
    const session = await repository.create(project.id);
    const history = transcript(projectRoot, session.id);
    writeFileSync(join(projectRoot, "file.txt"), "keep source changes\n");
    const metadata = join(projectRoot, ".kiva", "web", "sessions", `${session.id}.json`);
    const before = readFileSync(metadata, "utf8"); const historyBefore = readFileSync(history, "utf8");
    const preview = repository.deletionPreview(project.id, session.id);
    assert.equal(preview.removeWorktree, false); assert.equal(preview.workspace.state, "none");
    assert.match(preview.recovery, /shared project directory/);
    await assert.rejects(repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true }), /history-only deletion/);
    assert.equal(readFileSync(metadata, "utf8"), before); assert.equal(readFileSync(history, "utf8"), historyBefore);
    const deleted = await repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: false });
    assert.equal(deleted.status, "complete"); assert.equal(deleted.workspace, "retained"); assert.equal(deleted.history, "trashed");
    const restarted = new SessionRepository(registry, options);
    assert.equal(restarted.deletionPreview(project.id, session.id).removeWorktree, false);
    await assert.rejects(restarted.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true }), /history-only deletion/);
    const restored = restarted.action(project.id, session.id, { type: "restore_deleted" });
    assert.equal(restored.executable, true);
    assert.equal(restarted.resolveWorkspace(project.id, session.id), projectRoot);
    assert.equal(readFileSync(join(projectRoot, "file.txt"), "utf8"), "keep source changes\n");
    assert.equal(readFileSync(history, "utf8"), historyBefore); assert.equal(existsSync(options.worktreeRoot), false);
  });

  it("rejects metadata redirection and canonical path substitution for current-directory execution", async () => {
    const { projectRoot, project, registry, repository, root, options } = fixture();
    const session = await repository.create(project.id);
    const metadata = join(projectRoot, ".kiva", "web", "sessions", `${session.id}.json`);
    const saved = JSON.parse(readFileSync(metadata, "utf8"));
    const redirected = { ...saved, workspace: { ...saved.workspace, executionRoot: root, projectSubdirectory: ".." } };
    writeFileSync(metadata, JSON.stringify(redirected));
    assert.throws(() => repository.resolveWorkspace(project.id, session.id), /ownership changed/);
    writeFileSync(metadata, JSON.stringify(saved));
    const moved = join(root, "moved-source"); renameSync(projectRoot, moved); symlinkSync(moved, projectRoot);
    const restarted = new SessionRepository(registry, options);
    assert.throws(() => restarted.resolveWorkspace(project.id, session.id), /unavailable|moved/);
    assert.equal(readFileSync(join(moved, "file.txt"), "utf8"), "base\n");
  });

  it("keeps old metadata without mode as an owned worktree for retries, execution and cleanup", async () => {
    const { projectRoot, project, registry, repository, options } = fixture();
    const session = await repository.create(project.id, { operationId: "old_worktree", workspaceMode: "worktree" });
    const metadata = join(projectRoot, ".kiva", "web", "sessions", `${session.id}.json`);
    const saved = JSON.parse(readFileSync(metadata, "utf8")); delete saved.workspace.mode;
    writeFileSync(metadata, JSON.stringify(saved));
    const restarted = new SessionRepository(registry, options);
    const retried = await restarted.create(project.id, { operationId: "old_worktree" });
    assert.equal(retried.id, session.id); assert.equal(retried.workspace!.mode, undefined);
    assert.equal(restarted.resolveExecution(project.id, session.id).executionRoot, session.workspace!.executionRoot);
    assert.notEqual(session.workspace!.executionRoot, projectRoot);
    await assert.rejects(restarted.create(project.id, { operationId: "old_worktree", workspaceMode: "current-branch" }), /original workspace mode/);
    const preview = restarted.deletionPreview(project.id, session.id);
    assert.equal(preview.removeWorktree, true); assert.equal(preview.workspace.state, "clean");
    const outcome = await restarted.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true });
    assert.equal(outcome.workspace, "removed"); assert.equal(existsSync(projectRoot), true);
  });

  it("creates durable empty IDs at the pinned committed base without copying source changes", async () => {
    const { projectRoot, project, registry, repository, options } = fixture();
    const base = git(projectRoot, "rev-parse", "HEAD");
    writeFileSync(join(projectRoot, "file.txt"), "source dirty\n");
    writeFileSync(join(projectRoot, "untracked.txt"), "source only");
    mkdirSync(join(projectRoot, "ignored")); writeFileSync(join(projectRoot, "ignored", "secret.env"), "source only");
    const first = await repository.create(project.id, { operationId: "once", name: "Empty", workspaceMode: "worktree" });
    const second = await repository.create(project.id, { operationId: "twice", workspaceMode: "worktree" });
    assert.notEqual(first.workspace!.treeRoot, second.workspace!.treeRoot);
    assert.equal(readFileSync(join(first.workspace!.treeRoot, "file.txt"), "utf8"), "base\n");
    assert.equal(existsSync(join(first.workspace!.treeRoot, "untracked.txt")), false);
    assert.equal(existsSync(join(first.workspace!.treeRoot, "ignored")), false);
    assert.equal(first.workspace!.baseCommit, base);
    assert.deepEqual(repository.read(project.id, first.id).messages, []);
    assert.equal(repository.resolveExecution(project.id, first.id).sessionFile, undefined);
    repository.updateControls(project.id, first.id, { thinkingLevel: "medium", model: { provider: "p", id: "m" } });
    const restarted = new SessionRepository(registry, options);
    const same = await restarted.create(project.id, { operationId: "once" });
    assert.equal(same.id, first.id); assert.equal(same.name, "Empty");
    assert.equal(same.controls!.thinkingLevel, "medium");
    writeFileSync(join(first.workspace!.treeRoot, "file.txt"), "session only");
    assert.equal(readFileSync(join(second.workspace!.treeRoot, "file.txt"), "utf8"), "base\n");
    assert.equal(readFileSync(join(projectRoot, "file.txt"), "utf8"), "source dirty\n");
    repository.action(project.id, first.id, { type: "archive" });
    assert.equal(restarted.read(project.id, first.id).session.collection, "archived");
    assert.throws(() => repository.resolveExecution(project.id, first.id), /Restore or repair/);
    assert.equal(existsSync(first.workspace!.treeRoot), true);
  });

  it("resolves legacy IDs outside 100 rows passively and forks dialogue using supported Pi APIs", async () => {
    const { projectRoot, project, repository } = fixture();
    const original = transcript(projectRoot, "legacy", "Old dialogue");
    const originalBytes = readFileSync(original, "utf8");
    for (let index = 0; index < 105; index++) transcript(projectRoot, `s${index}`);
    assert.equal(repository.list(project.id).length, 106);
    const read = repository.read(project.id, "legacy");
    assert.equal(read.session.legacy, true); assert.match(read.messages[0].text, /Old dialogue/);
    assert.equal(existsSync(join(projectRoot, ".kiva", "web")), false);
    assert.throws(() => repository.resolveExecution(project.id, "legacy"), /Continue this conversation/);
    repository.rename(project.id, "legacy", "Renamed passively");
    writeFileSync(join(projectRoot, "file.txt"), "current uncommitted files for the continuation\n");
    const index = readFileSync(join(projectRoot, ".git", "index"));
    const worktrees = git(projectRoot, "worktree", "list", "--porcelain");
    const child = await repository.continue(project.id, "legacy", { operationId: "fork" });
    assert.notEqual(child.id, "legacy"); assert.equal(child.sourceSessionId, "legacy");
    assert.equal(child.workspace!.mode, "current-branch"); assert.equal(child.workspace!.executionRoot, projectRoot);
    assert.match(repository.resolveExecution(project.id, child.id).workspaceNotice!, /current project files/);
    assert.doesNotMatch(repository.resolveExecution(project.id, child.id).workspaceNotice!, /Code starts from current committed revision/);
    assert.equal(repository.read(project.id, child.id).messages[0].text, read.messages[0].text);
    assert.equal(readFileSync(original, "utf8"), originalBytes);
    const childPath = repository.resolveExecution(project.id, child.id).sessionFile!;
    const header = JSON.parse(readFileSync(childPath, "utf8").split("\n")[0]);
    assert.equal(header.id, child.id); assert.equal(header.cwd, child.workspace!.executionRoot);
    assert.equal(readFileSync(join(repository.resolveWorkspace(project.id, child.id), "file.txt"), "utf8"), "current uncommitted files for the continuation\n");
    assert.deepEqual(readFileSync(join(projectRoot, ".git", "index")), index);
    assert.equal(git(projectRoot, "worktree", "list", "--porcelain"), worktrees);
    const isolated = await repository.continue(project.id, "legacy", { operationId: "fork_owned", workspaceMode: "worktree" });
    assert.equal(isolated.workspace!.mode, "worktree"); assert.notEqual(isolated.workspace!.executionRoot, projectRoot);
    assert.match(repository.resolveExecution(project.id, isolated.id).workspaceNotice!, /Code starts from current committed revision/);
  });

  it("keeps non-Git projects passive and refreshes capability after user preparation", async () => {
    const { projectRoot, registry, project, repository } = fixture(false);
    assert.equal(project.capability.state, "non-git");
    await assert.rejects(repository.create(project.id), /initial commit/);
    assert.equal(existsSync(join(projectRoot, ".git")), false);
    git(projectRoot, "init");
    assert.equal(registry.resolve(project.id).capability.state, "no-commit");
  });

  it("rejects ambiguous transcripts and metadata symlink escapes", () => {
    const { projectRoot, project, repository, root } = fixture();
    const file = transcript(projectRoot, "same");
    writeFileSync(join(projectRoot, ".kiva", "sessions", "duplicate.jsonl"), readFileSync(file));
    assert.throws(() => repository.read(project.id, "same"), /Multiple transcripts/);
    mkdirSync(join(root, "external"));
    symlinkSync(join(root, "external"), join(projectRoot, ".kiva", "web"));
    assert.throws(() => repository.list(project.id), /symlink/);
  });

  it("blocks dirty cleanup before moving history, while unchecked cleanup retains every file", async () => {
    const { project, repository } = fixture();
    const session = await repository.create(project.id, { workspaceMode: "worktree" });
    const path = join(session.workspace!.treeRoot, "file.txt");
    writeFileSync(path, "keep me");
    const preview = repository.deletionPreview(project.id, session.id, "r1");
    assert.equal(preview.workspace.state, "dirty"); assert.equal(preview.removeWorktree, true);
    await assert.rejects(repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true, lifecycleRevision: "r1" }), /local changes/i);
    assert.equal(repository.read(project.id, session.id).session.collection, "active");
    const result = await repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: false, lifecycleRevision: "r1" });
    assert.equal(result.status, "complete"); assert.equal(result.workspace, "retained");
    assert.equal(readFileSync(path, "utf8"), "keep me");
    repository.action(project.id, session.id, { type: "restore_deleted" });
    assert.equal(repository.read(project.id, session.id).session.executable, true);
  });

  it("revalidates state and runtime revisions; clean cleanup keeps the branch and restores history honestly", async () => {
    const { project, projectRoot, repository } = fixture();
    const session = await repository.create(project.id, { workspaceMode: "worktree" });
    transcript(projectRoot, session.id);
    const preview = repository.deletionPreview(project.id, session.id, "v1");
    await assert.rejects(repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true, lifecycleRevision: "v2" }), /changed after preview/);
    const result = await repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true, lifecycleRevision: "v1" });
    assert.equal(result.workspace, "removed"); assert.equal(result.history, "trashed");
    assert.equal(existsSync(session.workspace!.treeRoot), false);
    assert.ok(git(projectRoot, "show-ref", "--verify", `refs/heads/${session.workspace!.branch}`));
    assert.deepEqual(await repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true, lifecycleRevision: "v1" }), result);
    const restored = repository.action(project.id, session.id, { type: "restore_deleted" });
    assert.equal(restored.workspace!.state, "removed"); assert.equal(restored.executable, false);
    assert.throws(() => repository.resolveWorkspace(project.id, session.id), /does not recreate/);
  });

  it("blocks ignored, untracked and staged content, stale previews, and later registered roots", async () => {
    const { project, repository, registry } = fixture();
    const session = await repository.create(project.id, { workspaceMode: "worktree" });
    const preview = repository.deletionPreview(project.id, session.id);
    mkdirSync(join(session.workspace!.treeRoot, "ignored"));
    writeFileSync(join(session.workspace!.treeRoot, "ignored", "data"), "ignored user data");
    assert.equal(repository.deletionPreview(project.id, session.id).workspace.state, "dirty");
    await assert.rejects(repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true }), /changed after preview/);
    registry.register(session.workspace!.treeRoot);
    assert.equal(repository.deletionPreview(project.id, session.id).workspace.state, "unavailable");
    assert.equal(existsSync(session.workspace!.treeRoot), true);
  });

  it("preserves archived empty-session collection and controls over restart/trash/restore", async () => {
    const { project, repository, registry, options } = fixture();
    const session = await repository.create(project.id, { name: "Empty archived" });
    repository.updateControls(project.id, session.id, { thinkingLevel: "high" });
    repository.action(project.id, session.id, { type: "archive" });
    const preview = repository.deletionPreview(project.id, session.id);
    await repository.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: false });
    const restarted = new SessionRepository(registry, options);
    const restored = restarted.action(project.id, session.id, { type: "restore_deleted" });
    assert.equal(restored.collection, "archived"); assert.equal(restored.name, "Empty archived");
    assert.equal(restored.controls!.thinkingLevel, "high");
    assert.equal(restored.workspace!.state, "ready"); assert.equal(restored.executable, false);
  });

  it("prefers transcript control projection over older metadata without rewriting the transcript", async () => {
    const { project, projectRoot, repository } = fixture();
    const session = await repository.create(project.id);
    repository.updateControls(project.id, session.id, { thinkingLevel: "low", model: { provider: "old", id: "old" } });
    const path = transcript(projectRoot, session.id);
    appendFileSync(path, [
      { type: "model_change", id: "model", parentId: "n1", timestamp: "2026-10-21T00:00:01.000Z", provider: "new", modelId: "new" },
      { type: "thinking_level_change", id: "thinking", parentId: "model", timestamp: "2026-10-21T00:00:02.000Z", thinkingLevel: "high" },
    ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    const bytes = readFileSync(path, "utf8");
    const controls = repository.read(project.id, session.id).session.controls!;
    assert.deepEqual(controls.model, { provider: "new", id: "new" }); assert.equal(controls.thinkingLevel, "high");
    assert.equal(readFileSync(path, "utf8"), bytes);
  });

  it("reports history-move and Git-removal failures truthfully and retries them after restart", async () => {
    const { project, projectRoot, registry, repository, options, installation } = fixture();
    const session = await repository.create(project.id, { workspaceMode: "worktree" });
    transcript(projectRoot, session.id);
    class FailingCatalog extends SessionCatalog { override trash(): string { throw new Error("history move failed"); } }
    const failingHistory = new SessionRepository(registry, { ...options, catalog: (root) => new FailingCatalog(root) });
    const preview = failingHistory.deletionPreview(project.id, session.id);
    const failure = await failingHistory.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true });
    assert.equal(failure.history, "retained"); assert.equal(failure.workspace, "retained"); assert.equal(failure.status, "partial");
    assert.equal(existsSync(session.workspace!.treeRoot), true);
    const freshHistoryPreview = new SessionRepository(registry, options).deletionPreview(project.id, session.id, "new-process-revision");
    assert.equal(freshHistoryPreview.confirmation, preview.confirmation);
    assert.equal(freshHistoryPreview.deletion!.operationId, failure.operationId);
    assert.equal(freshHistoryPreview.deletion!.history, "retained");
    assert.equal(freshHistoryPreview.removeWorktree, true);
    await assert.rejects(repository.delete(project.id, session.id, { confirmation: "replacement-token", removeWorktree: false }), (error: unknown) => (error as { code: string }).code === "deletion_choice_changed");
    class FailingWorkspace extends ExecutionWorkspace { override remove(_workspace: OwnedWorkspace, _revision: string): OwnedWorkspace { throw new Error("Git removal failed"); } }
    const failingGit = new SessionRepository(registry, { ...options, workspaces: new FailingWorkspace(installation, options.worktreeRoot) });
    const partial = await failingGit.delete(project.id, session.id, { confirmation: freshHistoryPreview.confirmation, removeWorktree: freshHistoryPreview.removeWorktree });
    assert.equal(partial.history, "trashed"); assert.equal(partial.workspace, "retained"); assert.equal(partial.status, "partial");
    assert.equal(failingGit.read(project.id, session.id).session.executable, false);
    const restarted = new SessionRepository(registry, options);
    const freshPreview = restarted.deletionPreview(project.id, session.id, "after-restart");
    assert.equal(freshPreview.collection, "trash"); assert.equal(freshPreview.deletion!.history, "trashed");
    assert.equal(freshPreview.confirmation, preview.confirmation); assert.equal(freshPreview.deletion!.operationId, failure.operationId);
    await assert.rejects(restarted.delete(project.id, session.id, { confirmation: freshPreview.confirmation, removeWorktree: false }), /original cleanup choice/);
    writeFileSync(join(session.workspace!.treeRoot, "file.txt"), "new local edits after partial deletion\n");
    await assert.rejects(restarted.delete(project.id, session.id, { confirmation: freshPreview.confirmation, removeWorktree: true }), /local changes/i);
    assert.equal(readFileSync(join(session.workspace!.treeRoot, "file.txt"), "utf8"), "new local edits after partial deletion\n");
    writeFileSync(join(session.workspace!.treeRoot, "file.txt"), "base\n");
    const complete = await restarted.delete(project.id, session.id, { confirmation: restarted.deletionPreview(project.id, session.id).confirmation, removeWorktree: true });
    assert.equal(complete.status, "complete"); assert.equal(complete.workspace, "removed");
    assert.equal(complete.operationId, failure.operationId);
    assert.equal(restarted.read(project.id, session.id).messages.length, 1);
  });

  it("reconciles removal acknowledgement failure and finishes its persisted operation after restart", async () => {
    const { project, projectRoot, registry, repository, options, installation } = fixture();
    const session = await repository.create(project.id, { workspaceMode: "worktree" });
    transcript(projectRoot, session.id);
    class InterruptedWorkspace extends ExecutionWorkspace {
      override remove(workspace: OwnedWorkspace, revision: string): OwnedWorkspace { super.remove(workspace, revision); throw new Error("interrupted acknowledgement"); }
    }
    const interrupted = new SessionRepository(registry, { ...options, workspaces: new InterruptedWorkspace(installation, options.worktreeRoot) });
    const preview = interrupted.deletionPreview(project.id, session.id);
    const partial = await interrupted.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: true });
    assert.equal(partial.status, "partial"); assert.equal(partial.workspace, "removed");
    const restarted = new SessionRepository(registry, options);
    const read = restarted.read(project.id, session.id);
    assert.equal(read.session.workspace!.state, "removed"); assert.equal(read.session.deletion!.history, "trashed");
    const freshPreview = restarted.deletionPreview(project.id, session.id, "fresh-runtime");
    assert.equal(freshPreview.confirmation, preview.confirmation);
    assert.equal(freshPreview.workspace.state, "removed"); assert.equal(freshPreview.removeWorktree, true);
    assert.equal(freshPreview.deletion!.workspace, "removed");
    const result = await restarted.delete(project.id, session.id, { confirmation: freshPreview.confirmation, removeWorktree: freshPreview.removeWorktree });
    assert.equal(result.status, "complete"); assert.equal(result.workspace, "removed");
    assert.equal(result.operationId, partial.operationId);
  });

  it("resumes a saved pending deletion through a fresh preview and locks its original history-only choice", async () => {
    const { project, projectRoot, registry, repository, options } = fixture();
    const session = await repository.create(project.id);
    transcript(projectRoot, session.id);
    class FailingCatalog extends SessionCatalog { override trash(): string { throw new Error("interrupted history move"); } }
    const failing = new SessionRepository(registry, { ...options, catalog: (root) => new FailingCatalog(root) });
    const preview = failing.deletionPreview(project.id, session.id);
    const partial = await failing.delete(project.id, session.id, { confirmation: preview.confirmation, removeWorktree: false });
    const metadata = join(projectRoot, ".kiva", "web", "sessions", `${session.id}.json`);
    const persisted = JSON.parse(readFileSync(metadata, "utf8"));
    persisted.deletion.status = "pending";
    writeFileSync(metadata, JSON.stringify(persisted));
    const restarted = new SessionRepository(registry, options);
    const fresh = restarted.deletionPreview(project.id, session.id);
    assert.equal(fresh.deletion!.status, "pending"); assert.equal(fresh.deletion!.operationId, partial.operationId);
    assert.equal(fresh.confirmation, preview.confirmation); assert.equal(fresh.removeWorktree, false);
    await assert.rejects(restarted.delete(project.id, session.id, { confirmation: "different-token", removeWorktree: true }), /history-only deletion/);
    const complete = await restarted.delete(project.id, session.id, { confirmation: fresh.confirmation, removeWorktree: fresh.removeWorktree });
    assert.equal(complete.status, "complete"); assert.equal(complete.workspace, "retained");
    assert.equal(complete.operationId, partial.operationId); assert.equal(existsSync(session.workspace!.treeRoot), true);
  });
});
