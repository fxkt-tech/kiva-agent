import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { it, type TestContext } from "node:test";
import { SessionListReader, type SessionListChunkReader } from "./session-list-reader";
import { SessionCatalog } from "./session-catalog";
import { SessionRepository } from "./session-repository";
import { WorkspaceRegistry } from "./workspace-registry";
import { WorkspaceError, type ProjectResource, type SessionCollection } from "../shared/workspace-contract";

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-session-summaries-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project: ProjectResource = { id: "project", name: "Fixture", path: root, capability: { state: "non-git", message: "Fixture" } };
  const history = (name: string, lines: unknown[], collection: SessionCollection = "active", newline = true) => {
    const directory = join(root, ".kiva", "sessions", ...(collection === "active" ? [] : [collection === "archived" ? ".archive" : ".trash"]));
    const path = join(directory, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, lines.map((line) => typeof line === "string" ? line : JSON.stringify(line)).join("\n") + (newline ? "\n" : ""));
    return path;
  };
  const record = (id: string, extra: Record<string, unknown> = {}) => {
    const directory = join(root, ".kiva", "web", "sessions"); mkdirSync(directory, { recursive: true });
    const value = { version: 1, id, projectId: project.id, name: id, preview: "Empty metadata preview", path: "", collection: "active", createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", legacy: false, executable: false, persisted: false, ...extra };
    const path = join(directory, `${id}.json`); writeFileSync(path, JSON.stringify(value)); return path;
  };
  return { root, project, history, record };
}
const user = (content: unknown) => ({ type: "message", message: { role: "user", content } });
const header = (id: string) => ({ type: "session", id });
function deferred() { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; }
const hasCode = (code: string) => (error: unknown) => error instanceof WorkspaceError && error.code === code;

it("matches legacy full-record identity/name/preview semantics including late IDs and final complete records", async (t) => {
  const f = fixture(t);
  f.history("nested/filename.jsonl", [header("first-id"), user("  first\n prompt  "), "{malformed", user([{ type: "image", data: "ignore" }, { type: "text", text: "latest " }, { type: "text", text: "  prompt" }]), { type: "session_info", name: "Late name" }, header("last-id")], "active", false);
  f.history("partial.jsonl", [header("partial"), user("whole prompt"), '{"type":"session","id":"unfinished'], "active", false);
  f.history("fallback.jsonl", [user("Derived default name")], "active", false);
  f.history("archive.jsonl", [header("archived"), user("archived preview")], "archived");
  f.history("active/deleted.jsonl", [header("deleted"), user("deleted preview")], "trash");
  const summaries = await new SessionListReader().read(f.project);
  const old = new SessionCatalog(f.root).all();
  for (const expected of old) {
    const actual = summaries.find((entry) => entry.id === expected.id)!;
    for (const key of ["id", "name", "preview", "path", "updatedAt", "collection"] as const) assert.equal(actual[key], expected[key], key);
    assert.equal(actual.legacy, true);
    assert.equal(actual.persisted, true);
    assert.equal("controls" in actual, false);
    assert.equal("executable" in actual, false);
  }
  assert.equal(summaries.find((entry) => entry.id === "last-id")?.name, "Late name");
  assert.equal(summaries.find((entry) => entry.id === "last-id")?.preview, "latest prompt");
  assert.ok(summaries.some((entry) => entry.id === "partial"));
  assert.equal(summaries.find((entry) => entry.id === "fallback")?.name, "Derived default name");
});

it("preserves stable timestamp ties and uses already-validated current-branch metadata without Git reads", async (t) => {
  const f = fixture(t);
  const older = f.history("a-older.jsonl", [header("older")]), newer = f.history("z-newer.jsonl", [header("newer")]);
  utimesSync(older, new Date("2026-01-01"), new Date("2026-01-01"));
  utimesSync(newer, new Date("2026-02-01"), new Date("2026-02-01"));
  f.record("older", { updatedAt: "2099-01-01T00:00:00Z" });
  f.record("newer", { updatedAt: "2099-01-01T00:00:00Z", workspace: { projectId: f.project.id, sessionId: "newer", mode: "current-branch", state: "ready", executionRoot: f.root, treeRoot: f.root, repositoryRoot: f.root, commonDirectory: join(f.root, ".git"), branch: "creation-branch" } });
  const project: ProjectResource = { ...f.project, capability: { state: "ready", repositoryRoot: f.root, commonDirectory: join(f.root, ".git"), projectSubdirectory: "", head: "fixture", branch: "current-branch" } };
  const rows = await new SessionListReader().read(project);
  assert.deepEqual(rows.map((session) => session.id), ["newer", "older"]);
  assert.equal(rows[0].workspace?.branch, "current-branch");
});

it("merges name overrides, timestamps, empty metadata and retry state without per-row workspace inspection", async (t) => {
  const f = fixture(t);
  f.history("legacy.jsonl", [header("owned"), user("latest user")]);
  f.record("owned", { nameOverride: "Saved name", updatedAt: "2099-01-01T00:00:00Z", workspace: { projectId: f.project.id, sessionId: "owned", mode: "current-branch", state: "ready", treeRoot: f.root, executionRoot: f.root, branch: "metadata-branch" } });
  f.record("empty", { name: "Empty session", updatedAt: "2098-01-01T00:00:00Z" });
  f.history("active/retry.jsonl", [header("retry")], "trash");
  f.record("retry", { collection: "active", deletion: { operationId: "retry-op", history: "retained", workspace: "retained", status: "partial", removeWorktree: true }, removalStarted: true, workspace: { projectId: f.project.id, sessionId: "retry", mode: "worktree", state: "ready", treeRoot: "/not/a/real/worktree", executionRoot: "/not/a/real/worktree", branch: "metadata" } });
  const registry = new WorkspaceRegistry(f.root);
  const repository = new SessionRepository(registry, { catalog: () => { throw new Error("Full detail/catalog projection must not run"); } });
  t.mock.method(registry, "resolve", () => { throw new Error("Validated project context must be reused"); });
  const active = await repository.listSummaries(f.project.id, "active", f.project);
  assert.deepEqual(active.map((session) => session.id), ["owned", "empty"]);
  assert.equal(active[0].name, "Saved name");
  assert.equal(active[0].preview, "latest user");
  assert.equal(active[0].workspace?.branch, "metadata-branch");
  assert.equal(active[1].persisted, false);
  const trash = await repository.listSummaries(f.project.id, "trash", f.project);
  assert.equal(trash[0].deletion?.status, "partial");
  assert.equal(trash[0].deletion?.history, "trashed");
});

it("detects duplicate final identities across collections and retains more than 100 rows", async (t) => {
  const f = fixture(t);
  for (let index = 0; index < 151; index++) f.history(`item-${index}.jsonl`, [header(`session-${index}`), user(`prompt-${index}`)]);
  const reader = new SessionListReader();
  assert.equal((await reader.read(f.project)).length, 151);
  f.history("collision.jsonl", [header("other"), header("session-150")], "archived");
  await assert.rejects(reader.read(f.project), hasCode("ambiguous_session"));
});

it("reads each transcript once in bounded chunks, coalesces cross-collection snapshots and never caches completed data", async (t) => {
  const f = fixture(t), other = fixture(t);
  f.history("one.jsonl", [header("one"), { type: "message", message: { role: "assistant", content: "x".repeat(150_000) } }, user("current")]);
  f.history("two.jsonl", [header("two")], "archived");
  const metadata = f.record("one", { nameOverride: "One metadata read" });
  other.history("other.jsonl", [header("other")]);
  const gate = deferred(), entered = deferred();
  let calls = 0, bytes = 0, active = 0, maximum = 0;
  const positions = new Map<number, number[]>();
  const readChunk: SessionListChunkReader = async (handle, buffer, length, position) => {
    assert.ok(length <= 64 * 1024); calls++; active++; maximum = Math.max(maximum, active); if (calls >= 3) entered.release();
    const offsets = positions.get(handle.fd) ?? []; offsets.push(position); positions.set(handle.fd, offsets);
    await gate.promise;
    try { const read = await handle.read(buffer, 0, length, position); bytes += read.bytesRead; return read.bytesRead; } finally { active--; }
  };
  const reader = new SessionListReader({ readChunk });
  const a = reader.read(f.project), b = reader.read(f.project), c = reader.read({ ...other.project, id: "other-project" });
  await entered.promise;
  await new Promise((resolve) => setTimeout(resolve, 10));
  gate.release();
  const [first, shared, isolated] = await Promise.all([a, b, c]);
  assert.equal(first, shared);
  assert.equal(isolated[0].id, "other");
  assert.ok(maximum <= 8, "at most four active files per project snapshot");
  assert.equal([...positions.values()].flat().filter((position) => position === 0).length, 4, "three transcripts plus one metadata file, without repeat opens");
  const sourceBytes = [join(f.root, ".kiva", "sessions", "one.jsonl"), join(f.root, ".kiva", "sessions", ".archive", "two.jsonl"), join(other.root, ".kiva", "sessions", "other.jsonl"), metadata].reduce((sum, path) => sum + readFileSync(path).length, 0);
  assert.equal(bytes, sourceBytes);
  f.history("later.jsonl", [header("later")]);
  assert.equal((await reader.read(f.project)).length, 3);
});

it("cleans up a failed snapshot and shares its next successful scan across requested collections", async (t) => {
  const f = fixture(t);
  f.history("active.jsonl", [header("active")]);
  f.history("archived.jsonl", [header("archived")], "archived");
  f.record("empty");
  let fail = true, opens = 0;
  const reader = new SessionListReader({ readChunk: async (handle, buffer, length, position) => {
    if (position === 0) opens++;
    if (fail) throw Object.assign(new Error("read denied"), { code: "EACCES" });
    return (await handle.read(buffer, 0, length, position)).bytesRead;
  } });
  await assert.rejects(reader.read(f.project), hasCode("session_list_unavailable"));
  fail = false; opens = 0;
  const repository = new SessionRepository(new WorkspaceRegistry(f.root), { sessionLists: reader });
  const [active, archived] = await Promise.all([
    repository.listSummaries(f.project.id, "active", f.project),
    repository.listSummaries(f.project.id, "archived", f.project),
  ]);
  assert.deepEqual(active.map((session) => session.id).sort(), ["active", "empty"]);
  assert.deepEqual(archived.map((session) => session.id), ["archived"]);
  assert.equal(opens, 3, "different collection requests share both histories and metadata scan");
});

it("honors captured append boundaries and rejects truncation/replacement without returning partial rows", async (t) => {
  for (const change of ["append", "truncate", "replace"] as const) {
    const f = fixture(t);
    const path = f.history("snapshot.jsonl", [header("snapshot"), user("before")]);
    let changed = false;
    const reader = new SessionListReader({ readChunk: async (handle, buffer, length, position) => {
      const bytes = (await handle.read(buffer, 0, length, position)).bytesRead;
      if (!changed) {
        changed = true;
        if (change === "append") appendFileSync(path, `${JSON.stringify(user("after"))}\n`);
        else if (change === "truncate") truncateSync(path, 1);
        else { renameSync(path, `${path}.old`); writeFileSync(path, `${JSON.stringify(header("replacement"))}\n`); }
      }
      return bytes;
    } });
    if (change === "append") {
      assert.equal((await reader.read(f.project))[0].preview, "before");
      assert.equal((await reader.read(f.project))[0].preview, "after");
    } else await assert.rejects(reader.read(f.project), /changed|ownership|unavailable/i);
  }
});

it("skips inventory symlinks, rejects unsafe roots/metadata/nonregular histories and tolerates malformed JSONL", async (t) => {
  const f = fixture(t), outside = fixture(t);
  const path = f.history("safe.jsonl", [header("safe"), "{broken", user("valid")]);
  symlinkSync(outside.root, join(f.root, ".kiva", "sessions", "external"));
  symlinkSync(path, join(f.root, ".kiva", "sessions", "alias.jsonl"));
  assert.equal((await new SessionListReader().read(f.project)).length, 1);
  const metadata = f.record("metadata");
  renameSync(metadata, `${metadata}.old`); symlinkSync(`${metadata}.old`, metadata);
  await assert.rejects(new SessionListReader().read(f.project), /metadata|ownership/i);
  const unsafe = fixture(t);
  mkdirSync(join(unsafe.root, ".kiva")); symlinkSync(outside.root, join(unsafe.root, ".kiva", "sessions"));
  await assert.rejects(new SessionListReader().read(unsafe.project), hasCode("session_list_ownership"));
  const corrupt = fixture(t); corrupt.record("bad", { collection: "unknown" });
  await assert.rejects(new SessionListReader().read(corrupt.project), hasCode("metadata_corrupt"));
  if (process.platform !== "win32") {
    const pipe = fixture(t); pipe.history("safe.jsonl", [header("safe")]);
    execFileSync("mkfifo", [join(pipe.root, ".kiva", "sessions", "pipe.jsonl")]);
    await assert.rejects(new SessionListReader().read(pipe.project), hasCode("session_list_ownership"));
  }
});

it("accepts a large complete record and applies a final late ID without arbitrary truncation", async (t) => {
  const f = fixture(t);
  f.history("large.jsonl", [header("old"), { type: "message", message: { role: "assistant", content: "x".repeat(2_100_000) } }, user("after large record"), header("final")], "active", false);
  const sessions = await new SessionListReader().read(f.project);
  assert.equal(sessions[0].id, "final");
  assert.equal(sessions[0].preview, "after large record");
});

it("separates mutation generations so later reads cannot join a pre-mutation snapshot", async (t) => {
  const f = fixture(t);
  const path = f.history("session.jsonl", [header("session"), user("old")]);
  const firstGate = deferred(), entered = deferred();
  let blocked = true;
  const reader = new SessionListReader({ readChunk: async (handle, buffer, length, position) => {
    const bytes = (await handle.read(buffer, 0, length, position)).bytesRead;
    if (blocked) { blocked = false; entered.release(); await firstGate.promise; }
    return bytes;
  } });
  const old = reader.read(f.project);
  const oldResult = old.catch(() => undefined);
  await entered.promise;
  reader.invalidate(f.project.id);
  appendFileSync(path, `${JSON.stringify(user("new"))}\n`);
  const fresh = await reader.read(f.project);
  assert.equal(fresh[0].preview, "new");
  firstGate.release(); await oldResult;
  assert.equal((await reader.read(f.project))[0].preview, "new");
});
