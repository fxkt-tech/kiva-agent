import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

export function createRuntime(repoRoot, baseEnv = process.env) {
  const stateRoot = join(repoRoot, ".kiva");
  const directories = [
    join(stateRoot, "agent"),
    join(stateRoot, "sessions"),
    join(stateRoot, "cache", "npm"),
  ];

  return {
    cwd: repoRoot,
    directories,
    env: {
      ...baseEnv,
      PI_CODING_AGENT_DIR: directories[0],
      PI_CODING_AGENT_SESSION_DIR: directories[1],
      NPM_CONFIG_CACHE: directories[2],
    },
  };
}

export function createPluginArgs(command, source, { repoRoot = process.cwd() } = {}) {
  if (command !== "install" && command !== "remove") {
    throw new Error("Plugin command must be install or remove");
  }
  if (!source) {
    throw new Error("Plugin source is required");
  }
  if (command === "install") {
    assertReproduciblePluginSource(source, repoRoot);
  }
  return [command, source, "--local"];
}

export function createAgentArgs(args) {
  const packageCommands = new Set(["install", "remove", "uninstall"]);
  if (packageCommands.has(args[0])) {
    const script = args[0] === "install" ? "plugin:add" : "plugin:remove";
    throw new Error(`Use 'npm run ${script} -- <source>' so package changes stay project-local`);
  }
  return args;
}

function assertReproduciblePluginSource(source, repoRoot) {
  if (source.startsWith("./") || source.startsWith("../") || isAbsolute(source)) {
    const canonicalRoot = realpathSync(repoRoot);
    const candidate = resolve(repoRoot, source);
    const canonicalCandidate = existsSync(candidate) ? realpathSync(candidate) : candidate;
    const pathFromRoot = relative(canonicalRoot, canonicalCandidate);
    if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
      throw new Error("Local plugin sources must stay inside the repository");
    }
    return;
  }

  if (source.startsWith("npm:")) {
    const exactNpmVersion = /^npm:(?:@[^/]+\/)?[^@/]+@v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    if (!exactNpmVersion.test(source)) {
      throw new Error("npm plugin sources must include an exact version, for example npm:example@1.2.3");
    }
    return;
  }

  const gitSource = source.startsWith("git:") || /^(?:https?|ssh|git):\/\//.test(source);
  if (gitSource) {
    const normalized = source.startsWith("git:") ? source.slice(4) : source;
    const lastSeparator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf(":"));
    const refSeparator = normalized.lastIndexOf("@");
    const ref = refSeparator > lastSeparator ? normalized.slice(refSeparator + 1) : "";
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(ref)) {
      throw new Error("git plugin sources must include a full commit SHA");
    }
    return;
  }

  throw new Error("Plugin source must be a pinned npm package, pinned git source, or local path");
}

export function runPi(args, { repoRoot, baseEnv = process.env, stdio = "inherit" }) {
  const runtime = createRuntime(repoRoot, baseEnv);
  for (const directory of runtime.directories) {
    mkdirSync(directory, { recursive: true });
  }

  const packageRoot = join(repoRoot, "node_modules", "@earendil-works", "pi-coding-agent");
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const binPath = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.pi;
  if (!binPath) {
    throw new Error("The installed Pi package does not expose a 'pi' executable");
  }

  const result = spawnSync(process.execPath, [join(packageRoot, binPath), ...args], {
    cwd: runtime.cwd,
    env: runtime.env,
    stdio,
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}
