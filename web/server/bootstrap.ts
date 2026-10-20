import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { BootstrapData } from "@/shared/types";
import { SessionCatalog } from "@/server/session-catalog";

const repoRoot = resolve(/* turbopackIgnore: true */ process.env.KIVA_REPO_ROOT ?? join(process.cwd(), ".."));

function git(args: string[]) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
}

export function getBootstrapData(): BootstrapData {
  const status = git(["status", "--porcelain"]);
  const sessions = new SessionCatalog(repoRoot).list("active").slice(0, 30);
  const modelConfigFound = existsSync(join(repoRoot, ".kiva", "agent", "models.json"));
  return {
    renderedAt: new Date().toISOString(),
    project: {
      name: basename(repoRoot),
      path: repoRoot,
      branch: git(["branch", "--show-current"]) || "detached",
      dirtyFiles: status ? status.split("\n").length : 0,
    },
    runtime: { piVersion: "1.3.0", modelConfigFound, status: modelConfigFound ? "ready" : "needs-model" },
    sessions,
  };
}
