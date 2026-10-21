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

  it("hides projects durably without deleting their identity, files, history or configuration", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-registry-hidden-")));
    const path = join(root, "project"); mkdirSync(path);
    const registry = new WorkspaceRegistry(root);
    const project = registry.register(path);
    const retained = ["source.ts", ".kiva/sessions/history.jsonl", ".kiva/web/sessions/history.json", ".kiva/agent/settings.json"];
    for (const name of retained) {
      const target = join(path, name); mkdirSync(join(target, ".."), { recursive: true }); writeFileSync(target, `retained ${name}`);
    }
    const visible = registry.remove(project.id);
    assert.equal(visible.some((entry) => entry.id === project.id), false);
    assert.equal(registry.listAll().some((entry) => entry.id === project.id), true);
    assert.equal(registry.resolve(project.id).path, path);
    assert.equal(registry.activeRoot(), root);
    assert.deepEqual(registry.recent(), [root]);
    for (const name of retained) assert.equal(readFileSync(join(path, name), "utf8"), `retained ${name}`);
    const configPath = join(root, ".kiva", "web-workspace.json");
    const stored = readFileSync(configPath, "utf8");
    const restarted = new WorkspaceRegistry(root);
    restarted.initialize();
    assert.deepEqual(restarted.list(), visible);
    assert.deepEqual(restarted.remove(project.id), visible, "removal is idempotent");
    assert.equal(readFileSync(configPath, "utf8"), stored, "passive reads and an idempotent removal do not rewrite the registry");
    assert.equal("hidden" in restarted.resolve(project.id), false, "visibility metadata is not part of the resource projection");
    const alias = join(root, "alias"); symlinkSync(path, alias);
    assert.equal(restarted.register(alias).id, project.id);
    assert.equal(restarted.list().filter((entry) => entry.id === project.id).length, 1);
    for (const name of retained) assert.equal(readFileSync(join(path, name), "utf8"), `retained ${name}`);
  });

  it("can hide the installation and last project without startup resurrecting them", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-registry-empty-")));
    const registry = new WorkspaceRegistry(root);
    const installation = registry.list()[0];
    assert.deepEqual(registry.remove(installation.id), []);
    const restarted = new WorkspaceRegistry(root); restarted.initialize();
    assert.deepEqual(restarted.list(), []);
    assert.deepEqual(restarted.recent(), []);
    assert.equal(restarted.listAll().length, 1);
    assert.equal(restarted.resolve(installation.id).id, installation.id);
    assert.equal(restarted.register(root).id, installation.id);
    assert.equal(restarted.list().length, 1);
  });

  it("removes unavailable directories by registered ID and preserves migrated hidden state", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-registry-remove-missing-")));
    mkdirSync(join(root, ".kiva"));
    const path = join(root, ".kiva", "web-workspace.json");
    const missing = join(root, "missing");
    const legacy = JSON.stringify({ active: missing, recent: [missing, root] });
    writeFileSync(path, legacy);
    const registry = new WorkspaceRegistry(root);
    const project = registry.list().find((entry) => entry.path === missing)!;
    assert.equal(project.capability.state, "unavailable");
    assert.equal(readFileSync(path, "utf8"), legacy);
    assert.equal(registry.remove(project.id).length, 1);
    assert.equal(readFileSync(`${path}.v1.bak`, "utf8"), legacy);
    const restarted = new WorkspaceRegistry(root); restarted.initialize();
    assert.equal(restarted.list().some((entry) => entry.id === project.id), false);
    assert.equal(restarted.resolve(project.id).capability.state, "unavailable");
  });

  it("rejects malformed hidden flags and unknown removal without overwriting registrations", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-registry-invalid-hidden-")));
    const registry = new WorkspaceRegistry(root);
    assert.throws(() => registry.remove("unknown"), /not registered/);
    assert.equal(existsSync(join(root, ".kiva")), false);
    registry.initialize();
    const path = join(root, ".kiva", "web-workspace.json");
    const original = JSON.parse(readFileSync(path, "utf8"));
    for (const hidden of ["true", 1, null, {}, []]) {
      const invalid = JSON.stringify({ ...original, projects: [{ ...original.projects[0], hidden }] });
      writeFileSync(path, invalid);
      assert.throws(() => registry.list(), /Invalid project visibility/);
      assert.throws(() => registry.remove(original.projects[0].id), /Invalid project visibility/);
      assert.equal(readFileSync(path, "utf8"), invalid);
    }
  });
});
