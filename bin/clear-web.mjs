#!/usr/bin/env node

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stopWebProcesses } from "../src/web-process.mjs";

const installationRoot = dirname(dirname(fileURLToPath(import.meta.url)));
try {
  if (process.argv.length > 2) throw new Error("用法：pnpm clear-web（关闭当前安装的所有 Web 实例）。");
  const stopped = await stopWebProcesses(installationRoot);
  console.log(stopped.length ? `已关闭当前安装的 Web（${stopped.length} 个实例）。` : "当前安装没有运行中的 Web。");
} catch (error) {
  console.error(`clear-web: ${error.message}`);
  process.exitCode = 1;
}
