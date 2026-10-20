import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

export function createPluginArgs(command, source) {
  if (command !== "install" && command !== "remove") {
    throw new Error("Plugin command must be install or remove");
  }
  if (!source) {
    throw new Error("Plugin source is required");
  }
  return [command, source, "--local"];
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
