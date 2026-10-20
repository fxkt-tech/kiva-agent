import assert from "node:assert/strict";
import test from "node:test";

import { createPluginArgs, createRuntime } from "../src/runtime.mjs";

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
