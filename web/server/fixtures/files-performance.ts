/** Isolated HTTP benchmark; run from web: pnpm exec tsx server/fixtures/files-performance.ts baseline|after [result.json]. */
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
import type { ScopedTransportOptions } from "../scoped-transport";
import { WorkspaceRegistry } from "../workspace-registry";
import { SessionRepository } from "../session-repository";
import { RuntimeManager } from "../runtime-manager";

const baselineCommit = "12d678717905dd6f2e7dce83628b3f755cbf1b1e";
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = dirname(webRoot);
const mode = process.argv[2] ?? "baseline";
if (mode !== "baseline" && mode !== "after") throw new Error("Expected baseline|after");
const resultPath = resolve(process.argv[3] ?? join(tmpdir(), "kiva-files-performance.json"));
const git = (root: string, args: string[]) => childProcess.execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
interface Scenario { name: string; files: number; histories: number; historyBytes: number; registrations: number; root: string; id: string }
interface Counters { gitSync: number; gitAsync: number; transcriptReads: number; transcriptBytes: number }
interface Summary { p50: number; p95: number }
interface Measurement { name: string; timings: Summary; gitSync: number; gitAsync: number; transcriptReads: number; transcriptBytes: number; returnedFiles: number }
interface TreeMeasurement { name: string; input: "baseline-cap" | "complete"; files: number; timings: Summary }
interface Run { mode: string; elapsedMs: number; measurements: Measurement[]; treeBuild?: TreeMeasurement[] }
interface Results { baselineCommit: string; fixtureRoot: string; environment: Record<string, unknown>; scenarios: Scenario[]; baseline?: Run; after?: Run }

function createScenarios(fixtureRoot: string): Scenario[] {
  const configs = [
    { name: "small", files: 100, histories: 0, registrations: 1 },
    { name: "over-1000", files: 1200, histories: 0, registrations: 1 },
    { name: "large", files: 10000, histories: 0, registrations: 1 },
    { name: "histories", files: 100, histories: 20, registrations: 1 },
    { name: "registrations", files: 100, histories: 0, registrations: 8 },
  ];
  return configs.map((config) => {
    const installation = join(fixtureRoot, config.name);
    fs.mkdirSync(installation, { recursive: true });
    fs.writeFileSync(join(installation, ".gitignore"), ".kiva\n");
    // Half wide, half nested: exercise both large sibling counts and multiple levels.
    for (let index = 0; index < config.files; index++) {
      const path = index % 2 ? join(installation, `wide-${index}.ts`) : join(installation, "src", `group-${index % 50}`, "nested", `file-${index}.ts`);
      fs.mkdirSync(dirname(path), { recursive: true });
      fs.writeFileSync(path, `export const value${index} = ${index};\n`);
    }
    git(installation, ["init", "-q", "-b", "fixture-main"]);
    git(installation, ["add", "."]);
    git(installation, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
    fs.writeFileSync(join(installation, "untracked.ts"), "untracked\n");
    let historyBytes = 0;
    if (config.histories) {
      const history = join(installation, ".kiva", "sessions"); fs.mkdirSync(history, { recursive: true });
      for (let index = 0; index < config.histories; index++) {
        const id = `history-${index}`;
        const header = JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-10-22T00:00:00Z", cwd: installation });
        const line = JSON.stringify({ type: "message", message: { role: "user", content: "x".repeat(4000) } });
        const text = `${header}\n${`${line}\n`.repeat(250)}`;
        fs.writeFileSync(join(history, `${id}.jsonl`), text); historyBytes += Buffer.byteLength(text);
      }
    }
    const registry = new WorkspaceRegistry(installation); registry.initialize();
    for (let index = 1; index < config.registrations; index++) {
      const extra = join(fixtureRoot, `${config.name}-registered-${index}`); fs.mkdirSync(extra);
      git(extra, ["init", "-q", "-b", "fixture-main"]);
      git(extra, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"]);
      registry.register(extra);
    }
    return { ...config, root: installation, historyBytes, id: registry.list().find((project) => project.path === installation)!.id };
  });
}

function baselineTransport(snapshotRoot: string) {
  // Import original modules from the fixed pre-change commit. Rewrite only local import
  // locations so the temporary copy can use the repo's pinned dependencies/unchanged services.
  const names = ["bootstrap", "session-catalog", "workspace-registry", "scoped-transport"];
  for (const name of names) {
    const original = childProcess.execFileSync("git", ["show", `${baselineCommit}:web/server/${name}.ts`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    const transformed = original.replace(/from (["'])([^"']+)\1/g, (match, quote: string, specifier: string) => {
      let target: string | undefined;
      if (specifier.startsWith("@/")) target = join(webRoot, specifier.slice(2));
      else if (specifier.startsWith(".")) target = resolve(webRoot, "server", specifier);
      if (!target) return match;
      const base = target.slice(target.lastIndexOf("/") + 1);
      const source = names.includes(base) && target.startsWith(join(webRoot, "server") + "/") ? join(snapshotRoot, base) : target;
      return `from ${quote}${source}.ts${quote}`;
    });
    fs.writeFileSync(join(snapshotRoot, `${name}.ts`), transformed);
  }
  return import(pathToFileURL(join(snapshotRoot, "scoped-transport.ts")).href) as Promise<{ createScopedTransport(options: ScopedTransportOptions): ReturnType<typeof import("../scoped-transport").createScopedTransport> }>;
}

const data: Results = mode === "after"
  ? JSON.parse(fs.readFileSync(resultPath, "utf8")) as Results
  : (() => {
    const fixtureRoot = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "kiva-files-benchmark-")));
    const environment = { node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, filesystem: "local temporary directory (OS cache not cleared)", samples: 30, warmup: 5 };
    return { baselineCommit, fixtureRoot, environment, scenarios: createScenarios(fixtureRoot) };
  })();
const snapshotRoot = join(data.fixtureRoot, "baseline-source"); fs.mkdirSync(snapshotRoot, { recursive: true });
fs.writeFileSync(join(snapshotRoot, "package.json"), JSON.stringify({ type: "module" }));
// Snapshot registry's default singleton must stay in the isolated fixture too.
process.env.KIVA_REPO_ROOT = data.scenarios[0].root;
const { createScopedTransport } = mode === "baseline" ? await baselineTransport(snapshotRoot) : await import("../scoped-transport");

const originals = { spawnSync: childProcess.spawnSync, execFileSync: childProcess.execFileSync, execFile: childProcess.execFile, spawn: childProcess.spawn, readFileSync: fs.readFileSync };
let counters: Counters = { gitSync: 0, gitAsync: 0, transcriptReads: 0, transcriptBytes: 0 };
function isGit(file: unknown) { return String(file).split("/").at(-1) === "git"; }
childProcess.spawnSync = ((file: string, ...args: unknown[]) => { if (isGit(file)) counters.gitSync++; return Reflect.apply(originals.spawnSync, childProcess, [file, ...args]); }) as typeof childProcess.spawnSync;
childProcess.execFileSync = ((file: string, ...args: unknown[]) => { if (isGit(file)) counters.gitSync++; return Reflect.apply(originals.execFileSync, childProcess, [file, ...args]); }) as typeof childProcess.execFileSync;
childProcess.execFile = ((file: string, ...args: unknown[]) => { if (isGit(file)) counters.gitAsync++; return Reflect.apply(originals.execFile, childProcess, [file, ...args]); }) as typeof childProcess.execFile;
childProcess.spawn = ((file: string, ...args: unknown[]) => { if (isGit(file)) counters.gitAsync++; return Reflect.apply(originals.spawn, childProcess, [file, ...args]); }) as typeof childProcess.spawn;
fs.readFileSync = ((path: fs.PathOrFileDescriptor, ...args: unknown[]) => {
  const value = Reflect.apply(originals.readFileSync, fs, [path, ...args]) as Buffer | string;
  if (String(path).endsWith(".jsonl")) { counters.transcriptReads++; counters.transcriptBytes += Buffer.byteLength(value); }
  return value;
}) as typeof fs.readFileSync;
syncBuiltinESMExports();

function summary(values: number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: Number(sorted[Math.ceil(sorted.length * .5) - 1].toFixed(2)), p95: Number(sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2)) };
}
const measurements: Measurement[] = [];
const started = performance.now();
try {
  for (const scenario of data.scenarios) {
    const registry = new WorkspaceRegistry(scenario.root);
    const repository = new SessionRepository(registry, { worktreeRoot: join(data.fixtureRoot, "worktrees") });
    const manager = new RuntimeManager(repository, () => { throw new Error("Benchmark must never acquire Pi"); });
    const transport = createScopedTransport({ registry, repository, manager, allowedOrigins: [] });
    const server = createServer(async (request, response) => { if (!await transport.handle(request, response)) { response.statusCode = 404; response.end(); } });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const api = `/api/projects/${scenario.id}`;
    const read = async (path: string) => {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 200, `Unexpected HTTP status for ${path}`);
      return await response.json() as { project?: { files?: string[] }; bootstrap?: { project: { files: string[] } } };
    };
    const cases = [
      { name: "directory", paths: [`${api}/workspace`] },
      { name: "page-pair", paths: [api, `${api}/workspace`] },
      { name: "concurrent-4", paths: Array<string>(4).fill(`${api}/workspace`) },
      ...(scenario.name === "registrations" ? [{ name: "registry-picker", paths: ["/api/projects"] }] : []),
      ...(scenario.name === "histories" ? [{ name: "sidebar-sessions", paths: [`${api}/sessions`] }] : []),
    ];
    try {
      for (const item of cases) {
        const values: number[] = [], counts: Counters[] = [];
        let returnedFiles = 0;
        for (let index = -5; index < 30; index++) {
          counters = { gitSync: 0, gitAsync: 0, transcriptReads: 0, transcriptBytes: 0 };
          const start = performance.now();
          const results = await Promise.all(item.paths.map(read));
          const elapsed = performance.now() - start;
          returnedFiles = Math.max(...results.map((result) => result.project?.files?.length ?? result.bootstrap?.project.files.length ?? 0));
          if (index >= 0) { values.push(elapsed); counts.push({ ...counters }); }
        }
        const average = (key: keyof Counters) => counts.reduce((total, count) => total + count[key], 0) / counts.length;
        const result: Measurement = { name: `${scenario.name}/${item.name}`, timings: summary(values), gitSync: average("gitSync"), gitAsync: average("gitAsync"), transcriptReads: average("transcriptReads"), transcriptBytes: average("transcriptBytes"), returnedFiles };
        measurements.push(result);
        process.stdout.write(`${mode} ${JSON.stringify(result)}\n`);
      }
    } finally {
      transport.close(); await manager.stop(); server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  }
} finally {
  Object.assign(childProcess, { spawnSync: originals.spawnSync, execFileSync: originals.execFileSync, execFile: originals.execFile, spawn: originals.spawn });
  fs.readFileSync = originals.readFileSync; syncBuiltinESMExports();
}
const treeBuild: TreeMeasurement[] = [];
if (mode === "after") {
  const { buildWorkspaceTree } = await import("../../features/files/workspace-tree");
  for (const scenario of data.scenarios.filter((item) => ["small", "over-1000", "large"].includes(item.name))) {
    const paths = git(scenario.root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean);
    for (const input of ["baseline-cap", "complete"] as const) {
      const entries = (input === "baseline-cap" ? paths.slice(0, 1000) : paths).map((path) => ({ path }));
      const values: number[] = [];
      for (let index = -5; index < 30; index++) {
        const start = performance.now(); buildWorkspaceTree(entries); const elapsed = performance.now() - start;
        if (index >= 0) values.push(elapsed);
      }
      treeBuild.push({ name: scenario.name, input, files: entries.length, timings: summary(values) });
    }
  }
}
data[mode] = { mode, elapsedMs: performance.now() - started, measurements, ...(treeBuild.length ? { treeBuild } : {}) };
fs.writeFileSync(resultPath, `${JSON.stringify(data, null, 2)}\n`);
process.stdout.write(`Results: ${resultPath}\n`);
