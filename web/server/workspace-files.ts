import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const MAX_FILE_BYTES = 2_000_000;

export function readProjectFile(projectRoot: string, relativePath: string) {
  const path = projectPath(projectRoot, relativePath);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error("Project path is not a file");
  if (stat.size > MAX_FILE_BYTES) throw new Error("File is larger than 2 MB");
  const content = readFileSync(path);
  if (content.includes(0)) throw new Error("Binary files cannot be previewed as text");
  return { path: relativePath, content: content.toString("utf8"), size: stat.size };
}

export function readProjectDiff(projectRoot: string, relativePath: string) {
  projectPath(projectRoot, relativePath);
  const result = spawnSync("git", ["diff", "--no-ext-diff", "HEAD", "--", relativePath], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: MAX_FILE_BYTES,
  });
  if (result.error) throw result.error;
  if (result.stdout) return { path: relativePath, content: result.stdout };

  const status = spawnSync("git", ["status", "--porcelain", "--", relativePath], { cwd: projectRoot, encoding: "utf8" }).stdout;
  if (status.startsWith("??")) {
    const file = readProjectFile(projectRoot, relativePath);
    const lines = file.content.split("\n").map((line) => `+${line}`).join("\n");
    return { path: relativePath, content: `diff --git a/${relativePath} b/${relativePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${relativePath}\n${lines}` };
  }
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Unable to read Git diff");
  return { path: relativePath, content: "该文件没有可显示的文本差异。" };
}

function projectPath(projectRoot: string, relativePath: string) {
  if (!relativePath || relativePath.includes("\0")) throw new Error("Invalid project path");
  const root = realpathSync(projectRoot);
  const candidate = resolve(root, relativePath);
  if (!candidate.startsWith(`${root}${sep}`)) throw new Error("Project path escapes the active project");
  return candidate;
}
