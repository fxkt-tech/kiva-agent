import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcClient, type JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { RuntimeAdapter } from "./runtime-hub";

export function createPiAdapter(repoRoot: string): RuntimeAdapter {
  const agentDir = join(repoRoot, ".kiva", "agent");
  const sessionDir = join(repoRoot, ".kiva", "sessions");
  const npmCacheDir = join(repoRoot, ".kiva", "cache", "npm");
  for (const path of [agentDir, sessionDir, npmCacheDir]) mkdirSync(path, { recursive: true });

  const packageEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const cliPath = join(dirname(packageEntry), "bundle", "cli.js");
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const client = new RpcClient({
    cliPath,
    cwd: repoRoot,
    env: {
      ...env,
      PI_CODING_AGENT_DIR: agentDir,
      PI_CODING_AGENT_SESSION_DIR: sessionDir,
      NPM_CONFIG_CACHE: npmCacheDir,
    },
  });

  return {
    start: () => client.start(),
    stop: () => client.stop(),
    onEvent: (listener) => client.onEvent((event: JsonAgentSessionEvent) => listener(event)),
    getState: () => client.getState(),
    prompt: (message) => client.prompt(message),
    abort: () => client.abort(),
  };
}
