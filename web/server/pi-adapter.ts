import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcClient, type JsonAgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { RuntimeAdapter } from "./runtime-hub";
import type { RuntimeImage } from "../shared/runtime-types";
import type { ExecutionDescriptor } from "../shared/workspace-contract";

export function createPiAdapter(descriptor: ExecutionDescriptor): RuntimeAdapter {
  const { installationRoot, historyRoot: sessionDir, executionRoot, sessionId, sessionFile, workspaceNotice } = descriptor;
  const agentDir = join(installationRoot, ".kiva", "agent");
  const npmCacheDir = join(dirname(sessionDir), "cache", "npm");
  for (const path of [agentDir, sessionDir, npmCacheDir]) mkdirSync(path, { recursive: true });

  const packageEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const cliPath = join(dirname(packageEntry), "bundle", "cli.js");
  const kivaExtension = join(installationRoot, "agent", "extensions", "kiva.ts");
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const client = new RpcClient({
    cliPath,
    cwd: executionRoot,
    args: ["--session-dir", sessionDir, ...(sessionFile ? ["--session", sessionFile] : ["--session-id", sessionId]),
      ...(existsSync(kivaExtension) ? ["--extension", kivaExtension] : []),
      ...(workspaceNotice ? ["--append-system-prompt", workspaceNotice] : [])],
    env: {
      ...env,
      PI_CODING_AGENT_DIR: agentDir,
      PI_CODING_AGENT_SESSION_DIR: sessionDir,
      NPM_CONFIG_CACHE: npmCacheDir,
    },
  });

  return {
    start: async () => {
      if (sessionFile) verifyTranscript(sessionFile);
      await client.start();
      const state = await client.getState();
      if (state.sessionId !== sessionId) { await client.stop(); throw new Error(`Pi session identity mismatch: expected ${sessionId}, received ${state.sessionId}`); }
      if (state.sessionFile && existsSync(state.sessionFile)) verifyTranscript(state.sessionFile);
    },
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

  function verifyTranscript(path: string) {
    const header = JSON.parse(readFileSync(path, "utf8").split("\n", 1)[0]) as { type?: string; id?: string; cwd?: string };
    if (header.type !== "session" || header.id !== sessionId || typeof header.cwd !== "string" || realpathSync(header.cwd) !== realpathSync(executionRoot)
      || (sessionFile && resolve(path) !== resolve(sessionFile))) throw new Error("Pi transcript identity or execution directory does not match the owned workspace");
  }
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
