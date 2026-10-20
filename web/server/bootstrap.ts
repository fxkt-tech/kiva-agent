import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { BootstrapData, SessionSummary } from "@/shared/types";

const repoRoot = resolve(/* turbopackIgnore: true */ process.env.KIVA_REPO_ROOT ?? join(process.cwd(), ".."));

function git(args: string[]) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
}

function listSessionFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listSessionFiles(path) : entry.name.endsWith(".jsonl") ? [path] : [];
  });
}

function readSession(path: string, root: string): SessionSummary {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  let name = "未命名会话";
  let preview = "尚无消息预览";
  let id = basename(path, ".jsonl");
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.type === "session" && typeof entry.id === "string") id = entry.id;
      if (entry.type === "session_info" && typeof entry.name === "string") name = entry.name;
      const message = entry.message as { role?: string; content?: unknown } | undefined;
      if (message?.role === "user" && typeof message.content === "string") {
        preview = message.content.replace(/\s+/g, " ").slice(0, 90);
        if (name === "未命名会话") name = preview.slice(0, 28);
      }
    } catch {
      // A partially-written trailing line should not hide the session.
    }
  }
  return { id, path: relative(root, path), name, preview, updatedAt: statSync(path).mtime.toISOString() };
}

export function getBootstrapData(): BootstrapData {
  const status = git(["status", "--porcelain"]);
  const sessionRoot = join(repoRoot, ".kiva", "sessions");
  const sessions = listSessionFiles(sessionRoot)
    .map((path) => readSession(path, sessionRoot))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 30);
  const modelConfigFound = existsSync(join(repoRoot, ".kiva", "agent", "models.json"));
  return {
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
