import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { applyThemePreference } from "../lib/web-preferences";
import { themeBootstrapScript } from "../lib/theme-bootstrap";
import { WEB_PREFERENCES_KEY } from "../shared/web-preferences";

function root() {
  const attributes = new Map<string, string>();
  return { attributes, setAttribute: (key: string, value: string) => { attributes.set(key, value); }, removeAttribute: (key: string) => { attributes.delete(key); } };
}

describe("pre-paint theme bootstrap", () => {
  it("uses only a validated explicit theme, otherwise leaves OS-controlled CSS in charge", () => {
    for (const theme of ["light", "dark", "system", "<script>", null]) {
      const element = root(), reads: string[] = [];
      runInNewContext(themeBootstrapScript, { localStorage: { getItem: (key: string) => { reads.push(key); return JSON.stringify({ version: 1, appearance: { theme }, apiKey: "SECRET" }); } }, document: { documentElement: element } });
      assert.deepEqual(reads, [WEB_PREFERENCES_KEY]);
      assert.equal(element.attributes.get("data-theme"), theme === "light" || theme === "dark" ? theme : undefined);
      assert.equal(element.attributes.size, theme === "light" || theme === "dark" ? 1 : 0);
    }
  });

  it("keeps loading safe with missing/malformed/versioned/denied storage", () => {
    for (const value of [null, "{", "null", JSON.stringify({ version: 2, appearance: { theme: "dark" } })]) {
      const element = root();
      runInNewContext(themeBootstrapScript, { localStorage: { getItem: () => value }, document: { documentElement: element } });
      assert.equal(element.attributes.size, 0);
    }
    const element = root();
    runInNewContext(themeBootstrapScript, { get localStorage() { throw new Error("storage denied"); }, document: { documentElement: element } });
    assert.equal(element.attributes.size, 0);
  });

  it("changes explicit themes immediately and removes the override for system mode", () => {
    const element = root();
    applyThemePreference(element, "dark");
    assert.equal(element.attributes.get("data-theme"), "dark");
    applyThemePreference(element, "light");
    assert.equal(element.attributes.get("data-theme"), "light");
    applyThemePreference(element, "system");
    assert.equal(element.attributes.has("data-theme"), false, "System mode follows CSS media changes without a stale JS attribute");
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
