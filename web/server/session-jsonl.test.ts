import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { SessionCatalog } from "./session-catalog";
import { SESSION_JSONL_MAX_BYTES } from "./session-jsonl";
import { SessionRepository } from "./session-repository";
import { WorkspaceRegistry } from "./workspace-registry";
import { WorkspaceError } from "../shared/workspace-contract";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiva-session-jsonl-"))); roots.push(root);
  const installation = join(root, "installation"); mkdirSync(installation);
  const projectRoot = join(root, "source"); mkdirSync(projectRoot);
  const registry = new WorkspaceRegistry(installation);
  const project = registry.register(projectRoot);
  const repository = new SessionRepository(registry, { worktreeRoot: join(root, "worktrees") });
  return { root, installation, projectRoot, registry, project, repository };
}
function transcript(root: string, id: string, suffix = "", path = `${id}.jsonl`) {
  const file = join(root, ".kiva", "sessions", path); mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ type: "session", id, version: 1, cwd: root })}\n${suffix}`);
  return file;
}
function metadata(root: string, projectId: string, id: string, persisted = false) {
  const file = join(root, ".kiva", "web", "sessions", `${id}.json`); mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ version: 1, projectId, id, name: "Empty", preview: "", path: "", persisted, legacy: true, executable: false, collection: "active", createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z" }));
  return file;
}
function code(value: string) { return (error: unknown) => error instanceof WorkspaceError && error.code === value; }
function tree(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result[path.slice(root.length)] = readFileSync(path).toString("base64");
    }
  };
  visit(root); return result;
}

describe("passive session JSONL snapshots", () => {
  it("preserves legacy versions, CRLF, blank lines, malformed lines and a partial tail exactly without writes", () => {
    const { projectRoot, project, repository, root } = fixture();
    const file = transcript(projectRoot, "raw");
    const content = '{"type":"session","id":"raw","version":1}\r\n\r\n {broken}\r\n{"type":"message","message":{"role":"user","content":"原始内容 🧭"}}\r\n{"unfinished":';
    writeFileSync(file, content);
    const before = tree(root);
    assert.deepEqual(repository.readJsonl(project.id, "raw"), { projectId: project.id, sessionId: "raw", fileName: "raw.jsonl", content, bytes: Buffer.byteLength(content), totalBytes: Buffer.byteLength(content), truncated: false });
    assert.deepEqual(tree(root), before);
    assert.equal(existsSync(join(projectRoot, ".kiva", "web")), false);
  });

  it("resolves archived and trashed histories and identities outside the presentation limit", () => {
    const { projectRoot, project, repository } = fixture();
    transcript(projectRoot, "archived", "old\n", "nested/old.jsonl");
    transcript(projectRoot, "deleted", "trashed\n");
    const catalog = new SessionCatalog(projectRoot);
    catalog.archive("nested/old.jsonl");
    catalog.trash("deleted.jsonl", "active");
    for (let index = 0; index < 105; index++) transcript(projectRoot, `other-${index}`);
    assert.equal(repository.readJsonl(project.id, "archived").fileName, "old.jsonl");
    assert.match(repository.readJsonl(project.id, "deleted").content, /trashed/);
  });

  it("returns an honest empty snapshot only for durable not-yet-persisted metadata", () => {
    const { projectRoot, project, repository, root } = fixture();
    metadata(projectRoot, project.id, "empty");
    const before = tree(root);
    assert.deepEqual(repository.readJsonl(project.id, "empty"), { projectId: project.id, sessionId: "empty", content: "", bytes: 0, totalBytes: 0, truncated: false });
    assert.deepEqual(tree(root), before);
    assert.equal(existsSync(join(projectRoot, ".kiva", "sessions")), false);
    metadata(projectRoot, project.id, "missing", true);
    assert.throws(() => repository.readJsonl(project.id, "missing"), code("session_history_missing"));
  });

  it("rejects unknown projects, wrong project/session pairs, traversal and mismatched metadata without side effects", () => {
    const { projectRoot, project, repository, root, registry } = fixture();
    transcript(projectRoot, "owned");
    const otherRoot = join(root, "other"); mkdirSync(otherRoot);
    const other = registry.register(otherRoot);
    const before = tree(root);
    assert.throws(() => repository.readJsonl(other.id, "owned"), code("session_not_found"));
    assert.throws(() => repository.readJsonl("unknown", "owned"), code("project_not_found"));
    assert.throws(() => repository.readJsonl(project.id, "../owned"), code("invalid_id"));
    assert.deepEqual(tree(root), before);
    metadata(otherRoot, project.id, "bad");
    assert.throws(() => repository.readJsonl(other.id, "bad"), code("metadata_corrupt"));
  });

  it("rejects duplicate identities across active/archive/trash, including later headers", () => {
    const { projectRoot, project, repository } = fixture();
    transcript(projectRoot, "same");
    transcript(projectRoot, "different", '{"type":"session","id":"same"}\n', ".archive/another.jsonl");
    assert.throws(() => repository.readJsonl(project.id, "same"), code("ambiguous_session"));
  });

  it("bounds large multi-record histories to a complete-line UTF-8 prefix and reports source bytes honestly", () => {
    const { projectRoot, project, repository } = fixture();
    const header = '{"type":"session","id":"large"}\n';
    const line = `${JSON.stringify({ type: "message", text: "上下文 🧭".repeat(900) })}\r\n`;
    const content = header + line.repeat(Math.ceil((SESSION_JSONL_MAX_BYTES + 4096) / Buffer.byteLength(line)));
    const file = transcript(projectRoot, "large"); writeFileSync(file, content);
    const document = repository.readJsonl(project.id, "large");
    assert.equal(document.truncated, true);
    assert.ok(document.bytes <= SESSION_JSONL_MAX_BYTES);
    assert.equal(document.bytes, Buffer.byteLength(document.content));
    assert.equal(document.totalBytes, Buffer.byteLength(content));
    assert.equal(document.content, content.slice(0, document.content.length));
    assert.ok(document.content.endsWith("\r\n"));
    assert.ok(document.bytes > SESSION_JSONL_MAX_BYTES - Buffer.byteLength(line));
    assert.doesNotMatch(document.content, /�/);
    assert.equal(readFileSync(file, "utf8"), content);
  });

  it("reports oversized complete or partial records as an identity-check limit, not an unknown session", () => {
    const { projectRoot, project, repository } = fixture();
    const file = transcript(projectRoot, "oversized", `{"data":"${"x".repeat(SESSION_JSONL_MAX_BYTES)}"}\n`);
    assert.throws(() => repository.readJsonl(project.id, "oversized"), code("jsonl_line_too_large"));
    writeFileSync(file, `{"type":"session","id":"oversized"}\n${"x".repeat(SESSION_JSONL_MAX_BYTES + 1)}`);
    assert.throws(() => repository.readJsonl(project.id, "oversized"), code("jsonl_line_too_large"));
  });

  it("never follows target or ancestor symlinks or discloses external file contents/paths", () => {
    for (const ancestor of [false, true]) {
      const { projectRoot, project, repository, root } = fixture();
      const external = join(root, "private-external"); mkdirSync(external);
      const secret = join(external, "secret.jsonl"); writeFileSync(secret, '{"type":"session","id":"secret"}\nprivate-token');
      if (ancestor) {
        mkdirSync(join(projectRoot, ".kiva")); symlinkSync(external, join(projectRoot, ".kiva", "sessions"));
      } else {
        mkdirSync(join(projectRoot, ".kiva", "sessions"), { recursive: true }); symlinkSync(secret, join(projectRoot, ".kiva", "sessions", "secret.jsonl"));
      }
      assert.throws(() => repository.readJsonl(project.id, "secret"), (error: unknown) => {
        assert.ok(error instanceof WorkspaceError);
        assert.doesNotMatch(error.message, /private-token|private-external/);
        assert.equal(error.status, 409); return true;
      });
      assert.equal(readFileSync(secret, "utf8"), '{"type":"session","id":"secret"}\nprivate-token');
    }
  });

  it("rejects a dangling symlink rather than treating its history as an empty session", () => {
    const { projectRoot, project, repository, root } = fixture();
    metadata(projectRoot, project.id, "empty");
    mkdirSync(join(projectRoot, ".kiva", "sessions"));
    symlinkSync(join(root, "missing.jsonl"), join(projectRoot, ".kiva", "sessions", "empty.jsonl"));
    assert.throws(() => repository.readJsonl(project.id, "empty"), code("session_jsonl_ownership"));
  });

  it("uses the same basename fallback and final valid session header identity as the catalog", () => {
    const { projectRoot, project, repository } = fixture();
    const file = transcript(projectRoot, "first", '{"type":"session","id":"last"}\n{"type":"session","id":', "fallback.jsonl");
    assert.equal(repository.readJsonl(project.id, "last").content, readFileSync(file, "utf8"));
    assert.throws(() => repository.readJsonl(project.id, "first"), code("session_not_found"));
    writeFileSync(file, "invalid but inspectable\r\n");
    assert.equal(repository.readJsonl(project.id, "fallback").content, "invalid but inspectable\r\n");
    appendFileSync(file, "\n");
    assert.equal(repository.readJsonl(project.id, "fallback").bytes, Buffer.byteLength("invalid but inspectable\r\n\n"));
  });

  it("preserves a UTF-8 BOM and rejects invalid bytes instead of presenting rewritten raw text", () => {
    const { projectRoot, project, repository } = fixture();
    const file = transcript(projectRoot, "encoding");
    const content = '\uFEFF{"type":"session","id":"encoding"}\r\n中文 🧭\n';
    writeFileSync(file, content);
    assert.equal(repository.readJsonl(project.id, "encoding").content, content);
    appendFileSync(file, Buffer.from([0xff]));
    assert.throws(() => repository.readJsonl(project.id, "encoding"), code("session_jsonl_encoding"));
  });

  it("stops at the initial size snapshot when another writer appends during a read", (context) => {
    const { projectRoot, project, repository } = fixture();
    const file = transcript(projectRoot, "appending", '{"data":"before"}\n');
    const originalContent = readFileSync(file, "utf8");
    const identity = fs.statSync(file);
    const originalRead = fs.readSync;
    let appended = false;
    let largestRead = 0;
    const mock = context.mock.method(fs, "readSync", (descriptor: number, ...args: unknown[]) => {
      const count = Reflect.apply(originalRead, fs, [descriptor, ...args]);
      if (fs.fstatSync(descriptor).ino === identity.ino) {
        if (typeof args[2] === "number") largestRead = Math.max(largestRead, args[2]);
        if (!appended) { appended = true; appendFileSync(file, '{"type":"session","id":"wrong-after-snapshot"}\n'); }
      }
      return count;
    });
    syncBuiltinESMExports();
    try {
      const document = repository.readJsonl(project.id, "appending");
      assert.equal(appended, true);
      assert.equal(document.content, originalContent);
      assert.equal(document.totalBytes, Buffer.byteLength(originalContent));
      assert.equal(document.truncated, false);
      assert.ok(largestRead <= 64 * 1024);
    } finally { mock.mock.restore(); syncBuiltinESMExports(); }
    assert.match(readFileSync(file, "utf8"), /wrong-after-snapshot/);
  });

  it("rejects named pipes before opening so a passive preview cannot block on a non-regular history", () => {
    const { projectRoot, project, repository } = fixture();
    const directory = join(projectRoot, ".kiva", "sessions"); mkdirSync(directory, { recursive: true });
    execFileSync("mkfifo", [join(directory, "pipe.jsonl")]);
    assert.throws(() => repository.readJsonl(project.id, "pipe"), code("session_jsonl_ownership"));
  });
});
