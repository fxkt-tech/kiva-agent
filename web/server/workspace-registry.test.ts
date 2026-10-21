import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { WorkspaceRegistry } from "./workspace-registry";

describe("WorkspaceRegistry", () => {
  it("persists and restores a selected project directory", () => {
    const installationRoot = realpathSync(mkdtempSync(join(tmpdir(), "kiva-install-")));
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

  it("migrates legacy paths once with a backup, canonical aliases and missing roots", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-registry-migration-")));
    const project = join(root, "project");
    const alias = join(root, "alias");
    mkdirSync(project);
    symlinkSync(project, alias);
    mkdirSync(join(root, ".kiva"));
    const original = JSON.stringify({ active: alias, recent: [project, join(root, "missing")] });
    const path = join(root, ".kiva", "web-workspace.json");
    writeFileSync(path, original);
    const registry = new WorkspaceRegistry(root);
    const before = registry.list();
    assert.equal(before.filter((entry) => entry.path === project).length, 1);
    assert.equal(before.find((entry) => entry.path.endsWith("missing"))?.capability.state, "unavailable");
    assert.equal(readFileSync(path, "utf8"), original, "passive reads do not migrate");
    registry.initialize();
    assert.equal(readFileSync(`${path}.v1.bak`, "utf8"), original);
    assert.deepEqual(new WorkspaceRegistry(root).list().map(({ id }) => id), before.map(({ id }) => id));
    const persisted = readFileSync(path, "utf8");
    registry.initialize();
    assert.equal(readFileSync(path, "utf8"), persisted);
    assert.equal(registry.register(alias).id, before[0].id);
  });

  it("does not overwrite malformed configuration or register an unknown ID", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-registry-corrupt-")));
    mkdirSync(join(root, ".kiva"));
    const path = join(root, ".kiva", "web-workspace.json");
    writeFileSync(path, "{broken");
    const registry = new WorkspaceRegistry(root);
    assert.throws(() => registry.initialize(), /cannot be read/);
    assert.equal(readFileSync(path, "utf8"), "{broken");
    assert.equal(existsSync(`${path}.v1.bak`), false);
    const empty = realpathSync(mkdtempSync(join(tmpdir(), "kiva-registry-unknown-")));
    assert.throws(() => new WorkspaceRegistry(empty).resolve("unknown"), /not registered/);
    assert.equal(existsSync(join(empty, ".kiva")), false);
  });

  it("preserves registered identity but marks a substituted directory unavailable", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-registry-substitution-")));
    const project = join(root, "project"); mkdirSync(project);
    const registry = new WorkspaceRegistry(root);
    const registered = registry.register(project);
    const moved = join(root, "moved"); renameSync(project, moved); symlinkSync(moved, project);
    const resource = registry.resolve(registered.id);
    assert.equal(resource.id, registered.id); assert.equal(resource.path, project);
    assert.equal(resource.capability.state, "unavailable");
  });
});
