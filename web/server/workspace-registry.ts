import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface WorkspaceConfig {
  active: string;
  recent: string[];
}

export class WorkspaceRegistry {
  private readonly installationRoot: string;
  private readonly configPath: string;

  constructor(installationRoot: string) {
    this.installationRoot = canonicalDirectory(installationRoot);
    this.configPath = join(this.installationRoot, ".kiva", "web-workspace.json");
  }

  activeRoot() {
    const configured = this.read().active;
    try { return canonicalDirectory(configured); }
    catch { return this.installationRoot; }
  }

  recent() {
    const values = [this.activeRoot(), ...this.read().recent, this.installationRoot];
    return [...new Set(values.flatMap((path) => {
      try { return [canonicalDirectory(path)]; }
      catch { return []; }
    }))].slice(0, 12);
  }

  open(path: string) {
    const active = canonicalDirectory(path);
    this.write({ active, recent: [active, ...this.recent().filter((item) => item !== active)].slice(0, 12) });
    return active;
  }

  private read(): WorkspaceConfig {
    if (!existsSync(this.configPath)) return { active: this.installationRoot, recent: [this.installationRoot] };
    try {
      const value = JSON.parse(readFileSync(this.configPath, "utf8")) as Partial<WorkspaceConfig>;
      return {
        active: typeof value.active === "string" ? value.active : this.installationRoot,
        recent: Array.isArray(value.recent) ? value.recent.filter((item): item is string => typeof item === "string") : [],
      };
    } catch {
      return { active: this.installationRoot, recent: [this.installationRoot] };
    }
  }

  private write(value: WorkspaceConfig) {
    mkdirSync(dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryPath, this.configPath);
  }
}

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const installationRoot = resolve(/* turbopackIgnore: true */ process.env.KIVA_REPO_ROOT ?? resolve(webRoot, ".."));
export const workspaceRegistry = new WorkspaceRegistry(installationRoot);

function canonicalDirectory(path: string) {
  if (!path.trim()) throw new Error("Project path is required");
  const candidate = resolve(path);
  if (!existsSync(candidate)) throw new Error(`Project directory does not exist: ${candidate}`);
  const canonical = realpathSync(candidate);
  if (!statSync(canonical).isDirectory()) throw new Error(`Project path is not a directory: ${canonical}`);
  return canonical;
}
