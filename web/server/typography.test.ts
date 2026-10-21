import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const stylesheet = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

describe("workspace typography", () => {
  it("loads both Geist families from bundled local fonts and applies their variables at the root", () => {
    for (const [family, entry] of [["GeistSans", "sans"], ["GeistMono", "mono"]]) {
      assert.ok(layout.includes(`import { ${family} } from "geist/font/${entry}"`));
      assert.ok(layout.includes(`${family}.variable`));
      const moduleUrl = import.meta.resolve(`geist/font/${entry}`);
      const source = readFileSync(new URL(moduleUrl), "utf8");
      assert.match(source, /from "next\/font\/local"/);
      const fontPath = source.match(/src:\s*"([^"]+\.woff2)"/)?.[1];
      assert.ok(fontPath, "Each family must ship a local WOFF2 asset");
      assert.equal(readFileSync(new URL(fontPath, moduleUrl)).subarray(0, 4).toString(), "wOF2");
    }
    assert.doesNotMatch(layout, /next\/font\/google|fonts\.googleapis|fonts\.gstatic/);
    assert.match(layout, /<html lang="zh-CN" className=/);
  });

  it("uses Geist-first UI and code tokens with system Chinese fallbacks", () => {
    assert.match(stylesheet, /--font-ui:\s*var\(--font-geist-sans\),\s*var\(--font-cjk\),\s*sans-serif/);
    assert.match(stylesheet, /--font-code:\s*var\(--font-geist-mono\),[^;]*var\(--font-cjk\),\s*monospace/);
    assert.match(stylesheet, /--font-cjk:[^;]*"PingFang SC"[^;]*"Microsoft YaHei"[^;]*"Noto Sans CJK SC"/);
    assert.match(stylesheet, /--font-sans:\s*var\(--font-ui\)/);
    assert.match(stylesheet, /--font-mono:\s*var\(--font-code\)/);
    assert.match(stylesheet, /body\s*\{[^}]*font-family:\s*var\(--font-ui\)/);
  });

  it("routes all explicit font families through the shared UI/code tokens or inheritance", () => {
    const declarations = [...stylesheet.matchAll(/font-family:\s*([^;}]+)/g)].map((match) => match[1].trim());
    assert.ok(declarations.includes("var(--font-ui)"));
    assert.ok(declarations.includes("var(--font-code)"));
    for (const family of declarations) {
      assert.ok(["var(--font-ui)", "var(--font-code)", "inherit"].includes(family), `Unmanaged font family: ${family}`);
    }
    for (const selector of [".code-block", ".tool-summary", ".tool-detail-body pre", ".workspace-preview pre", ".project-dialog form input"]) {
      const rules = stylesheet.split(selector).slice(1).map((part) => part.split("}")[0]);
      assert.ok(rules.some((rule) => rule.includes("font-family: var(--font-code)")), `${selector} must retain Geist Mono`);
    }
  });
});
