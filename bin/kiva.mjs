#!/usr/bin/env node

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runPi } from "../src/runtime.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  process.exitCode = runPi(process.argv.slice(2), { repoRoot });
} catch (error) {
  console.error(`kiva: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
