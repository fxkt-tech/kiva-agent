#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const webEntry = require.resolve("@agegr/pi-web/bin/pi-web.js");

const result = spawnSync(process.execPath, [webEntry, ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PI_CODING_AGENT_DIR: join(repoRoot, ".kiva", "agent"),
    PI_CODING_AGENT_SESSION_DIR: join(repoRoot, ".kiva", "sessions"),
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
