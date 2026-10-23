import { readFile, readdir, readlink, realpath, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Node/tsx options used before the actual script. Unknown positional options fail closed.
const valueOptions = new Set(["-r", "--require", "--import", "--loader", "--experimental-loader", "-C", "--conditions", "--env-file", "--env-file-if-exists", "--title", "--inspect-port", "--redirect-warnings", "--diagnostic-dir", "--openssl-config", "--icu-data-dir", "--max-old-space-size", "--max-semi-space-size", "--stack-trace-limit", "--unhandled-rejections", "--dns-result-order"]);
const booleanOptions = new Set(["--enable-source-maps", "--no-enable-source-maps", "--no-warnings", "--trace-warnings", "--trace-uncaught", "--no-deprecation", "--trace-deprecation", "--pending-deprecation", "--preserve-symlinks", "--preserve-symlinks-main", "--experimental-strip-types", "--no-experimental-strip-types", "--experimental-transform-types", "--inspect", "--inspect-brk", "--inspect-wait", "--expose-gc", "--use-strict"]);
const nonScriptModes = new Set(["-e", "--eval", "-p", "--print", "-c", "--check", "--test", "--run", "--watch"]);
const disappeared = (error) => error?.code === "ENOENT" || error?.code === "ESRCH" || error?.code === "ENOTDIR";

function nodeScript(argv) {
  for (let i = 1; i < argv.length; i++) {
    const argument = argv[i], option = argument.split("=", 1)[0];
    if (argument === "--") return { entry: argv[i + 1] };
    if (nonScriptModes.has(option) || /^-[ep].+/.test(argument)) return {};
    if (!argument.startsWith("-")) return { entry: argument };
    if (valueOptions.has(option)) { if (!argument.includes("=")) i++; continue; }
    if (/^-[rC].+/.test(argument) || booleanOptions.has(argument)) continue;
    // An equals value occupies this argv item; it cannot hide a positional script.
    if (argument.startsWith("--") && argument.includes("=")) continue;
    return { unsupported: true };
  }
  return {};
}

async function processState(pid) {
  try {
    const value = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = value.slice(value.lastIndexOf(")") + 2).trim().split(/\s+/);
    if (fields.length < 20 || !/^\d+$/.test(fields[19])) throw new Error(`无法读取进程 ${pid} 的身份。`);
    return { status: fields[0], started: fields[19] };
  } catch (error) { if (disappeared(error)) return; throw new Error(`无法检查进程 ${pid} 的运行状态。`, { cause: error }); }
}

async function ownedProcess(pid, expectedEntry) {
  let argv;
  try { argv = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0"); if (argv.at(-1) === "") argv.pop(); }
  catch (error) {
    if (disappeared(error)) return;
    // Other users' inaccessible processes cannot be selected. Never hide inability to inspect ours.
    const owner = await stat(`/proc/${pid}`).catch(() => undefined);
    if (owner && typeof process.getuid === "function" && owner.uid !== process.getuid()) return;
    throw new Error(`没有权限检查进程 ${pid}，无法确认 Web 是否已关闭。`, { cause: error });
  }
  if (!argv.length || !/^node(?:js)?$/.test(basename(argv[0]))) return;
  const script = nodeScript(argv);
  if (!script.entry && !script.unsupported || script.entry && basename(script.entry) !== "server.ts") return;
  try {
    const cwd = await realpath(`/proc/${pid}/cwd`);
    if (script.unsupported) {
      // Do not silently report no server if an unrecognized Node invocation may be ours.
      for (const argument of argv.slice(1)) if (basename(argument) === "server.ts" && await realpath(resolve(cwd, argument)).catch(() => undefined) === expectedEntry) throw new Error(`进程 ${pid} 使用无法安全识别的 Node 参数，请手动检查后重试。`);
      return;
    }
    const entry = await realpath(resolve(cwd, script.entry));
    if (entry !== expectedEntry) return;
    const executable = (await readlink(`/proc/${pid}/exe`)).replace(/ \(deleted\)$/, "");
    if (!/^node(?:js)?$/.test(basename(executable))) return;
    const state = await processState(pid);
    if (state && state.status !== "Z" && state.status !== "X") return { pid, started: state.started };
  } catch (error) {
    if (disappeared(error)) return;
    if (error?.message?.includes("无法安全识别的 Node 参数")) throw error;
    throw new Error(`无法确认进程 ${pid} 的 Web 入口与工作目录，请检查访问权限。`, { cause: error });
  }
}

/** Exact Linux identity discovery; never uses ports, shell matching, or process trees. */
export async function discoverWebProcesses(installationRoot) {
  if (process.platform !== "linux") throw new Error("clear-web 目前仅支持可读取 /proc 的 Linux 系统。请在启动 Web 的终端中关闭服务。");
  const root = await realpath(installationRoot);
  const entry = await realpath(join(root, "web", "server", "server.ts"));
  let pids;
  try { pids = await readdir("/proc"); } catch (error) { throw new Error("无法读取 /proc，不能安全识别此安装的 Web 进程。", { cause: error }); }
  const matches = [];
  for (const value of pids) {
    if (!/^[1-9]\d*$/.test(value) || Number(value) === process.pid) continue;
    const match = await ownedProcess(Number(value), entry);
    if (match) matches.push(match);
  }
  return { entry, matches };
}

/** Send only SIGTERM, then bound the graceful wait; identity changes count as the original exiting. */
export async function stopWebProcesses(installationRoot, { timeoutMs = 10_000, pollMs = 50 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(pollMs) || pollMs < 1) throw new Error("Web 退出等待时间必须是正整数。");
  const { entry, matches } = await discoverWebProcesses(installationRoot);
  const deadline = Date.now() + timeoutMs;
  const results = await Promise.allSettled(matches.map(async (match) => {
    const current = await ownedProcess(match.pid, entry);
    if (!current || current.started !== match.started) return;
    try { process.kill(match.pid, "SIGTERM"); }
    catch (error) { if (disappeared(error)) return; throw new Error(`无法向 Web 进程 ${match.pid} 发送 SIGTERM，请检查进程权限。`, { cause: error }); }
    for (;;) {
      const state = await processState(match.pid);
      if (!state || state.started !== match.started || state.status === "Z" || state.status === "X") return match.pid;
      if (Date.now() >= deadline) throw new Error(`等待 Web 进程 ${match.pid} 正常退出超时（${timeoutMs}ms）；未强制终止，请检查运行中的任务后重试。`);
      await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    }
  }));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) throw new Error(failures.map((result) => result.reason.message).join("\n"));
  return results.filter((result) => result.status === "fulfilled" && result.value !== undefined).map((result) => result.value);
}
