/** Isolated paired HTTP/delayed-Git benchmark. Never connects to a user server or Pi. */
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { cpus, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type { ScopedTransportOptions } from "../scoped-transport";
import { WorkspaceRegistry } from "../workspace-registry";
import { SessionRepository } from "../session-repository";
import { RuntimeManager } from "../runtime-manager";

const baselineCommit = "c0ad5c7";
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = dirname(webRoot);
const script = fileURLToPath(import.meta.url);
const git = (root: string, args: string[]) => childProcess.execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe", maxBuffer: 4_000_000 });
interface Scenario { name: string; sourceFiles: number; changedLeaves: number; root: string; id: string }
interface Counters { gitSync: number; gitAsync: number; lsFiles: number; diff: number; status: number }
interface Summary { p50: number; p95: number }
interface Measurement { name: string; timings: Summary; counters: Counters; payloadBytes: number; contentBytes: number; fullFilePaths: number; changedLeaves: number }
interface Responsive { delayMs: number; samples: number; ping: Summary; diff: Summary; pingBeforeDiffCompletion: number }
interface Run { measurements: Measurement[]; responsiveness: Responsive }
interface Results { baselineCommit: string; fixtureRoot: string; environment: Record<string, unknown>; scenarios: Scenario[]; baseline?: Run; after?: Run }

type Transport = ReturnType<typeof import("../scoped-transport").createScopedTransport>;
async function transportFactory(mode: string, snapshotRoot: string): Promise<(options: ScopedTransportOptions) => Transport> {
  if (mode !== "baseline") return (await import("../scoped-transport")).createScopedTransport;
  fs.mkdirSync(snapshotRoot, { recursive: true }); fs.writeFileSync(join(snapshotRoot, "package.json"), '{"type":"module"}');
  // Closed baseline set: workspace-files' sync path/text helpers must not import
  // current async implementations after the backend changes shared helper exports.
  const names = ["scoped-transport", "workspace-reader", "workspace-files", "workspace-registry", "session-catalog"];
  for (const name of names) {
    const source = childProcess.execFileSync("git", ["show", `${baselineCommit}:web/server/${name}.ts`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 8_000_000 });
    const transformed = source.replace(/from (["'])([^"']+)\1/g, (match, quote: string, specifier: string) => {
      let target: string | undefined;
      if (specifier.startsWith("@/")) target = join(webRoot, specifier.slice(2));
      else if (specifier.startsWith(".")) target = resolve(webRoot, "server", specifier);
      if (!target) return match;
      const base = target.slice(target.lastIndexOf("/") + 1);
      const location = names.includes(base) && target.startsWith(join(webRoot, "server") + "/") ? join(snapshotRoot, base) : target;
      return `from ${quote}${location}.ts${quote}`;
    });
    fs.writeFileSync(join(snapshotRoot, `${name}.ts`), transformed);
  }
  return (await import(pathToFileURL(join(snapshotRoot, "scoped-transport.ts")).href)).createScopedTransport;
}

async function serve(mode: string, snapshotRoot: string, root: string) {
  process.env.KIVA_REPO_ROOT = root;
  const factory = await transportFactory(mode, snapshotRoot);
  const registry = new WorkspaceRegistry(root), project = registry.list().find((item) => item.path === root)!;
  const repository = new SessionRepository(registry, { worktreeRoot: join(dirname(root), "worktrees") });
  const manager = new RuntimeManager(repository, () => { throw new Error("Benchmark cannot acquire Pi"); });
  const transport = factory({ registry, repository, manager, allowedOrigins: [] });
  const server = createServer(async (request, response) => {
    if (request.url === "/__ping") { response.end("pong"); return; }
    if (!await transport.handle(request, response)) { response.statusCode = 404; response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`, api = `/api/projects/${project.id}`;
  return { origin, api, close: async () => { transport.close(); await manager.stop(); server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); } };
}

if (process.argv[2] === "serve-delay") {
  const server = await serve(process.argv[3], process.argv[4], process.argv[5]);
  process.stdout.write(`${JSON.stringify({ origin: server.origin, api: server.api })}\n`);
  const stop = async () => { await server.close(); process.exit(0); };
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });
} else {
  const mode = process.argv[2] ?? "baseline";
  if (mode !== "baseline" && mode !== "after") throw new Error("Expected baseline|after");
  const outputPath = resolve(process.argv[3] ?? join(tmpdir(), "kiva-changes-performance.json"));
  const createScenarios = (fixtureRoot: string): Scenario[] => [
    { name: "large-few", sourceFiles: 10000, changedLeaves: 4 },
    { name: "many-changes", sourceFiles: 2000, changedLeaves: 2000 },
    { name: "clean", sourceFiles: 10000, changedLeaves: 0 },
  ].map((config) => {
    const root = join(fixtureRoot, config.name); fs.mkdirSync(root);
    fs.writeFileSync(join(root, ".gitignore"), ".kiva\n");
    for (let index = 0; index < config.sourceFiles; index++) {
      const path = join(root, "src", `group-${index % 50}`, `file-${index}.txt`); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, `original ${index}\n`);
    }
    if (config.name === "large-few") {
      fs.writeFileSync(join(root, "near-bound.txt"), `${"old-line-".repeat(90)}\n`.repeat(1000));
      fs.writeFileSync(join(root, "other.txt"), "old other\n");
    }
    git(root, ["init", "-q", "-b", "fixture-main"]); git(root, ["add", "."]);
    git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
    if (config.name === "large-few") {
      fs.writeFileSync(join(root, "src", "group-0", "file-0.txt"), "changed small\n");
      fs.writeFileSync(join(root, "other.txt"), "changed other\n");
      fs.writeFileSync(join(root, "near-bound.txt"), `${"new-line-".repeat(90)}\n`.repeat(1000));
      fs.writeFileSync(join(root, "untracked-multiline.txt"), "untracked line\n".repeat(30000));
    } else if (config.name === "many-changes") {
      for (let index = 0; index < config.sourceFiles; index++) fs.appendFileSync(join(root, "src", `group-${index % 50}`, `file-${index}.txt`), "changed\n");
    }
    const registry = new WorkspaceRegistry(root); registry.initialize();
    return { ...config, root, id: registry.list()[0].id };
  });
  const data: Results = mode === "after" ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : (() => {
    const fixtureRoot = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "kiva-changes-benchmark-")));
    return { baselineCommit, fixtureRoot, environment: { node: process.version, git: childProcess.execFileSync("git", ["--version"], { encoding: "utf8" }).trim(), os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, samples: 30, warmup: 5, filesystem: "local temporary filesystem; OS cache not cleared" }, scenarios: createScenarios(fixtureRoot) };
  })();
  const snapshotRoot = join(data.fixtureRoot, "baseline-source");
  const originals = { spawnSync: childProcess.spawnSync, execFileSync: childProcess.execFileSync, execFile: childProcess.execFile, spawn: childProcess.spawn };
  let counters: Counters = { gitSync: 0, gitAsync: 0, lsFiles: 0, diff: 0, status: 0 };
  const count = (file: unknown, args: unknown, async: boolean) => {
    if (String(file).split("/").at(-1) !== "git") return;
    counters[async ? "gitAsync" : "gitSync"]++;
    const values = Array.isArray(args) ? args : [];
    if (values.includes("ls-files")) counters.lsFiles++;
    if (values.includes("diff")) counters.diff++;
    if (values.includes("status")) counters.status++;
  };
  const summary = (values: number[]): Summary => {
    const sorted = [...values].sort((a, b) => a - b);
    return { p50: Number(sorted[Math.ceil(sorted.length * .5) - 1].toFixed(2)), p95: Number(sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2)) };
  };
  const measurements: Measurement[] = [];
  // Load baseline before wrapping builtins so source-export Git reads are not counted.
  await transportFactory(mode, snapshotRoot);
  childProcess.spawnSync = ((file: string, ...args: unknown[]) => { count(file, args[0], false); return Reflect.apply(originals.spawnSync, childProcess, [file, ...args]); }) as typeof childProcess.spawnSync;
  childProcess.execFileSync = ((file: string, ...args: unknown[]) => { count(file, args[0], false); return Reflect.apply(originals.execFileSync, childProcess, [file, ...args]); }) as typeof childProcess.execFileSync;
  childProcess.execFile = ((file: string, ...args: unknown[]) => { count(file, args[0], true); return Reflect.apply(originals.execFile, childProcess, [file, ...args]); }) as typeof childProcess.execFile;
  childProcess.spawn = ((file: string, ...args: unknown[]) => { count(file, args[0], true); return Reflect.apply(originals.spawn, childProcess, [file, ...args]); }) as typeof childProcess.spawn;
  syncBuiltinESMExports();
  try {
    for (const scenario of data.scenarios) {
      const server = await serve(mode, snapshotRoot, scenario.root);
      const diff = (path: string) => `${server.api}/changes?path=${encodeURIComponent(path)}`;
      const cases = [
        { name: "list", paths: [`${server.api}/workspace${mode === "after" ? "?view=changes" : ""}`] },
        ...(scenario.name === "large-few" ? [
          { name: "tracked-small", paths: [diff("src/group-0/file-0.txt")] },
          { name: "tracked-near-bound", paths: [diff("near-bound.txt")] },
          { name: "untracked-multiline", paths: [diff("untracked-multiline.txt")] },
          { name: "concurrent-same-4", paths: Array<string>(4).fill(diff("src/group-0/file-0.txt")) },
          { name: "concurrent-different-2", paths: [diff("src/group-0/file-0.txt"), diff("other.txt")] },
        ] : []),
        ...(scenario.name === "clean" ? [{ name: "clean-path", paths: [diff("src/group-0/file-0.txt")] }] : []),
      ];
      try {
        for (const item of cases) {
          const durations: number[] = [], counts: Counters[] = []; let payloadBytes = 0, contentBytes = 0, fullFilePaths = 0, changedLeaves = 0;
          for (let index = -5; index < 30; index++) {
            counters = { gitSync: 0, gitAsync: 0, lsFiles: 0, diff: 0, status: 0 };
            const start = performance.now();
            const results = await Promise.all(item.paths.map(async (path) => {
              const response = await fetch(`${server.origin}${path}`); const text = await response.text();
              assert.equal(response.status, 200, `${path}: ${text.slice(0, 200)}`);
              return { bytes: Buffer.byteLength(text), value: JSON.parse(text) as { content?: string; project?: { files?: string[]; changes?: unknown[] } } };
            }));
            const elapsed = performance.now() - start;
            if (index >= 0) { durations.push(elapsed); counts.push({ ...counters }); }
            payloadBytes = results.reduce((total, item) => total + item.bytes, 0); contentBytes = results.reduce((total, item) => total + Buffer.byteLength(item.value.content ?? ""), 0);
            fullFilePaths = results.reduce((total, item) => total + (item.value.project?.files?.length ?? 0), 0); changedLeaves = results.reduce((total, item) => total + (item.value.project?.changes?.length ?? 0), 0);
          }
          const average = (key: keyof Counters) => counts.reduce((total, count) => total + count[key], 0) / counts.length;
          const result: Measurement = { name: `${scenario.name}/${item.name}`, timings: summary(durations), counters: { gitSync: average("gitSync"), gitAsync: average("gitAsync"), lsFiles: average("lsFiles"), diff: average("diff"), status: average("status") }, payloadBytes, contentBytes, fullFilePaths, changedLeaves };
          measurements.push(result); process.stdout.write(`${mode} ${JSON.stringify(result)}\n`);
        }
      } finally { await server.close(); }
    }
  } finally { Object.assign(childProcess, originals); syncBuiltinESMExports(); }

  // Client and server must be separate processes: a sync baseline Git wait must
  // not prevent the benchmark client itself from scheduling its independent ping.
  const marker = join(data.fixtureRoot, "diff-started");
  const shimRoot = join(data.fixtureRoot, "git-delay-bin"); fs.mkdirSync(shimRoot, { recursive: true });
  const realGit = originals.execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(join(shimRoot, "git"), `#!/bin/sh\ncase " $* " in *" diff "*) : > "$KIVA_BENCH_DIFF_STARTED"; sleep 0.3;; esac\nexec ${quote(realGit)} "$@"\n`, { mode: 0o755 });
  const child = childProcess.spawn(process.execPath, ["--import", "tsx", script, "serve-delay", mode, snapshotRoot, data.scenarios[0].root], { cwd: webRoot, env: { ...process.env, PATH: `${shimRoot}:${process.env.PATH}`, KIVA_BENCH_DIFF_STARTED: marker }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    const info = await new Promise<{ origin: string; api: string }>((resolveInfo, reject) => {
      let output = "";
      child.stdout!.on("data", (chunk: Buffer) => { output += chunk.toString(); const line = output.split("\n")[0]; if (line) { try { resolveInfo(JSON.parse(line)); } catch { /* Wait for the complete line. */ } } });
      child.once("exit", (code) => reject(new Error(`Delay server exited ${code}: ${stderr}`)));
    });
    const pingValues: number[] = [], diffValues: number[] = []; let pingBeforeDiffCompletion = 0;
    for (let index = -5; index < 30; index++) {
      fs.rmSync(marker, { force: true }); let diffDone = false;
      const start = performance.now();
      const diffRequest = fetch(`${info.origin}${info.api}/changes?path=src%2Fgroup-0%2Ffile-0.txt`).then(async (response) => { assert.equal(response.status, 200); await response.text(); diffDone = true; return performance.now() - start; });
      const markerDeadline = performance.now() + 5000;
      while (!fs.existsSync(marker)) { assert.ok(performance.now() < markerDeadline, "Delayed diff marker not observed"); await delay(1); }
      const pingStart = performance.now(); const ping = await fetch(`${info.origin}/__ping`); assert.equal(await ping.text(), "pong"); const pingMs = performance.now() - pingStart;
      const beforeCompletion = !diffDone; const diffMs = await diffRequest;
      if (index >= 0) { pingValues.push(pingMs); diffValues.push(diffMs); if (beforeCompletion) pingBeforeDiffCompletion++; }
    }
    const responsiveness: Responsive = { delayMs: 300, samples: 30, ping: summary(pingValues), diff: summary(diffValues), pingBeforeDiffCompletion };
    data[mode] = { measurements, responsiveness };
    fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);
    process.stdout.write(`${mode} responsiveness ${JSON.stringify(responsiveness)}\nResults: ${outputPath}\n`);
  } finally { child.kill("SIGTERM"); await once(child, "exit"); }
}
