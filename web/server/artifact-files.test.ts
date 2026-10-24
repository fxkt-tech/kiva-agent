import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectArtifactFile, readArtifactFile } from "./artifact-files";
import { readProjectFile } from "./workspace-files";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await realpath(await mkdtemp(join(tmpdir(), "kiva-exact-artifact-"))); roots.push(root); return root; }

it("reads a trusted exact canonical file or legitimate alias without changing ordinary workspace containment", async () => {
  const root = await fixture(), project = join(root, "project"), external = join(root, "external.html");
  await mkdir(project); await writeFile(external, "<h1>outside</h1>"); await symlink(external, join(project, "alias.html"));
  const inspection = await inspectArtifactFile(join(project, "alias.html"));
  assert.equal(inspection.locator.canonicalPath, external);
  assert.match((await readArtifactFile(inspection.locator, 1000)).content.toString(), /outside/);
  await assert.rejects(readProjectFile(project, "../external.html"), /escapes|invalid/);
  await assert.rejects(readProjectFile(project, "alias.html"), /escapes|invalid/);
});

it("pins target identity and rejects symlink substitution and ordinary-file replacement until a fresh preview", async () => {
  const root = await fixture(), original = join(root, "original.html"), replacement = join(root, "replacement.html"), alias = join(root, "alias.html");
  await writeFile(original, "original"); await writeFile(replacement, "replacement"); await symlink(original, alias);
  const file = await inspectArtifactFile(alias);
  await rm(alias); await symlink(replacement, alias);
  await assert.rejects(readArtifactFile(file.locator, 1000), /已变化/);
  const exact = await inspectArtifactFile(original);
  await rename(original, join(root, "old.html")); await writeFile(original, "new inode");
  await assert.rejects(readArtifactFile(exact.locator, 1000), /已变化/);
  assert.equal((await readArtifactFile((await inspectArtifactFile(original)).locator, 1000)).content.toString(), "new inode");
});

it("bounds ordinary reads, rejects FIFO, and protects credential targets even through misleading aliases", async () => {
  const root = await fixture(), file = join(root, "large.html"); await writeFile(file, "0123456789");
  await assert.rejects(readArtifactFile((await inspectArtifactFile(file)).locator, 3), /超过/);
  const fifo = join(root, "fifo.html"); execFileSync("mkfifo", [fifo]);
  await assert.rejects(inspectArtifactFile(fifo), /普通文件/);
  await mkdir(join(root, ".kiva/agent"), { recursive: true }); await writeFile(join(root, ".kiva/agent/auth.json"), '{"secret":"hidden"}');
  await symlink(join(root, ".kiva/agent/auth.json"), join(root, "pretend.svg"));
  await assert.rejects(inspectArtifactFile(join(root, "pretend.svg")), /凭据/);
  await writeFile(join(root, ".kiva/agent/generated.html"), "<p>ordinary explicitly linked page</p>");
  assert.equal((await inspectArtifactFile(join(root, ".kiva/agent/generated.html"))).size > 0, true, "directory membership alone does not block explicit HTML");
});
