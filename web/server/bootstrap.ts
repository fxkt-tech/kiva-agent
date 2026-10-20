import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import type { BootstrapData } from "@/shared/types";
import { SessionCatalog } from "@/server/session-catalog";
import { installationRoot, workspaceRegistry } from "@/server/workspace-registry";

function git(repoRoot: string, args: string[]) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" }).stdout.trimEnd();
}

export function getBootstrapData(): BootstrapData {
  const repoRoot = workspaceRegistry.activeRoot();
  const status = git(repoRoot, ["-c", "core.quotepath=false", "status", "--porcelain=v1"]);
  const trackedFiles = git(repoRoot, ["ls-files", "--cached", "--others", "--exclude-standard"]);
  const files = trackedFiles ? trackedFiles.split("\n").slice(0, 1_000) : listFiles(repoRoot);
  const changes = status ? status.split("\n").map((line) => {
    const value = line.slice(3);
    return { status: line.slice(0, 2).trim() || "M", path: value.includes(" -> ") ? value.slice(value.lastIndexOf(" -> ") + 4) : value };
  }) : [];
  const sessions = new SessionCatalog(repoRoot).list("active").slice(0, 30);
  const modelConfigFound = existsSync(join(installationRoot, ".kiva", "agent", "models.json"));
  return {
    renderedAt: new Date().toISOString(),
    project: {
      name: basename(repoRoot),
      path: repoRoot,
      branch: git(repoRoot, ["branch", "--show-current"]) || "detached",
      dirtyFiles: changes.length,
      files,
      changes,
    },
    runtime: { piVersion: "1.3.0", modelConfigFound, status: modelConfigFound ? "ready" : "needs-model" },
    sessions,
    recentProjects: workspaceRegistry.recent(),
  };
}

function listFiles(root: string) {
  const ignored = new Set([".git", ".kiva", ".next", "node_modules"]);
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (files.length >= 1_000 || ignored.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  };
  visit(root);
  return files;
}
