import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createAgentArgs, createPluginArgs, createRuntime, runPi } from "../src/runtime.mjs";

test("Kiva keeps Pi state and sessions inside the repository", () => {
  const runtime = createRuntime("/work/kiva-agent", { PATH: "/usr/bin" });

  assert.equal(runtime.cwd, "/work/kiva-agent");
  assert.equal(runtime.env.PI_CODING_AGENT_DIR, "/work/kiva-agent/.kiva/agent");
  assert.equal(runtime.env.PI_CODING_AGENT_SESSION_DIR, "/work/kiva-agent/.kiva/sessions");
  assert.equal(runtime.env.NPM_CONFIG_CACHE, "/work/kiva-agent/.kiva/cache/npm");
  assert.equal(runtime.env.PATH, "/usr/bin");
});

test("plugin commands always target project-local Pi settings", () => {
  assert.deepEqual(createPluginArgs("install", "npm:example@1.2.3"), [
    "install",
    "npm:example@1.2.3",
    "--local",
  ]);
  assert.deepEqual(createPluginArgs("remove", "npm:example"), ["remove", "npm:example", "--local"]);
  assert.throws(() => createPluginArgs("update", "npm:example"), /install or remove/);
  assert.throws(() => createPluginArgs("install", ""), /source is required/);
});

test("plugin installs require a reproducible source", () => {
  assert.doesNotThrow(() => createPluginArgs("install", "npm:example@1.2.3"));
  assert.doesNotThrow(() => createPluginArgs("install", "npm:@scope/example@1.2.3-beta.1"));
  assert.doesNotThrow(() => createPluginArgs("install", "git:github.com/example/plugin@v1"));
  assert.doesNotThrow(() => createPluginArgs("install", "../local-plugin"));
  assert.throws(() => createPluginArgs("install", "npm:example"), /exact version/);
  assert.throws(() => createPluginArgs("install", "git:github.com/example/plugin"), /tag or commit/);
});

test("the general Kiva command cannot bypass project-local plugin management", () => {
  assert.deepEqual(createAgentArgs(["--help"]), ["--help"]);
  assert.throws(() => createAgentArgs(["install", "npm:example@1.2.3"]), /plugin:add/);
  assert.throws(() => createAgentArgs(["remove", "npm:example"]), /plugin:remove/);
  assert.throws(() => createAgentArgs(["uninstall", "npm:example"]), /plugin:remove/);
});

test("runPi launches the repository-local Pi executable with the isolated runtime", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "kiva-runtime-"));
  const packageRoot = join(repoRoot, "node_modules", "@earendil-works", "pi-coding-agent");
  const outputPath = join(repoRoot, "child-runtime.json");
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "@earendil-works/pi-coding-agent", bin: { pi: "cli.mjs" } }),
  );
  writeFileSync(
    join(packageRoot, "cli.mjs"),
    `import { writeFileSync } from "node:fs";
writeFileSync(process.env.KIVA_TEST_OUTPUT, JSON.stringify({ cwd: process.cwd(), agentDir: process.env.PI_CODING_AGENT_DIR, sessionDir: process.env.PI_CODING_AGENT_SESSION_DIR, npmCache: process.env.NPM_CONFIG_CACHE, args: process.argv.slice(2) }));
`,
  );

  const status = runPi(["--version"], {
    repoRoot,
    baseEnv: { ...process.env, KIVA_TEST_OUTPUT: outputPath },
    stdio: "pipe",
  });
  const child = JSON.parse(readFileSync(outputPath, "utf8"));

  assert.equal(status, 0);
  assert.equal(child.cwd, realpathSync(repoRoot));
  assert.equal(child.agentDir, join(repoRoot, ".kiva", "agent"));
  assert.equal(child.sessionDir, join(repoRoot, ".kiva", "sessions"));
  assert.equal(child.npmCache, join(repoRoot, ".kiva", "cache", "npm"));
  assert.deepEqual(child.args, ["--version"]);
});
