import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeResourceId, WorkspaceError, type GitCapability, type ProjectResource } from "../shared/workspace-contract";

interface ProjectRegistration { id: string; path: string }
interface WorkspaceConfig { version: 2; active: string; projects: ProjectRegistration[] }

export class WorkspaceRegistry {
  readonly installationRoot: string;
  private readonly configPath: string;

  constructor(installationRoot: string) {
    this.installationRoot = canonicalDirectory(installationRoot);
    this.configPath = join(this.installationRoot, ".kiva", "web-workspace.json");
  }

  /** Explicit controlled startup/registration migration; passive methods never write. */
  initialize() {
    const value = this.read();
    if (existsSync(this.configPath)) {
      const raw = JSON.parse(readFileSync(this.configPath, "utf8")) as { version?: number };
      if (raw.version === 2) return;
      const backup = `${this.configPath}.v1.bak`;
      if (!existsSync(backup)) copyFileSync(this.configPath, backup, constants.COPYFILE_EXCL);
    }
    this.write(value);
  }

  list(): ProjectResource[] { return this.read().projects.map((entry) => this.project(entry)); }

  resolve(id: string): ProjectResource {
    decodeResourceId(id);
    const entry = this.read().projects.find((project) => project.id === id);
    if (!entry) throw new WorkspaceError("project_not_found", "Project is not registered", 404, { projectId: id });
    return this.project(entry);
  }

  register(path: string): ProjectResource {
    const canonical = canonicalDirectory(path);
    this.initialize();
    const value = this.read();
    let entry = value.projects.find((project) => project.path === canonical);
    if (!entry) { entry = { id: projectId(canonical), path: canonical }; value.projects.push(entry); }
    value.active = entry.id;
    value.projects = [entry, ...value.projects.filter((project) => project.id !== entry.id)];
    this.write(value);
    return this.project(entry);
  }

  activeRoot() {
    const value = this.read();
    const entry = value.projects.find((project) => project.id === value.active);
    try { return canonicalDirectory(entry?.path ?? this.installationRoot); }
    catch { return this.installationRoot; }
  }
  recent() { return this.list().filter((project) => project.capability.state !== "unavailable").map((project) => project.path); }
  open(path: string) { return this.register(path).path; }

  private project(entry: ProjectRegistration): ProjectResource {
    try {
      if (canonicalDirectory(entry.path) !== entry.path) return { ...entry, name: basename(entry.path), capability: { state: "unavailable", message: "Registered directory was moved or substituted; repair registration explicitly." } };
    } catch { /* Capability inspection reports missing/permission errors below. */ }
    return { ...entry, name: basename(entry.path), capability: inspectGitCapability(entry.path) };
  }

  private read(): WorkspaceConfig {
    if (!existsSync(this.configPath)) return this.migrate({ active: this.installationRoot, recent: [this.installationRoot] });
    try {
      const value: unknown = JSON.parse(readFileSync(this.configPath, "utf8"));
      if (!value || typeof value !== "object") throw new Error("Expected an object");
      const config = value as Record<string, unknown>;
      if (config.version === 2) {
        if (!Array.isArray(config.projects) || typeof config.active !== "string") throw new Error("Invalid registry fields");
        const projects = config.projects.map((entry: unknown) => {
          if (!entry || typeof entry !== "object") throw new Error("Invalid project record");
          const project = entry as Record<string, unknown>;
          if (typeof project.path !== "string" || !project.path || resolve(project.path) !== project.path) throw new Error("Invalid registered path");
          return { id: decodeResourceId(project.id), path: project.path };
        });
        if (new Set(projects.map((project) => project.id)).size !== projects.length || new Set(projects.map((project) => project.path)).size !== projects.length) throw new Error("Duplicate project registration");
        return { version: 2, active: config.active, projects };
      }
      if (config.version !== undefined || typeof config.active !== "string" || !Array.isArray(config.recent) || !config.recent.every((entry) => typeof entry === "string")) throw new Error("Invalid legacy registry");
      return this.migrate({ active: config.active, recent: config.recent as string[] });
    } catch (error) {
      throw new WorkspaceError("registry_corrupt", `Project registry cannot be read; restore or repair ${this.configPath}: ${error instanceof Error ? error.message : error}`, 409);
    }
  }

  private migrate(value: { active: string; recent: string[] }): WorkspaceConfig {
    const canonical = (path: string) => { try { return canonicalDirectory(path); } catch { return resolve(path); } };
    const paths = [...new Set([value.active, ...value.recent, this.installationRoot].map(canonical))];
    return { version: 2, active: projectId(canonical(value.active)), projects: paths.map((path) => ({ id: projectId(path), path })) };
  }

  private write(value: WorkspaceConfig) {
    mkdirSync(dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temporaryPath, this.configPath);
  }
}

export function inspectGitCapability(path: string): GitCapability {
  let root: string;
  try { root = canonicalDirectory(path); } catch (error) { return { state: "unavailable", message: error instanceof Error ? error.message : String(error) }; }
  try { execFileSync("git", ["--version"], { stdio: "pipe" }); }
  catch { return { state: "missing-git", message: "Install Git before creating an isolated session." }; }
  let repositoryRoot: string;
  try { repositoryRoot = canonicalDirectory(git(root, ["rev-parse", "--show-toplevel"])); }
  catch { return { state: "non-git", message: "Prepare this directory as a Git repository with an initial commit before creating a session." }; }
  let head: string;
  try { head = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]); }
  catch { return { state: "no-commit", message: "Create the first Git commit before creating an isolated session." }; }
  try {
    const commonDirectory = realpathSync(git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
    let branch = "(detached)";
    try { branch = git(root, ["symbolic-ref", "--short", "HEAD"]); } catch { /* A committed detached source is supported. */ }
    return { state: "ready", repositoryRoot, commonDirectory, projectSubdirectory: relative(repositoryRoot, root), head, branch };
  } catch { return { state: "unavailable", message: "Git repository metadata is unavailable; check permissions and repository state." }; }
}

export function git(root: string, args: string[]) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }).trim(); }
function projectId(path: string) { return `p_${createHash("sha256").update(path).digest("hex").slice(0, 24)}`; }
export function canonicalDirectory(path: string) {
  if (!path.trim() || path.includes("\0")) throw new Error("Project path is required");
  const candidate = resolve(path);
  if (!existsSync(candidate)) throw new Error(`Project directory does not exist: ${candidate}`);
  const canonical = realpathSync(candidate);
  if (!statSync(canonical).isDirectory()) throw new Error(`Project path is not a directory: ${canonical}`);
  return canonical;
}

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const installationRoot = resolve(/* turbopackIgnore: true */ process.env.KIVA_REPO_ROOT ?? resolve(webRoot, ".."));
export const workspaceRegistry = new WorkspaceRegistry(installationRoot);
