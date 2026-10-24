import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SessionArtifactReader } from "./session-artifacts";
import { ArtifactPreviewService } from "./artifact-previews";
import type { ArtifactContext } from "./session-repository";
import { sendError } from "./scoped-transport";

const roots: string[] = [], services: ArtifactPreviewService[] = [], servers: Server[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) service.close();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "kiva-artifact-previews-"))); roots.push(root);
  await mkdir(join(root, ".kiva", "sessions"), { recursive: true }); await mkdir(join(root, "artifacts"));
  const header = { type: "session", version: 3, id: "one", cwd: root };
  await writeFile(join(root, ".kiva", "sessions", "one.jsonl"), [header, { type: "message", id: "source", parentId: null, message: { role: "assistant", content: "[页面](artifacts/demo.html) ![图](artifacts/chart.svg)" } }].map((entry) => JSON.stringify(entry)).join("\n"));
  await writeFile(join(root, "artifacts/demo.html"), '<link rel="stylesheet" href="theme.css"><img src="chart.svg"><script type="module" src="main.js"></script><script>fetch("https://public.example.test/data")</script>');
  await writeFile(join(root, "artifacts/theme.css"), 'body{color:red;background-image:url(chart.svg)}');
  await writeFile(join(root, "artifacts/main.js"), 'import {label} from "./helper.js"; fetch("./data.json").then(r=>r.json());');
  await writeFile(join(root, "artifacts/helper.js"), 'export const label="fixture";');
  await writeFile(join(root, "artifacts/data.json"), '{"ready":true}');
  await writeFile(join(root, "artifacts/chart.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><script>top.bad=true</script></svg>');
  await writeFile(join(root, "artifacts/unrelated.json"), '{"private":true}');
  const scope = { projectId: "project", sessionId: "one" };
  const context: ArtifactContext = { projectRoot: root, root, recordedRoot: root, known: true };
  const repository = { artifactContext: () => context }, reader = new SessionArtifactReader(repository);
  let now = Date.now();
  const previews = new ArtifactPreviewService(reader, repository, { now: () => now }); services.push(previews);
  const server = createServer(async (req, res) => { try { if (!await previews.serve(req, res, origin)) { res.statusCode = 404; res.end(); } } catch (error) { sendError(res, error); } }); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const artifacts = (await reader.read(scope)).list.artifacts;
  return { root, context, scope, reader, previews, origin, artifacts, advance: (ms: number) => { now += ms; } };
}

describe("artifact preview capabilities", () => {
  it("serves only the exact syntax-discovered closure with opaque sandbox, CORS and no-referrer", async () => {
    const f = await fixture();
    const artifact = f.artifacts.find((item) => item.kind === "html")!;
    const lease = await f.previews.create(f.scope, artifact.id);
    assert.deepEqual(lease.warnings, []);
    const document = await fetch(f.origin + lease.url);
    assert.equal(document.status, 200); assert.match(document.headers.get("content-security-policy")!, /sandbox allow-scripts/);
    assert.doesNotMatch(document.headers.get("content-security-policy")!, /allow-same-origin|unsafe-eval/);
    assert.match(document.headers.get("content-security-policy")!, /connect-src https: wss:/);
    assert.equal(document.headers.get("referrer-policy"), "no-referrer");
    const prefix = lease.url.slice(0, lease.url.lastIndexOf("/") + 1);
    for (const file of ["theme.css", "main.js", "helper.js", "data.json", "chart.svg"]) {
      const response = await fetch(f.origin + prefix + file, { headers: { origin: "null" } });
      assert.equal(response.status, 200, file); assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(response.headers.has("access-control-allow-credentials"), false);
    }
    const unrelated = await fetch(f.origin + prefix + "unrelated.json"); assert.equal(unrelated.status, 404);
    const privateResource = await fetch(f.origin + prefix + "../.kiva/agent/auth.json"); assert.notEqual(privateResource.status, 200);
  });

  it("keeps independently opened leases alive and reclaims revoked/expired previews", async () => {
    const f = await fixture(), artifact = f.artifacts.find((item) => item.kind === "html")!;
    const first = await f.previews.create(f.scope, artifact.id), second = await f.previews.create(f.scope, artifact.id);
    assert.notEqual(first.leaseId, second.leaseId);
    assert.throws(() => f.previews.revoke({ ...f.scope, sessionId: "other" }, first.leaseId), /不存在/);
    f.previews.revoke(f.scope, first.leaseId);
    assert.equal((await fetch(f.origin + first.url)).status, 410);
    assert.equal((await fetch(f.origin + second.url)).status, 200);
    f.advance(15 * 60_000 + 1);
    assert.equal((await fetch(f.origin + second.url)).status, 410);
  });

  it("serves SVG without script permission even when opened as a top-level document", async () => {
    const f = await fixture(), artifact = f.artifacts.find((item) => item.kind === "image")!;
    const lease = await f.previews.create(f.scope, artifact.id), image = await fetch(f.origin + lease.url);
    assert.equal(image.headers.get("content-type"), "image/svg+xml");
    assert.match(image.headers.get("content-security-policy")!, /sandbox; default-src 'none'/);
    assert.doesNotMatch(image.headers.get("content-security-policy")!, /allow-scripts/);
    const content = await f.previews.content(f.scope, artifact.id);
    assert.equal(content.mimeType, "image/svg+xml"); assert.ok(Buffer.isBuffer(content.content));
  });

  it("allows explicitly declared dependency aliases and keeps external files alive without a live worktree", async () => {
    const f = await fixture(), artifact = f.artifacts.find((item) => item.kind === "html")!;
    const external = join(f.root, "external-data.json"); await writeFile(external, '{"external":true}');
    await rm(join(f.root, "artifacts/data.json")); await symlink(external, join(f.root, "artifacts/data.json"));
    const lease = await f.previews.create(f.scope, artifact.id);
    assert.deepEqual(lease.warnings, []);
    const asset = lease.url.replace("demo.html", "data.json");
    assert.equal((await fetch(f.origin + asset)).status, 200);
    f.context.root = undefined;
    assert.equal((await fetch(f.origin + lease.url)).status, 200);
    await rm(join(f.root, "artifacts/data.json")); await writeFile(join(f.root, "artifacts/data.json"), '{"replacement":true}');
    assert.equal((await fetch(f.origin + asset)).status, 409, "an existing lease cannot silently follow a substituted file");
  });

  it("resolves nested script imports from the module and fetch from the document directory", async () => {
    const f = await fixture(), artifact = f.artifacts.find((item) => item.kind === "html")!;
    await mkdir(join(f.root, "artifacts/scripts"));
    await writeFile(join(f.root, "artifacts/demo.html"), '<script type="module" src="scripts/main.js"></script>');
    await writeFile(join(f.root, "artifacts/scripts/main.js"), 'import {label} from "./helper.js"; fetch("./data.json");');
    await writeFile(join(f.root, "artifacts/scripts/helper.js"), 'export const label="nested";');
    const lease = await f.previews.create(f.scope, artifact.id), prefix = lease.url.replace(/demo.html$/, "");
    assert.deepEqual(lease.warnings, []);
    assert.equal((await fetch(f.origin + prefix + "scripts/helper.js")).status, 200);
    assert.equal((await fetch(f.origin + prefix + "data.json")).status, 200);
    assert.equal((await fetch(f.origin + prefix + "scripts/data.json")).status, 404);
  });
  it("builds an exact external graph for absolute, parent-relative and file-URL CSS/ESM/JSON/image resources", async () => {
    const f = await fixture();
    const external = await realpath(await mkdtemp(join(tmpdir(), "kiva-preview-external-"))); roots.push(external);
    const page = join(external, "page.html");
    await mkdir(join(external, "scripts")); await mkdir(join(external, "shared"));
    const style = join(external, "style.css"), helper = join(external, "scripts/helper.js"), logo = join(external, "shared/logo.svg");
    await writeFile(page, `<link rel="stylesheet" href="${style}"><script type="module" src="scripts/main.js"></script><img src="file://${logo}">`);
    await writeFile(style, '@import "shared/common.css";'); await writeFile(join(external, "shared/common.css"), 'body{color:purple}');
    await writeFile(helper, 'export const name="external";');
    await writeFile(join(external, "scripts/main.js"), `import {name} from ${JSON.stringify(helper)}; fetch('./shared/data.json'); new URL(${JSON.stringify('file://' + logo)}, import.meta.url);`);
    await writeFile(join(external, "shared/data.json"), '{"external":true}'); await writeFile(logo, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(external, "shared/unlisted.json"), '{"private":true}');
    await writeFile(join(f.root, ".kiva/sessions/one.jsonl"), [
      { type: "session", version: 3, id: "one", cwd: f.root },
      { type: "message", id: "external-source", parentId: null, message: { role: "assistant", content: `[external](${page})` } },
    ].map((entry) => JSON.stringify(entry)).join("\n"));
    f.context.root = undefined;
    const artifact = (await f.reader.read(f.scope)).list.artifacts[0];
    const lease = await f.previews.create(f.scope, artifact.id);
    assert.deepEqual(lease.warnings, []);
    const document = await fetch(f.origin + lease.url), html = await document.text();
    const expected = (file: string) => `/preview/${lease.leaseId}/fs/${file.slice(1).split('/').map(encodeURIComponent).join('/')}`;
    assert.ok(html.includes(expected(style))); assert.ok(html.includes(expected(logo)));
    for (const path of [style, helper, logo, join(external, "scripts/main.js"), join(external, "shared/common.css"), join(external, "shared/data.json")]) {
      const response = await fetch(f.origin + expected(path)); assert.equal(response.status, 200, path);
      if (path.endsWith("main.js")) {
        const source = await response.text(); assert.ok(source.includes(expected(helper))); assert.ok(source.includes(expected(join(external, "shared/data.json"))));
      }
    }
    assert.equal((await fetch(f.origin + expected(join(external, "shared/unlisted.json")))).status, 404);
    const original = await f.previews.content(f.scope, artifact.id); assert.ok(original.content.toString().includes(style), "source API remains original source");
    await rename(page, join(external, "old-page.html")); await writeFile(page, '<p>replacement</p>');
    assert.equal((await fetch(f.origin + lease.url)).status, 409);
    const fresh = await f.previews.create(f.scope, artifact.id); assert.equal((await fetch(f.origin + fresh.url)).status, 200);
  });

});
