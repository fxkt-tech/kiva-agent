import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { decodeResourceId, WorkspaceError, type OwnedWorkspace, type ProjectResource, type WorkspaceRemovalInspection } from "../shared/workspace-contract";
import { git } from "./workspace-registry";

/** Owns Git checkout/removal. The repository persists each intent before calling prepare/remove. */
export class ExecutionWorkspace {
  readonly managedRoot: string;
  private readonly installationKey: string;
  constructor(installationRoot: string, worktreeRoot = process.env.KIVA_WEB_WORKTREE_ROOT ?? join(dirname(installationRoot), ".kiva-worktrees")) {
    this.managedRoot = canonicalProspective(resolve(worktreeRoot));
    this.installationKey = digest(realpathSync(installationRoot)).slice(0, 16);
  }

  reserve(project: ProjectResource, sessionId: string, operationId: string, registeredRoots: string[]): OwnedWorkspace {
    if (project.capability.state !== "ready") throw new WorkspaceError("git_not_ready", project.capability.message, 409, { projectId: project.id });
    const capability = project.capability;
    const treeRoot = join(this.managedRoot, this.installationKey, project.id, sessionId);
    for (const root of [...registeredRoots, capability.repositoryRoot]) {
      if (contains(root, treeRoot) || contains(treeRoot, root)) throw new WorkspaceError("unsafe_workspace_root", "Managed worktrees must be outside registered/source directories.");
    }
    return {
      projectId: project.id, sessionId, operationId, managedRoot: this.managedRoot, treeRoot,
      executionRoot: join(treeRoot, capability.projectSubdirectory), repositoryRoot: capability.repositoryRoot,
      commonDirectory: capability.commonDirectory, projectSubdirectory: capability.projectSubdirectory,
      baseCommit: capability.head, branch: `kiva/session/${sessionId}`, state: "provisioning",
    };
  }

  prepare(workspace: OwnedWorkspace): OwnedWorkspace {
    this.validateLocation(workspace);
    if (workspace.state === "removed") throw new WorkspaceError("workspace_removed", "This workspace was removed. Continue into a new session to execute again.");
    if (existsSync(workspace.treeRoot)) {
      this.prove(workspace);
      return { ...workspace, state: "ready", error: undefined };
    }
    if (this.entries(workspace).some((entry) => entry.worktree === workspace.treeRoot)) throw new WorkspaceError("workspace_missing", "Git still registers this missing workspace; repair it explicitly before retrying.");
    if (refExists(workspace.repositoryRoot, `refs/heads/${workspace.branch}`)) throw new WorkspaceError("workspace_branch_conflict", "The reserved branch already exists without its owned worktree; inspect it before retrying.");
    mkdirSync(dirname(workspace.treeRoot), { recursive: true });
    this.validateLocation(workspace);
    git(workspace.repositoryRoot, ["worktree", "add", "-b", workspace.branch, workspace.treeRoot, workspace.baseCommit]);
    this.prove(workspace);
    return { ...workspace, state: "ready", error: undefined };
  }

  resolve(workspace: OwnedWorkspace): string {
    if (workspace.state !== "ready") throw new WorkspaceError("workspace_unavailable", workspace.state === "removed" ? "Workspace was removed; history restoration does not recreate files." : "Workspace setup must be repaired before execution.");
    this.prove(workspace);
    if (!existsSync(workspace.executionRoot) || realpathSync(workspace.executionRoot) !== workspace.executionRoot) throw new WorkspaceError("workspace_context_missing", "The selected project directory is absent or has changed ownership inside the worktree.");
    return workspace.executionRoot;
  }

  inspectRemoval(workspace: OwnedWorkspace): WorkspaceRemovalInspection {
    try {
      this.validateLocation(workspace);
      if (workspace.state === "removed") {
        if (existsSync(workspace.treeRoot) || this.entries(workspace).some((entry) => entry.worktree === workspace.treeRoot)) throw new WorkspaceError("workspace_ownership", "A removed workspace location has been reused.");
        return { state: "removed", treeRoot: workspace.treeRoot, branch: workspace.branch, localChanges: [], revision: digest(JSON.stringify(workspace)) };
      }
      const registration = this.prove(workspace);
      if (registration.locked !== undefined || registration.prunable !== undefined) throw new WorkspaceError("workspace_locked", "Unlock or repair this worktree explicitly before cleanup.");
      if (git(workspace.treeRoot, ["ls-files", "--stage"]).split("\n").some((line) => line.startsWith("160000 "))) throw new WorkspaceError("workspace_submodules", "Worktree cleanup with submodules requires manual handling.");
      // Git status and worktree remove can both overlook local contents when
      // these index flags are set. Do not change the user's index to inspect it.
      if (git(workspace.treeRoot, ["ls-files", "-v", "-z"]).split("\0").some((entry) => /^[a-zS] /.test(entry))) throw new WorkspaceError("workspace_index_flags", "Workspace index uses assume-unchanged or skip-worktree. Clear these flags and inspect local files before cleanup, or uncheck workspace cleanup.");
      const status = git(workspace.treeRoot, ["status", "--porcelain=v1", "--untracked-files=all", "--ignored=matching"]);
      const localChanges = status ? status.split("\n") : [];
      const revision = digest(JSON.stringify({ workspace, registration, status, head: git(workspace.treeRoot, ["rev-parse", "HEAD"]) }));
      return { state: localChanges.length ? "dirty" : "clean", treeRoot: workspace.treeRoot, branch: workspace.branch, localChanges, revision };
    } catch (error) {
      return { state: "unavailable", treeRoot: workspace.treeRoot, branch: workspace.branch, localChanges: [], revision: digest(JSON.stringify(workspace)), message: error instanceof Error ? error.message : String(error) };
    }
  }

  remove(workspace: OwnedWorkspace, revision: string): OwnedWorkspace {
    const inspection = this.inspectRemoval(workspace);
    if (inspection.revision !== revision) throw new WorkspaceError("stale_confirmation", "Workspace changed after deletion preview; review it again.");
    if (inspection.state === "removed") return workspace;
    if (inspection.state !== "clean") throw new WorkspaceError(inspection.state === "dirty" ? "workspace_dirty" : "workspace_ownership", inspection.message ?? "Local files would be discarded; handle them or uncheck workspace cleanup.");
    // Git independently checks cleanliness again. Never force and never remove the branch ref.
    git(workspace.repositoryRoot, ["worktree", "remove", workspace.treeRoot]);
    return { ...workspace, state: "removed" };
  }

  private validateLocation(workspace: OwnedWorkspace) {
    decodeResourceId(workspace.projectId);
    decodeResourceId(workspace.sessionId);
    const expected = join(workspace.managedRoot, this.installationKey, workspace.projectId, workspace.sessionId);
    if (canonicalProspective(workspace.managedRoot) !== workspace.managedRoot || workspace.treeRoot !== expected || workspace.executionRoot !== resolve(expected, workspace.projectSubdirectory)
      || !contains(expected, workspace.executionRoot) || canonicalProspective(expected) !== expected || contains(workspace.repositoryRoot, expected) || contains(expected, workspace.repositoryRoot)
      || realpathSync(workspace.repositoryRoot) !== workspace.repositoryRoot || workspace.branch !== `kiva/session/${workspace.sessionId}` || !/^[a-f0-9]{40,64}$/.test(workspace.baseCommit)
      || realpathSync(workspace.commonDirectory) !== workspace.commonDirectory
      || realpathSync(git(workspace.repositoryRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) !== workspace.commonDirectory) {
      throw new WorkspaceError("workspace_ownership", "Workspace location or Git ownership changed; cleanup is blocked.");
    }
  }

  private prove(workspace: OwnedWorkspace) {
    this.validateLocation(workspace);
    if (!existsSync(workspace.treeRoot) || lstatSync(workspace.treeRoot).isSymbolicLink() || realpathSync(workspace.treeRoot) !== workspace.treeRoot) throw new WorkspaceError("workspace_missing", "Owned worktree is missing or substituted.");
    const entry = this.entries(workspace).find((candidate) => candidate.worktree === workspace.treeRoot);
    if (!entry || entry.branch !== `refs/heads/${workspace.branch}` || entry.detached !== undefined
      || git(workspace.treeRoot, ["symbolic-ref", "HEAD"]) !== `refs/heads/${workspace.branch}`
      || realpathSync(git(workspace.treeRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) !== workspace.commonDirectory) throw new WorkspaceError("workspace_ownership", "Worktree registration or branch no longer matches its session.");
    return entry;
  }

  private entries(workspace: OwnedWorkspace): Record<string, string>[] {
    const output = git(workspace.repositoryRoot, ["worktree", "list", "--porcelain", "-z"]);
    return output.split("\0\0").filter(Boolean).map((block) => Object.fromEntries(block.split("\0").filter(Boolean).map((line) => { const index = line.indexOf(" "); return index < 0 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)]; })));
  }
}

function refExists(root: string, ref: string) { try { git(root, ["show-ref", "--verify", ref]); return true; } catch { return false; } }
function contains(root: string, path: string) { const value = relative(root, path); return value === "" || (!isAbsolute(value) && value !== ".." && !value.startsWith(`..${sep}`)); }
function canonicalProspective(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  try { if (lstatSync(path).isSymbolicLink()) throw new WorkspaceError("workspace_ownership", "Managed workspace contains a dangling symlink."); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
  const parent = dirname(path);
  if (parent === path) throw new Error("Cannot resolve workspace root");
  return join(canonicalProspective(parent), relative(parent, path));
}
export function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
