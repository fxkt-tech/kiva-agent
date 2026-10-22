import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { applyAppearancePreference } from "../lib/web-preferences";
import { themeBootstrapScript } from "../lib/theme-bootstrap";
import { VISUAL_STYLES, WEB_PREFERENCES_KEY, WEB_PREFERENCES_MAX_LENGTH, isVisualStylePreference, parseWebPreferences } from "../shared/web-preferences";

function root() {
  const attributes = new Map<string, string>();
  return { attributes, setAttribute: (key: string, value: string) => { attributes.set(key, value); }, removeAttribute: (key: string) => { attributes.delete(key); } };
}

describe("pre-paint theme bootstrap", () => {
  it("matches the runtime decoder for every valid mode/style pair and invalid field", () => {
    for (const theme of ["light", "dark", "system", "<script>", null]) {
      for (const visualStyle of [...VISUAL_STYLES, "<script>", "SWISS", null, undefined, true, {}, []]) {
        const element = root(), runtime = root(), reads: string[] = [];
        const value = JSON.stringify({ version: 1, appearance: { theme, visualStyle }, apiKey: "SECRET" });
        // A stale attribute must be removed by either initialization path.
        for (const target of [element, runtime]) { target.setAttribute("data-theme", "dark"); target.setAttribute("data-visual-style", "swiss"); }
        runInNewContext(themeBootstrapScript, { localStorage: { getItem: (key: string) => { reads.push(key); return value; } }, document: { documentElement: element } });
        applyAppearancePreference(runtime, parseWebPreferences(value).appearance);
        assert.deepEqual(reads, [WEB_PREFERENCES_KEY]);
        assert.deepEqual(element.attributes, runtime.attributes);
        assert.equal(element.attributes.get("data-theme"), theme === "light" || theme === "dark" ? theme : undefined);
        assert.equal(element.attributes.get("data-visual-style"), isVisualStylePreference(visualStyle) && visualStyle !== "flat" ? visualStyle : undefined);
      }
    }
  });

  it("matches runtime fallbacks for missing/malformed/versioned/oversized/denied storage", () => {
    const oversized = JSON.stringify({ version: 1, appearance: { theme: "dark", visualStyle: "swiss" }, ignored: " ".repeat(WEB_PREFERENCES_MAX_LENGTH) });
    for (const value of [null, "{", "null", "[]", JSON.stringify({ version: 2, appearance: { theme: "dark", visualStyle: "swiss" } }), oversized]) {
      const element = root(), runtime = root();
      element.setAttribute("data-theme", "dark"); element.setAttribute("data-visual-style", "swiss");
      runInNewContext(themeBootstrapScript, { localStorage: { getItem: () => value }, document: { documentElement: element } });
      applyAppearancePreference(runtime, parseWebPreferences(value).appearance);
      assert.deepEqual(element.attributes, runtime.attributes);
      assert.equal(element.attributes.size, 0);
    }
    const element = root();
    element.setAttribute("data-theme", "dark"); element.setAttribute("data-visual-style", "swiss");
    runInNewContext(themeBootstrapScript, { get localStorage() { throw new Error("storage denied"); }, document: { documentElement: element } });
    assert.equal(element.attributes.size, 0);
  });

  it("changes both dimensions immediately without leaving a stale override", () => {
    const element = root();
    for (const previous of VISUAL_STYLES) {
      for (const visualStyle of VISUAL_STYLES) {
        for (const theme of ["dark", "light", "system"] as const) {
          applyAppearancePreference(element, { theme: "dark", visualStyle: previous });
          applyAppearancePreference(element, { theme, visualStyle });
          assert.deepEqual(Object.fromEntries(element.attributes), {
            ...(theme === "system" ? {} : { "data-theme": theme }),
            ...(visualStyle === "flat" ? {} : { "data-visual-style": visualStyle }),
          }, `${previous} → ${visualStyle} in ${theme} mode`);
        }
      }
    }
  });

  it("coexists with local Geist/cache recovery and limits suppression to the root attribute seam", () => {
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    assert.match(layout, /GeistSans\.variable.*GeistMono\.variable/);
    assert.match(layout, /id="kiva-theme-bootstrap"/);
    assert.match(layout, /id="kiva-legacy-cache-recovery"/);
    assert.match(layout, /<html[^>]+suppressHydrationWarning/);
    assert.equal((layout.match(/suppressHydrationWarning/g) ?? []).length, 1);
    assert.doesNotMatch(layout, /<body[^>]+suppressHydrationWarning/);
    assert.ok(layout.indexOf('id="kiva-theme-bootstrap"') < layout.indexOf("<body>"));
  });
});
