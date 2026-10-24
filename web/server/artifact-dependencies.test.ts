import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { artifactDependencies, rewriteArtifactResourceUrls } from "./artifact-dependencies";

const refs = (path: string, content: string) => artifactDependencies(path, content).references;

describe("artifactDependencies", () => {
  it("discovers declared HTML resources and inline code without treating navigation as assets", () => {
    const result = artifactDependencies("demo.html", `<!doctype html>
      <base href="../private/"><a href="unrelated.html">Go</a>
      <link rel="canonical" href="canonical.html"><link rel="stylesheet" href="theme.css">
      <link rel="modulepreload" href="preloaded.js"><script src="app.js"></script>
      <img src="photo.png"><video src="clip.mp4" poster="poster.png"></video>
      <svg><image href="diagram.svg"/></svg><input type="image" src="button.png">
      <iframe src="nested.html"></iframe><object data="private.json"></object>
      <style>.x {background: url('tile.png')}</style>
      <div style="background-image:url(inline.png)" onclick="return fetch('click.json')"></div>
      <script>fetch('data.json');</script><script type="module">import './module.js';</script>
      <script type="application/json">{"src":"not-a-resource.png"}</script>`);
    assert.deepEqual(new Set(result.references), new Set(["theme.css", "preloaded.js", "app.js", "photo.png", "clip.mp4", "poster.png", "diagram.svg", "button.png", "tile.png", "inline.png", "click.json", "data.json", "./module.js"]));
    assert.deepEqual(result.warnings, []);
  });

  it("keeps srcset data URL commas intact and supports source and preload candidates", () => {
    assert.deepEqual(refs("image.htm", `<picture><source srcset="data:image/svg+xml,%3Csvg%3E,%3C/svg%3E 1x, wide.png 2x"><img srcset="small.png, large.png 2x"></picture><link rel="preload" as="image" imagesrcset="preload.png 1x, preload-large.png 2x">`), [
      "data:image/svg+xml,%3Csvg%3E,%3C/svg%3E", "wide.png", "small.png", "large.png", "preload.png", "preload-large.png",
    ]);
  });

  it("uses CSS syntax for imports, nested URL values and escaped file names", () => {
    const result = artifactDependencies("style.css", String.raw`
      /* url(secret.json) */
      @import "base.css" screen;
      @import url('colors.css');
      .x { content: "url(not-real.png)"; background: url(photo\ 1.png); mask: url(\64 iagram.svg); }
      @font-face { src: url(font.woff2) format('woff2'); }
      .y { background-image: image-set(url(a.png) 1x, url(b.png) 2x); }`);
    assert.deepEqual(new Set(result.references), new Set(["base.css", "colors.css", "photo 1.png", "diagram.svg", "font.woff2", "a.png", "b.png"]));
    assert.deepEqual(result.warnings, []);
  });

  it("extracts module, literal fetch and import-meta URL dependencies without executing code", () => {
    const result = artifactDependencies("main.mjs", `
      import x from './x.js'; export { x } from './exports.js'; export * from './all.js';
      import('./lazy.js'); fetch('./data.json'); window.fetch('./window.json');
      self.fetch('./self.json'); globalThis.fetch('./global.json');
      new URL('./icon.svg', import.meta.url); fetch(\`./constant.json\`);
      // fetch('./comment.json');
      const ignored = "import('./string.js')";
      fetch('./dynamic-' + name); import(name); client.fetch('./private.json');
      new URL('./not-import-meta.json', 'https://example.invalid/');
      throw new Error('must not execute');
    `);
    assert.deepEqual(result.references, ["./x.js", "./exports.js", "./all.js", "./lazy.js", "./data.json", "./window.json", "./self.json", "./global.json", "./icon.svg", "./constant.json"]);
    assert.deepEqual(result.warnings, []);
  });

  it("distinguishes document-relative fetch from nested script imports, including identical literals", () => {
    const result = artifactDependencies("scripts/nested/main.js", `import './helper.js'; fetch('./data.json'); new URL('./data.json', import.meta.url);`);
    assert.deepEqual(result.references, ["./helper.js", "./data.json"]);
    assert.deepEqual(result.documentReferences, ["./data.json"]);
    assert.deepEqual(result.scriptReferences, ["./helper.js", "./data.json"]);
    assert.deepEqual(result.warnings, []);
  });

  it("keeps external URLs for the owner to filter and deduplicates declarations", () => {
    assert.deepEqual(refs("demo.html", `<script src="https://cdn.example.invalid/lib.js"></script><img src="./same.png"><img src="./same.png"><script>fetch('https://api.example.invalid/data')</script>`), ["https://cdn.example.invalid/lib.js", "./same.png", "https://api.example.invalid/data"]);
  });

  it("discovers import-map targets and resources declared in templates", () => {
    const result = artifactDependencies("demo.html", `<script type="importmap">{"imports":{"lib":"./lib.js","cdn":"https://cdn.example.invalid/lib.js"},"scopes":{"./":{"other":"./other.js","blocked":null}}}</script><template><img src="lazy.png"></template>`);
    assert.deepEqual(result.references, ["./lib.js", "https://cdn.example.invalid/lib.js", "./other.js", "lazy.png"]);
    assert.deepEqual(result.warnings, []);
  });

  it("reports syntax failures truthfully while preserving independent valid resources", () => {
    const result = artifactDependencies("demo.html", `<img src="valid.png"><script>fetch(</script><style>.broken{</style><script type="importmap">{</script>`);
    assert.deepEqual(result.references, ["valid.png"]);
    assert.equal(result.warnings.length, 3);
    assert.ok(result.warnings.some((warning) => warning.includes("JavaScript")));
    assert.ok(result.warnings.some((warning) => warning.includes("CSS")));
    assert.ok(result.warnings.some((warning) => warning.includes("import map")));
  });

  it("ignores data documents and parses a classic CommonJS file without module assumptions", () => {
    assert.deepEqual(artifactDependencies("data.json", '{"src":"secret.png"}'), { references: [], warnings: [] });
    assert.deepEqual(refs("classic.cjs", "with (globalThis) { fetch('./classic.json'); }"), ["./classic.json"]);
    assert.deepEqual(artifactDependencies("classic.js", "with (globalThis) { fetch('./classic.json'); }"), { references: ["./classic.json"], warnings: [], documentReferences: ["./classic.json"] });
  });
});


const mountAbsolute = (reference: string) => {
  const path = reference.startsWith("file://") ? new URL(reference).pathname : reference;
  return path.startsWith("/") && !path.startsWith("//") ? "/preview/token/fs" + path.split("/").map((part) => encodeURIComponent(decodeURIComponent(part))).join("/") : reference;
};

describe("rewriteArtifactResourceUrls", () => {
  it("rewrites only JS URL expressions and retains each browser URL base", () => {
    const bases: [string, string][] = [];
    const source = `import x from '/tmp/x.js'; export {x} from '/tmp/reexport.js'; export * from '/tmp/all.js';
      import('file:///tmp/lazy.js'); fetch('/tmp/data.json'); new URL('/tmp/icon.svg', import.meta.url);
      import './relative.js'; fetch('https://api.example.invalid/data');
      const plain = '/tmp/not-a-resource.js'; // fetch('/tmp/comment.json')
      fetch('/tmp/' + dynamic);`;
    const result = rewriteArtifactResourceUrls("nested/app.mjs", source, (reference, base) => { bases.push([reference, base]); return mountAbsolute(reference); });
    for (const name of ["x.js", "reexport.js", "all.js", "lazy.js", "data.json", "icon.svg"]) assert.ok(result.includes("/preview/token/fs/tmp/" + name));
    assert.ok(result.includes("import './relative.js'"));
    assert.ok(result.includes("fetch('https://api.example.invalid/data')"));
    assert.ok(result.includes("const plain = '/tmp/not-a-resource.js'"));
    assert.ok(result.includes("// fetch('/tmp/comment.json')"));
    assert.ok(result.includes("fetch('/tmp/' + dynamic)"));
    assert.ok(bases.some(([reference, base]) => reference === "/tmp/data.json" && base === "document"));
    assert.ok(bases.some(([reference, base]) => reference === "/tmp/icon.svg" && base === "resource"));
    assert.deepEqual(artifactDependencies("app.mjs", result).warnings, []);
  });

  it("rewrites CSS AST URL and import sites with escaped strings, without changing comments or text", () => {
    const source = String.raw`/* url(/tmp/comment.png) */ @import '/tmp/base.css';
      .x { background: url(/tmp/photo\ name.png); mask:url('file:///tmp/icon.svg'); content:'url(/tmp/plain.png)'; }
      .y { background: url(relative.png) }`;
    const result = rewriteArtifactResourceUrls("theme.css", source, mountAbsolute);
    assert.ok(result.includes('"/preview/token/fs/tmp/base.css"'));
    assert.ok(result.includes('url("/preview/token/fs/tmp/photo%20name.png")'));
    assert.ok(result.includes('url("/preview/token/fs/tmp/icon.svg")'));
    assert.ok(result.includes("/* url(/tmp/comment.png) */"));
    assert.ok(result.includes("content:'url(/tmp/plain.png)'"));
    assert.ok(result.includes("url(relative.png)"));
    assert.deepEqual(artifactDependencies("theme.css", result).warnings, []);
  });

  it("rewrites HTML resource attributes, inline JS/CSS, srcset and import maps, leaving anchors alone", () => {
    const source = `<!doctype html><html><head><link rel="stylesheet" href="/tmp/theme.css">
      <script type="importmap">{"imports":{"lib":"file:///tmp/lib.js"},"scopes":{"/tmp/":{"other":"/tmp/other.js"}}}</script>
      <style>.x{background:url('/tmp/tile.png')}</style></head><body>
      <a href="/tmp/untouched.html">Go</a><img src="/tmp/photo.png" srcset="data:image/svg+xml,%3Csvg,%3E 1x, /tmp/large.png 2x">
      <div style="background:url('/tmp/inline.png')" onclick="fetch('/tmp/click.json')"></div>
      <script type="module">import '/tmp/module.js'; fetch('file:///tmp/data.json')</script>
      <script type="application/json">{"src":"/tmp/not-a-resource.png"}</script></body></html>`;
    const result = rewriteArtifactResourceUrls("page.html", source, mountAbsolute);
    for (const name of ["theme.css", "lib.js", "other.js", "tile.png", "photo.png", "large.png", "inline.png", "click.json", "module.js", "data.json"]) assert.ok(result.includes("/preview/token/fs/tmp/" + name), name);
    assert.ok(result.includes('href="/tmp/untouched.html"'));
    assert.ok(result.includes("data:image/svg+xml,%3Csvg,%3E 1x"));
    assert.ok(result.includes('"src":"/tmp/not-a-resource.png"'));
    assert.ok(result.includes('"/preview/token/fs/tmp/"'));
    assert.deepEqual(artifactDependencies("page.html", result).warnings, []);
  });

  it("preserves bare module aliases and import-map keys while rewriting actual relative files", () => {
    const source = `<script type="importmap">{"imports":{"chart.js":"./vendor/chart.js","./alias.js":"./actual.js"}}</script><script type="module">import 'chart.js'; import './alias.js'; new URL('icon.svg', import.meta.url)</script>`;
    const allLocal = (value: string) => /^(?:https?:|data:)/.test(value) ? value : "/preview/token/fs/" + value;
    const result = rewriteArtifactResourceUrls("page.html", source, allLocal);
    assert.ok(result.includes('"chart.js":"/preview/token/fs/./vendor/chart.js"'));
    assert.ok(result.includes("import 'chart.js'"));
    assert.ok(result.includes('"/preview/token/fs/./alias.js":"/preview/token/fs/./actual.js"'));
    assert.ok(result.includes('import "/preview/token/fs/./alias.js"'));
    assert.ok(result.includes('new URL("/preview/token/fs/icon.svg", import.meta.url)'));
    const discovered = artifactDependencies("page.html", source);
    assert.ok(!discovered.references.includes("chart.js"));
    assert.ok(discovered.references.includes("./vendor/chart.js"));
    assert.ok(discovered.references.includes("icon.svg"));
  });

  it("escapes replacement JS strings and cannot insert a closing script tag", () => {
    const result = rewriteArtifactResourceUrls("page.html", '<script>fetch("/tmp/data.json")</script>', () => '</script><script>bad()</script>"\\');
    assert.equal((result.match(/<script>/g) ?? []).length, 1);
    assert.ok(result.includes('\\u003c/script>'));
    assert.deepEqual(artifactDependencies("page.html", result).warnings, []);
    const css = rewriteArtifactResourceUrls("page.html", '<style>.x{background:url("/tmp/image.png")}</style>', () => '</style><script>bad()</script>');
    assert.equal((css.match(/<script>/g) ?? []).length, 0);
    assert.ok(css.includes('\\3c /style>'));
  });

  it("preserves unchanged sources byte-for-byte and keeps invalid JS/CSS unchanged", () => {
    for (const [path, source] of [["page.html", "<img src='relative.png'><script>fetch('https://api.example.invalid/')</script>"], ["app.js", "fetch('/tmp/data.json'); broken("], ["style.css", ".x { background:url('/tmp/a.png');"]]) {
      assert.equal(rewriteArtifactResourceUrls(path, source, path === "page.html" ? (value) => value : mountAbsolute), source);
    }
    assert.equal(rewriteArtifactResourceUrls("data.json", '{"src":"/tmp/x.png"}', mountAbsolute), '{"src":"/tmp/x.png"}');
  });

  it("does not swallow caller authorization errors as syntax failures", () => {
    for (const [path, source] of [["page.html", '<img src="/tmp/image.png">'], ["app.js", "fetch('/tmp/data.json')"], ["style.css", ".x { background:url('/tmp/a.png') }"]]) {
      assert.throws(() => rewriteArtifactResourceUrls(path, source, () => { throw new Error("authorization failed"); }), /authorization failed/);
    }
  });
});
