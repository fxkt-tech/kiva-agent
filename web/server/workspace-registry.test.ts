import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { WorkspaceRegistry } from "./workspace-registry";

describe("WorkspaceRegistry", () => {
  it("persists and restores a selected project directory", () => {
    const installationRoot = mkdtempSync(join(tmpdir(), "kiva-install-"));
    const projectRoot = join(installationRoot, "projects", "real-project");
    mkdirSync(projectRoot, { recursive: true });
    const registry = new WorkspaceRegistry(installationRoot);

    assert.equal(registry.activeRoot(), installationRoot);
    assert.equal(registry.open(projectRoot), projectRoot);
    assert.equal(new WorkspaceRegistry(installationRoot).activeRoot(), projectRoot);
    assert.deepEqual(registry.recent(), [projectRoot, installationRoot]);
  });

  it("rejects paths that are not existing directories", () => {
    const installationRoot = mkdtempSync(join(tmpdir(), "kiva-install-"));
    const registry = new WorkspaceRegistry(installationRoot);

    assert.throws(() => registry.open(join(installationRoot, "missing")), /does not exist/i);
  });
});
