import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcClient, type JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { RuntimeAdapter } from "./runtime-hub";
import type { RuntimeImage } from "../shared/runtime-types";

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
    prompt: (message, images) => client.prompt(message, piImages(images)),
    abort: () => client.abort(),
    switchSession: (path) => client.switchSession(path),
    newSession: () => client.newSession(),
    setSessionName: (name) => client.setSessionName(name),
    getMessages: () => client.getMessages(),
    getAvailableModels: () => client.getAvailableModels(),
    getAvailableThinkingLevels: () => client.getAvailableThinkingLevels(),
    getSessionStats: () => client.getSessionStats(),
    getCommands: () => client.getCommands().then((commands) => commands.map(({ name, description, source }) => ({ name, description, source }))),
    setModel: (provider, modelId) => client.setModel(provider, modelId),
    setThinkingLevel: (level) => client.setThinkingLevel(level as Parameters<typeof client.setThinkingLevel>[0]),
    steer: (message, images) => client.steer(message, piImages(images)),
    followUp: (message, images) => client.followUp(message, piImages(images)),
    respondToUI: (response) => writeUIResponse(client, response),
    clearQueue: () => client.clearQueue().then((queue) => ({ steering: [...queue.steering], followUp: [...queue.followUp] })),
    compact: () => client.compact(),
  };
}

function piImages(images?: RuntimeImage[]) {
  return images?.map(({ data, mimeType }) => ({ type: "image" as const, data, mimeType }));
}

async function writeUIResponse(client: RpcClient, response: { id: string; value?: string; confirmed?: boolean; cancelled?: true }) {
  const process = (client as unknown as { process?: { stdin?: NodeJS.WritableStream } }).process;
  const stdin = process?.stdin;
  if (!stdin?.writable) throw new Error("Agent process stdin is not writable");
  await new Promise<void>((resolve, reject) => {
    stdin.write(`${JSON.stringify({ type: "extension_ui_response", ...response })}\n`, (error?: Error | null) => error ? reject(error) : resolve());
  });
}
