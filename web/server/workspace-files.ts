import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
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
  const result = spawnSync("git", ["--literal-pathspecs", "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--", relativePath], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: MAX_FILE_BYTES,
  });
  if (result.error) throw result.error;
  if (result.stdout) return { path: relativePath, content: result.stdout };

  const status = spawnSync("git", ["--literal-pathspecs", "status", "--porcelain", "--", relativePath], {
    cwd: projectRoot, encoding: "utf8", maxBuffer: MAX_FILE_BYTES,
  });
  if (status.error) throw status.error;
  if (status.status !== 0) throw new Error("Git changes require a readable Git repository. Prepare Git before browsing changes.");
  if (status.stdout.startsWith("??")) {
    const file = readProjectFile(projectRoot, relativePath);
    const lines = file.content.split("\n").map((line) => `+${line}`).join("\n");
    return { path: relativePath, content: `diff --git a/${relativePath} b/${relativePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${relativePath}\n${lines}` };
  }
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Unable to read Git diff");
  return { path: relativePath, content: "该文件没有可显示的文本差异。" };
}

function projectPath(projectRoot: string, relativePath: string) {
  validateRelativePath(relativePath);
  const root = realpathSync(projectRoot);
  const candidate = resolve(root, relativePath);
  assertContained(root, candidate);
  // Check each existing ancestor, including symlinks. A deleted diff target can
  // be absent, but an existing ancestor must never leave this workspace.
  let ancestor = root;
  for (const part of relative(root, candidate).split(sep)) {
    ancestor = join(ancestor, part);
    try { lstatSync(ancestor); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") break;
      throw error;
    }
    assertContained(root, realpathSync(ancestor));
  }
  return candidate;
}

function assertContained(root: string, path: string) {
  const within = relative(root, path);
  if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new Error("Project path escapes the active project");
  }
}

function validateRelativePath(path: string) {
  let decoded = path;
  // The transport decodes the query once. Reject nested encodings that would
  // acquire a different filesystem meaning at another boundary as well.
  for (let depth = 0; depth < 5; depth++) {
    if (!decoded || decoded.includes("\0") || decoded.includes("\\") || isAbsolute(decoded) || win32.isAbsolute(decoded)
      || decoded.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error("Project path escapes the active project or is invalid");
    }
    if (!/%[0-9a-f]{2}/i.test(decoded)) return;
    let next: string;
    try { next = decodeURIComponent(decoded); }
    catch { throw new Error("Invalid project path encoding"); }
    if (next === decoded) return;
    decoded = next;
  }
  throw new Error("Invalid nested project path encoding");
}
