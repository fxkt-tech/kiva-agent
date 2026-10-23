import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { discoverWebProcesses, stopWebProcesses } from "../src/web-process.mjs";

const run = promisify(execFile);
const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const stub = `import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
const server = createServer();
process.on("SIGTERM", () => {
  if (process.env.KIVA_TEST_IGNORE_TERM === "yes") { process.send?.("term"); return; }
  writeFileSync(process.env.KIVA_TEST_STOP_MARKER, "graceful");
  server.close(() => process.exit(0));
});
process.on("message", (message) => { if (message === "exit") server.close(() => process.exit(0)); });
server.listen(0, "127.0.0.1", () => process.send?.("ready"));
`;
function installation() {
  const root = mkdtempSync(join(tmpdir(), "kiva web process "));
  mkdirSync(join(root, "web", "server"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(root, "web", "server", "server.ts"), stub);
  writeFileSync(join(root, "unrelated.mjs"), stub);
  writeFileSync(join(root, "preload.cjs"), "// No-op Node preload fixture.\n");
  writeFileSync(join(root, "loader.mjs"), "// No-op Node import fixture.\n");
  return root;
}
async function childProcess(t, root, args = [join(root, "web", "server", "server.ts")], options = {}) {
  const marker = join(root, `stop-${Math.random().toString(16).slice(2)}.txt`);
  const child = spawn(process.execPath, args, { cwd: options.cwd ?? root, env: { ...process.env, KIVA_TEST_STOP_MARKER: marker, ...options.env }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = ""; child.stderr.on("data", (value) => { stderr += value; });
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null && child.connected) child.send("exit");
    await exited;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Fixture failed to start: ${stderr}`)), 5000);
    child.once("message", () => { clearTimeout(timer); resolve(); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error(`Fixture exited before ready: ${stderr}`)); });
  });
  return { child, marker, exited };
}
const linux = { skip: process.platform !== "linux" };

test("gracefully stops every exact installation Web entry, including custom PORT instances, and preserves other installations", linux, async (t) => {
  const root = installation(), otherRoot = installation();
  const first = await childProcess(t, root, undefined, { env: { PORT: "10491" } });
  const second = await childProcess(t, root, undefined, { env: { PORT: "20491", NODE_ENV: "production" } });
  const other = await childProcess(t, otherRoot);
  const unrelated = await childProcess(t, root, [join(root, "unrelated.mjs"), join(root, "web", "server", "server.ts")]);
  const before = await discoverWebProcesses(root);
  assert.deepEqual(before.matches.map((process) => process.pid).sort(), [first.child.pid, second.child.pid].sort());
  const stopped = await stopWebProcesses(root);
  assert.deepEqual(stopped.sort(), [first.child.pid, second.child.pid].sort());
  assert.equal((await first.exited).code, 0); assert.equal((await second.exited).code, 0);
  assert.equal(readFileSync(first.marker, "utf8"), "graceful"); assert.equal(readFileSync(second.marker, "utf8"), "graceful");
  assert.equal(other.child.exitCode, null); assert.equal(unrelated.child.exitCode, null);
  assert.equal(existsSync(other.marker), false); assert.equal(existsSync(unrelated.marker), false);
  assert.deepEqual(await stopWebProcesses(root), [], "already stopped must succeed");
});

test("resolves real cwd/entry and symlinked installations with tsx-style Node flags, empty option values and spaces", linux, async (t) => {
  const root = installation(), link = `${root} alias`; symlinkSync(root, link, "dir");
  const child = await childProcess(t, root, ["--require", "../preload.cjs", "--import", pathToFileURL(join(root, "loader.mjs")).href, "--enable-source-maps", "--conditions", "", "server/server.ts"], { cwd: join(root, "web") });
  assert.deepEqual(await stopWebProcesses(link), [child.child.pid]);
  assert.equal((await child.exited).code, 0); assert.equal(readFileSync(child.marker, "utf8"), "graceful");
});

test("ignores eval commands and Node wrapper entries even when later arguments name this server", linux, async (t) => {
  const root = installation(), entry = join(root, "web", "server", "server.ts");
  const evalChild = await childProcess(t, root, ["--input-type=module", "--eval", stub, entry]);
  const wrapper = await childProcess(t, root, [join(root, "unrelated.mjs"), entry]);
  assert.deepEqual(await stopWebProcesses(root), []);
  assert.equal(evalChild.child.exitCode, null); assert.equal(wrapper.child.exitCode, null);
  assert.equal(existsSync(evalChild.marker), false); assert.equal(existsSync(wrapper.marker), false);
});

test("reports bounded graceful timeout without force-killing a server that ignores SIGTERM", linux, async (t) => {
  const root = installation(); const stubborn = await childProcess(t, root, undefined, { env: { KIVA_TEST_IGNORE_TERM: "yes" } });
  await assert.rejects(stopWebProcesses(root, { timeoutMs: 80, pollMs: 5 }), /正常退出超时.*未强制终止/);
  assert.equal(stubborn.child.exitCode, null); assert.equal(stubborn.child.signalCode, null);
});

test("the root pnpm clear-web command anchors to its own installation and is idempotent", linux, async (t) => {
  const root = installation();
  mkdirSync(join(root, "bin")); mkdirSync(join(root, "src"));
  copyFileSync(join(sourceRoot, "bin", "clear-web.mjs"), join(root, "bin", "clear-web.mjs"));
  copyFileSync(join(sourceRoot, "src", "web-process.mjs"), join(root, "src", "web-process.mjs"));
  const packageJson = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8"));
  writeFileSync(join(root, "package.json"), JSON.stringify(packageJson));
  const child = await childProcess(t, root);
  const first = await run("pnpm", ["clear-web"], { cwd: root, timeout: 5000 });
  assert.match(first.stdout, /已关闭当前安装的 Web（1 个实例）/); assert.equal((await child.exited).code, 0);
  const second = await run(process.execPath, [join(root, "bin", "clear-web.mjs")], { cwd: sourceRoot, timeout: 5000 });
  assert.match(second.stdout, /当前安装没有运行中的 Web/);
  assert.equal(readFileSync(child.marker, "utf8"), "graceful");
});

test("fails explicitly on unsupported process discovery platforms without attempting a fallback", async () => {
  const helper = pathToFileURL(join(sourceRoot, "src", "web-process.mjs")).href;
  const result = await run(process.execPath, ["--input-type=module", "--eval", `Object.defineProperty(process, "platform", { value: "darwin" }); const { stopWebProcesses } = await import(${JSON.stringify(helper)}); try { await stopWebProcesses("/unused"); process.exitCode = 1; } catch (error) { console.log(error.message); }`]);
  assert.match(result.stdout, /仅支持.*Linux/);
});
