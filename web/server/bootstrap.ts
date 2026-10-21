import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import type { BootstrapData } from "@/shared/types";
import { SessionCatalog } from "@/server/session-catalog";
import { installationRoot, workspaceRegistry } from "@/server/workspace-registry";

function git(repoRoot: string, args: string[]) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).stdout ?? "";
}

export function getBootstrapData(repoRoot = workspaceRegistry.activeRoot(), options: { installationRoot?: string; recentProjects?: string[]; historyRoot?: string } = {}): BootstrapData {
  const status = git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."]);
  const prefix = git(repoRoot, ["rev-parse", "--show-prefix"]).replace(/\r?\n$/, "");
  const trackedFiles = git(repoRoot, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const files = trackedFiles ? trackedFiles.split("\0").filter(Boolean).slice(0, 1_000) : listFiles(repoRoot);
  const changes: BootstrapData["project"]["changes"] = [];
  const records = status.split("\0");
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record.length < 4) continue;
    const state = record.slice(0, 2);
    // Porcelain -z emits the destination first, followed by a separate source
    // record for copies/renames. Paths can contain Unicode, arrows or newlines.
    const destination = record.slice(3);
    const source = /[RC]/.test(state) ? records[++index] : undefined;
    if (destination.startsWith(prefix)) changes.push({ status: state.trim() || "M", path: destination.slice(prefix.length) });
    else if (source?.startsWith(prefix) && state.includes("R")) changes.push({ status: "D", path: source.slice(prefix.length) });
  }
  const sessions = new SessionCatalog(options.historyRoot ?? repoRoot).list("active").slice(0, 30);
  const modelConfigFound = existsSync(join(options.installationRoot ?? installationRoot, ".kiva", "agent", "models.json"));
  return {
    renderedAt: new Date().toISOString(),
    project: {
      name: basename(repoRoot),
      path: repoRoot,
      branch: git(repoRoot, ["branch", "--show-current"]).trim() || "detached",
      dirtyFiles: changes.length,
      files,
      changes,
    },
    runtime: { piVersion: "1.3.0", modelConfigFound, status: modelConfigFound ? "ready" : "needs-model" },
    sessions,
    recentProjects: options.recentProjects ?? workspaceRegistry.recent(),
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
