#!/usr/bin/env node

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createPluginArgs, runPi } from "../src/runtime.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const [action, source, ...extra] = process.argv.slice(2);
const command = action === "add" ? "install" : action;

if (extra.length > 0) {
  console.error("kiva-plugin: expected exactly one plugin source");
  process.exitCode = 1;
} else {
  try {
    process.exitCode = runPi(createPluginArgs(command, source), { repoRoot });
  } catch (error) {
    console.error(`kiva-plugin: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
