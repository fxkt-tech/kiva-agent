/** Isolated sidebar HTTP benchmark; baseline|after result.json. No Pi/user-server access. */
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
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
import { RuntimeManager } from "../runtime-manager";

const baselineCommit = "86fc5ce0aeffa30376fde1122805422c37d0c0b7";
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = dirname(webRoot), script = fileURLToPath(import.meta.url);
const git = (root: string, args: string[]) => childProcess.execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
interface Scenario { name: string; root: string; id: string; histories: number; historyBytes: number; active: number; archived: number; trash: number; metadata: number }
interface Counters { gitSync: number; gitAsync: number; historyReads: number; historyBytes: number; metadataReads: number; projectionCalls: number }
interface Summary { p50: number; p95: number }
interface Measurement { name: string; firstUncachedMs: number; timings: Summary; counters: Counters; payloadBytes: number; returnedRows: number; currentProjectFirstReady?: Summary }
interface Responsive { delayMs: number; samples: number; ping: Summary; list: Summary; pingBeforeListCompletion: number }
interface Run { measurements: Measurement[]; responsiveness: Responsive; completedReadFreshness: boolean }
interface Results { baselineCommit: string; fixtureRoot: string; environment: Record<string, unknown>; scenarios: Scenario[]; baseline?: Run; after?: Run }
type Transport = ReturnType<typeof import("../scoped-transport").createScopedTransport>;
let counters: Counters = { gitSync: 0, gitAsync: 0, historyReads: 0, historyBytes: 0, metadataReads: 0, projectionCalls: 0 };
const handlePaths = new WeakMap<FileHandle, string>();
const reset = () => { counters = { gitSync: 0, gitAsync: 0, historyReads: 0, historyBytes: 0, metadataReads: 0, projectionCalls: 0 }; };
Reflect.set(globalThis, "__kivaSidebarProjection", () => { counters.projectionCalls++; });
const summary = (values: number[]): Summary => { const sorted = [...values].sort((a, b) => a - b); return { p50: Number(sorted[Math.ceil(sorted.length * .5) - 1].toFixed(2)), p95: Number(sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2)) }; };

async function bundle(mode: string, sourceRoot: string) {
  fs.mkdirSync(sourceRoot, { recursive: true }); fs.writeFileSync(join(sourceRoot, "package.json"), '{"type":"module"}');
  const names = ["scoped-transport", "session-repository", "session-catalog", "workspace-registry", "session-jsonl"];
  for (const name of names) {
    let source = mode === "baseline" ? childProcess.execFileSync("git", ["show", `${baselineCommit}:web/server/${name}.ts`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 8_000_000 }) : fs.readFileSync(join(webRoot, "server", `${name}.ts`), "utf8");
    if (name === "session-repository") source = source.replace("function projectTranscript(path: string) {", 'function projectTranscript(path: string) { Reflect.get(globalThis, "__kivaSidebarProjection")?.();');
    source = source.replace(/from (["'])([^"']+)\1/g, (match, quote: string, specifier: string) => {
      let target: string | undefined;
      if (specifier.startsWith("@/")) target = join(webRoot, specifier.slice(2));
      else if (specifier.startsWith(".")) target = resolve(webRoot, "server", specifier);
      if (!target) return specifier.startsWith("node:") ? match : `from ${quote}${import.meta.resolve(specifier)}${quote}`;
      const base = target.slice(target.lastIndexOf("/") + 1);
      const location = names.includes(base) && target.startsWith(join(webRoot, "server") + "/") ? join(sourceRoot, base) : target;
      return `from ${quote}${location}.ts${quote}`;
    });
    fs.writeFileSync(join(sourceRoot, `${name}.ts`), source);
  }
  const transport = await import(pathToFileURL(join(sourceRoot, "scoped-transport.ts")).href) as { createScopedTransport(options: ScopedTransportOptions): Transport };
  const repository = await import(pathToFileURL(join(sourceRoot, "session-repository.ts")).href) as { SessionRepository: typeof import("../session-repository").SessionRepository };
  return { ...transport, ...repository };
}

async function serve(mode: string, sourceRoot: string, root: string, marker?: string) {
  process.env.KIVA_REPO_ROOT = root;
  const loaded = await bundle(mode, sourceRoot), registry = new WorkspaceRegistry(root);
  let sessionLists;
  if (mode === "after") {
    const { SessionListReader } = await import("../session-list-reader");
    sessionLists = new SessionListReader({ readChunk: async (handle: FileHandle, buffer: Buffer, length: number, position: number) => {
      const path = handlePaths.get(handle);
      if (!marker) assert.ok(path, "Async open instrumentation must identify each descriptor");
      if (position === 0 && path?.endsWith(".jsonl")) counters.historyReads++;
      if (position === 0 && path?.endsWith(".json")) counters.metadataReads++;
      if (marker && !fs.existsSync(marker)) { fs.writeFileSync(marker, "started"); await delay(300); }
      const result = await handle.read(buffer, 0, length, position); if (path?.endsWith(".jsonl")) counters.historyBytes += result.bytesRead; return result.bytesRead;
    } });
  }
  const repository = new loaded.SessionRepository(registry, { worktreeRoot: join(dirname(root), "worktrees"), ...(sessionLists ? { sessionLists } : {}) });
  const manager = new RuntimeManager(repository, () => { throw new Error("Benchmark cannot acquire Pi"); });
  const transport = loaded.createScopedTransport({ registry, repository, manager, allowedOrigins: [] });
  const server = createServer(async (request, response) => {
    if (request.url === "/__ping") { response.end("pong"); return; }
    if (!await transport.handle(request, response)) { response.statusCode = 404; response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
  return { origin: `http://127.0.0.1:${address.port}`, close: async () => { transport.close(); await manager.stop(); server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); } };
}

if (process.argv[2] === "serve-delay") {
  const mode = process.argv[3], marker = process.argv[6];
  if (mode === "baseline") {
    const original = fs.readFileSync;
    fs.readFileSync = ((path: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (String(path).endsWith(".jsonl") && !fs.existsSync(marker)) { fs.writeFileSync(marker, "started"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); }
      return Reflect.apply(original, fs, [path, ...args]);
    }) as typeof fs.readFileSync; syncBuiltinESMExports();
  }
  const server = await serve(mode, process.argv[4], process.argv[5], marker);
  process.stdout.write(`${JSON.stringify({ origin: server.origin })}\n`);
  const stop = async () => { await server.close(); process.exit(0); }; process.once("SIGTERM", () => { void stop(); }); process.once("SIGINT", () => { void stop(); });
} else {
  const mode = process.argv[2] ?? "baseline"; if (mode !== "baseline" && mode !== "after") throw new Error("Expected baseline|after");
  const outputPath = resolve(process.argv[3] ?? join(tmpdir(), "kiva-sidebar-performance.json"));
  const createScenarios = (fixtureRoot: string): Scenario[] => {
    const configs = [
      { name: "20-histories", active: 20, archived: 0, trash: 0, records: 250, textBytes: 4000, metadata: 0 },
      { name: "many-small", active: 200, archived: 0, trash: 0, records: 10, textBytes: 100, metadata: 0 },
      { name: "one-large", active: 1, archived: 0, trash: 0, records: 5000, textBytes: 4000, metadata: 0 },
      { name: "giant-record", active: 1, archived: 0, trash: 0, records: 1, textBytes: 20_000_000, metadata: 0 },
      { name: "collections", active: 5, archived: 10, trash: 5, records: 250, textBytes: 4000, metadata: 0 },
      { name: "metadata-only", active: 0, archived: 0, trash: 0, records: 0, textBytes: 0, metadata: 100 },
      { name: "multi-a", active: 5, archived: 0, trash: 0, records: 10, textBytes: 100, metadata: 0 },
      { name: "multi-b", active: 5, archived: 0, trash: 0, records: 10, textBytes: 100, metadata: 0 },
      { name: "multi-c", active: 5, archived: 0, trash: 0, records: 10, textBytes: 100, metadata: 0 },
    ];
    return configs.map((config) => {
      const root = join(fixtureRoot, config.name); fs.mkdirSync(root); fs.writeFileSync(join(root, ".gitignore"), ".kiva\n");
      git(root, ["init", "-q", "-b", "fixture-main"]); git(root, ["add", "."]); git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
      const registry = new WorkspaceRegistry(root); registry.initialize(); const id = registry.list()[0].id;
      let historyBytes = 0, count = 0;
      for (const collection of ["active", "archived", "trash"] as const) {
        const directory = collection === "active" ? join(root, ".kiva", "sessions") : join(root, ".kiva", "sessions", collection === "archived" ? ".archive" : ".trash");
        if (config[collection]) fs.mkdirSync(directory, { recursive: true });
        for (let index = 0; index < config[collection]; index++) {
          const header = JSON.stringify({ type: "session", version: 3, id: `history-${count}`, timestamp: "2026-10-23T00:00:00Z", cwd: root });
          const lines = Array.from({ length: config.records }, (_, entry) => JSON.stringify({ type: "message", id: `entry-${entry}`, parentId: entry ? `entry-${entry - 1}` : null, timestamp: "2026-10-23T00:00:00Z", message: { role: "user", content: [{ type: "text", text: "x".repeat(config.textBytes) }], timestamp: 1_792_713_600_000 } }));
          const text = `${header}\n${lines.join("\n")}\n`;
          fs.writeFileSync(join(directory, `history-${count++}.jsonl`), text); historyBytes += Buffer.byteLength(text);
        }
      }
      if (config.metadata) {
        const directory = join(root, ".kiva", "web", "sessions"); fs.mkdirSync(directory, { recursive: true });
        for (let index = 0; index < config.metadata; index++) {
          const record = { version: 1, id: `empty-${index}`, projectId: id, name: `Empty ${index}`, preview: "尚无消息预览", path: "", collection: "active", createdAt: "2026-10-23T00:00:00Z", updatedAt: "2026-10-23T00:00:00Z", persisted: false, legacy: true, executable: false, controls: {} };
          fs.writeFileSync(join(directory, `${record.id}.json`), JSON.stringify(record));
        }
      }
      return { name: config.name, root, id, histories: count, historyBytes, active: config.active, archived: config.archived, trash: config.trash, metadata: config.metadata };
    });
  };
  const data: Results = mode === "after" ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : (() => {
    const fixtureRoot = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "kiva-sidebar-benchmark-")));
    return { baselineCommit, fixtureRoot, environment: { node: process.version, git: childProcess.execFileSync("git", ["--version"], { encoding: "utf8" }).trim(), os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, samples: 30, warmup: 5, filesystem: "local temporary filesystem; OS cache not cleared" }, scenarios: createScenarios(fixtureRoot) };
  })();
  const sourceRoot = join(data.fixtureRoot, `${mode}-source`); process.env.KIVA_REPO_ROOT = data.scenarios[0].root;
  await bundle(mode, sourceRoot);
  const originals = { spawnSync: childProcess.spawnSync, execFileSync: childProcess.execFileSync, execFile: childProcess.execFile, readFileSync: fs.readFileSync, readFile: fsPromises.readFile, open: fsPromises.open };
  const countGit = (file: unknown, async: boolean) => { if (String(file).split("/").at(-1) === "git") counters[async ? "gitAsync" : "gitSync"]++; };
  childProcess.spawnSync = ((file: string, ...args: unknown[]) => { countGit(file, false); return Reflect.apply(originals.spawnSync, childProcess, [file, ...args]); }) as typeof childProcess.spawnSync;
  childProcess.execFileSync = ((file: string, ...args: unknown[]) => { countGit(file, false); return Reflect.apply(originals.execFileSync, childProcess, [file, ...args]); }) as typeof childProcess.execFileSync;
  childProcess.execFile = ((file: string, ...args: unknown[]) => { countGit(file, true); return Reflect.apply(originals.execFile, childProcess, [file, ...args]); }) as typeof childProcess.execFile;
  fs.readFileSync = ((path: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    const value = Reflect.apply(originals.readFileSync, fs, [path, ...args]) as string | Buffer;
    if (String(path).endsWith(".jsonl")) { counters.historyReads++; counters.historyBytes += Buffer.byteLength(value); }
    if (String(path).includes("/web/sessions/") && String(path).endsWith(".json")) counters.metadataReads++;
    return value;
  }) as typeof fs.readFileSync;
  fsPromises.readFile = (async (path: unknown, ...args: unknown[]) => {
    const value = await Reflect.apply(originals.readFile, fsPromises, [path, ...args]);
    if (String(path).includes("/web/sessions/") && String(path).endsWith(".json")) counters.metadataReads++;
    return value;
  }) as typeof fsPromises.readFile;
  fsPromises.open = (async (path: unknown, ...args: unknown[]) => {
    const handle = await Reflect.apply(originals.open, fsPromises, [path, ...args]) as FileHandle;
    handlePaths.set(handle, String(path)); return handle;
  }) as typeof fsPromises.open;
  syncBuiltinESMExports();
  const measurements: Measurement[] = []; let completedReadFreshness = false;
  try {
    for (const scenario of data.scenarios.filter((item) => !item.name.startsWith("multi-"))) {
      const server = await serve(mode, sourceRoot, scenario.root);
      const api = (id: string, collection = "active") => `/api/projects/${id}/sessions${mode === "after" ? `?collection=${collection}` : ""}`;
      const cases = [{ name: "active", paths: [api(scenario.id)] }, ...(scenario.name === "20-histories" ? [{ name: "same-project-three-collections", paths: ["active", "archived", "trash"].map((collection) => api(scenario.id, collection)) }] : [])];
      const read = async (path: string) => {
        const response = await fetch(`${server.origin}${path}`); const text = await response.text(); assert.equal(response.status, 200, text.slice(0, 300));
        return { bytes: Buffer.byteLength(text), value: JSON.parse(text) as { sessions?: Array<{ id: string; preview: string }>; active?: Array<{ id: string; preview: string }>; archived?: unknown[]; trash?: unknown[] } };
      };
      try {
        for (const item of cases) {
          const durations: number[] = [], counts: Counters[] = []; let firstUncachedMs = 0, payloadBytes = 0, returnedRows = 0;
          for (let index = -6; index < 30; index++) {
            reset(); const start = performance.now(); const results = await Promise.all(item.paths.map(read)); const elapsed = performance.now() - start;
            if (index === -6) { firstUncachedMs = elapsed; process.stdout.write(`${mode} first-scan ${scenario.name}/${item.name} ${elapsed.toFixed(2)}ms\n`); }
            if (index >= 0) { durations.push(elapsed); counts.push({ ...counters }); }
            payloadBytes = results.reduce((total, item) => total + item.bytes, 0); returnedRows = results.reduce((total, item) => total + (item.value.sessions?.length ?? (item.value.active?.length ?? 0) + (item.value.archived?.length ?? 0) + (item.value.trash?.length ?? 0)), 0);
          }
          const average = (key: keyof Counters) => counts.reduce((total, count) => total + count[key], 0) / counts.length;
          const result: Measurement = { name: `${scenario.name}/${item.name}`, firstUncachedMs: Number(firstUncachedMs.toFixed(2)), timings: summary(durations), counters: { gitSync: average("gitSync"), gitAsync: average("gitAsync"), historyReads: average("historyReads"), historyBytes: average("historyBytes"), metadataReads: average("metadataReads"), projectionCalls: average("projectionCalls") }, payloadBytes, returnedRows };
          measurements.push(result); process.stdout.write(`${mode} ${JSON.stringify(result)}\n`);
        }
        if (scenario.name === "20-histories") {
          const path = join(scenario.root, ".kiva", "sessions", "history-0.jsonl"), original = fs.readFileSync(path), stat = fs.statSync(path);
          try {
            fs.appendFileSync(path, `${JSON.stringify({ type: "message", id: "freshness-entry", parentId: "entry-249", timestamp: "2026-10-23T00:00:00Z", message: { role: "user", content: [{ type: "text", text: "freshness-probe" }], timestamp: 1_792_713_600_000 } })}\n`);
            const result = await read(api(scenario.id)), rows = result.value.sessions ?? result.value.active ?? [];
            completedReadFreshness = rows.some((row) => row.id === "history-0" && row.preview === "freshness-probe"); assert.ok(completedReadFreshness);
          } finally { fs.writeFileSync(path, original); fs.utimesSync(path, stat.atime, stat.mtime); }
        }
      } finally { await server.close(); }
    }
    // Independent projects on one transport: measure all-batch latency and the
    // selected project's response separately; client priority scheduling is browser-tested.
    const multi = data.scenarios.filter((item) => item.name.startsWith("multi-")), installation = multi[0].root;
    const registry = new WorkspaceRegistry(installation); for (const scenario of multi.slice(1)) registry.register(scenario.root);
    const server = await serve(mode, sourceRoot, installation);
    try {
      const values: number[] = [], currentValues: number[] = [], counts: Counters[] = []; let firstUncachedMs = 0, payloadBytes = 0;
      for (let index = -6; index < 30; index++) {
        reset(); const start = performance.now(); let ready = 0;
        const sizes = await Promise.all(multi.map(async (scenario, position) => { const response = await fetch(`${server.origin}/api/projects/${scenario.id}/sessions${mode === "after" ? "?collection=active" : ""}`); const text = await response.text(); assert.equal(response.status, 200, text.slice(0, 200)); if (position === 0) ready = performance.now() - start; return Buffer.byteLength(text); }));
        const elapsed = performance.now() - start; if (index === -6) firstUncachedMs = elapsed;
        if (index >= 0) { values.push(elapsed); currentValues.push(ready); counts.push({ ...counters }); } payloadBytes = sizes.reduce((a, b) => a + b, 0);
      }
      const avg = (key: keyof Counters) => counts.reduce((total, count) => total + count[key], 0) / counts.length;
      const result: Measurement = { name: "multi-project/three-active", firstUncachedMs: Number(firstUncachedMs.toFixed(2)), timings: summary(values), currentProjectFirstReady: summary(currentValues), counters: { gitSync: avg("gitSync"), gitAsync: avg("gitAsync"), historyReads: avg("historyReads"), historyBytes: avg("historyBytes"), metadataReads: avg("metadataReads"), projectionCalls: avg("projectionCalls") }, payloadBytes, returnedRows: 15 };
      measurements.push(result); process.stdout.write(`${mode} ${JSON.stringify(result)}\n`);
    } finally { await server.close(); }
  } finally { Object.assign(childProcess, { spawnSync: originals.spawnSync, execFileSync: originals.execFileSync, execFile: originals.execFile }); fs.readFileSync = originals.readFileSync; fsPromises.readFile = originals.readFile; fsPromises.open = originals.open; syncBuiltinESMExports(); }

  const marker = join(data.fixtureRoot, "read-started");
  const child = childProcess.spawn(process.execPath, ["--import", "tsx", script, "serve-delay", mode, join(data.fixtureRoot, `${mode}-delay-source`), data.scenarios[0].root, marker], { cwd: webRoot, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    const info = await new Promise<{ origin: string }>((resolveInfo, reject) => {
      let text = ""; child.stdout!.on("data", (chunk: Buffer) => { text += chunk.toString(); const line = text.split("\n")[0]; if (line) { try { resolveInfo(JSON.parse(line)); } catch { /* Wait for full JSON line. */ } } }); child.once("exit", (code) => reject(new Error(`Delay server exited ${code}: ${stderr}`)));
    });
    const pingValues: number[] = [], listValues: number[] = []; let pingBeforeListCompletion = 0;
    for (let index = -5; index < 30; index++) {
      fs.rmSync(marker, { force: true }); let listDone = false; const start = performance.now();
      const listing = fetch(`${info.origin}/api/projects/${data.scenarios[0].id}/sessions${mode === "after" ? "?collection=active" : ""}`).then(async (response) => { assert.equal(response.status, 200); await response.text(); listDone = true; return performance.now() - start; });
      const deadline = performance.now() + 10_000; while (!fs.existsSync(marker)) { assert.ok(performance.now() < deadline, "Final list read path did not hit delay marker"); await delay(1); }
      const pingStart = performance.now(); const response = await fetch(`${info.origin}/__ping`); assert.equal(await response.text(), "pong"); const pingMs = performance.now() - pingStart;
      const before = !listDone, listMs = await listing;
      if (index >= 0) { pingValues.push(pingMs); listValues.push(listMs); if (before) pingBeforeListCompletion++; }
    }
    const responsiveness: Responsive = { delayMs: 300, samples: 30, ping: summary(pingValues), list: summary(listValues), pingBeforeListCompletion };
    data[mode] = { measurements, responsiveness, completedReadFreshness }; fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);
    process.stdout.write(`${mode} responsiveness ${JSON.stringify(responsiveness)}\nResults: ${outputPath}\n`);
  } finally { child.kill("SIGTERM"); await once(child, "exit"); }
}
