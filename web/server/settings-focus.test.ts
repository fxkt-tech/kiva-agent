import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { restoreSettingsFocus } from "../features/settings/focus";

// Minimal DOM seam: deliberately retain layout boxes for closed disclosures/drawers,
// so passing these tests requires semantic visibility checks, not a rectangle shortcut.
class ElementFixture {
  children: ElementFixture[] = [];
  parentElement: ElementFixture | null = null;
  isConnected = true;
  rendered = true;
  focusSucceeds = true;
  className = "";
  attributes = new Set<string>();
  style = { display: "block", visibility: "visible" };
  constructor(readonly tagName: string, readonly ownerDocument: DocumentFixture) {}
  append(child: ElementFixture) { child.parentElement = this; this.children.push(child); return child; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  closest(selector: string): ElementFixture | null {
    for (let current: ElementFixture | null = this; current; current = current.parentElement) {
      if (selector === "[hidden], [inert]" ? current.hasAttribute("hidden") || current.hasAttribute("inert") : current.className.split(" ").includes(selector.slice(1))) return current;
    } return null;
  }
  contains(node: ElementFixture | null): boolean { return node === this || this.children.some((child) => child.contains(node)); }
  getClientRects() { return this.rendered ? [{}] : []; }
  focus() { if (this.focusSucceeds) this.ownerDocument.activeElement = this; }
  element() { return this as unknown as HTMLElement; }
}
class DocumentFixture {
  activeElement: ElementFixture | null = null;
  navigation?: ElementFixture;
  settings?: ElementFixture;
  defaultView = { getComputedStyle: (node: ElementFixture) => node.style };
  querySelector(selector: string) { return selector === ".workspace-navigation-toggle" ? this.navigation : this.settings; }
  document() { return this as unknown as Document; }
}
const originalHTMLElement = globalThis.HTMLElement;
afterEach(() => {
  if (originalHTMLElement === undefined) Reflect.deleteProperty(globalThis, "HTMLElement");
  else Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: originalHTMLElement });
});

it("settings focus restoration skips closed disclosure descendants while retaining the visible summary", () => {
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: ElementFixture });
  const doc = new DocumentFixture(); doc.navigation = new ElementFixture("BUTTON", doc);
  const details = new ElementFixture("DETAILS", doc);
  const summary = details.append(new ElementFixture("SUMMARY", doc));
  const input = details.append(new ElementFixture("INPUT", doc));
  restoreSettingsFocus(input.element(), doc.document()); assert.equal(doc.activeElement, doc.navigation);
  restoreSettingsFocus(summary.element(), doc.document()); assert.equal(doc.activeElement, summary);
  details.attributes.add("open");
  restoreSettingsFocus(input.element(), doc.document()); assert.equal(doc.activeElement, input);
});

it("mobile settings focus restores navigation even during the closed drawer's visibility transition", () => {
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: ElementFixture });
  const doc = new DocumentFixture();
  const workbench = new ElementFixture("MAIN", doc); workbench.className = "workbench";
  const sidebar = workbench.append(new ElementFixture("ASIDE", doc)); sidebar.className = "sidebar";
  const trigger = sidebar.append(new ElementFixture("BUTTON", doc)); trigger.className = "sidebar-settings";
  doc.settings = trigger; doc.navigation = new ElementFixture("BUTTON", doc);
  assert.equal(trigger.style.visibility, "visible"); assert.equal(trigger.getClientRects().length, 1);
  restoreSettingsFocus(trigger.element(), doc.document()); assert.equal(doc.activeElement, doc.navigation);
  doc.navigation.rendered = false; doc.activeElement = null;
  restoreSettingsFocus(trigger.element(), doc.document()); assert.equal(doc.activeElement, trigger, "desktop restores the still-visible footer trigger");
});

it("failed focus restoration falls back to the visible navigation instead of claiming success", () => {
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: ElementFixture });
  const doc = new DocumentFixture(), previous = new ElementFixture("INPUT", doc);
  previous.focusSucceeds = false; doc.navigation = new ElementFixture("BUTTON", doc);
  restoreSettingsFocus(previous.element(), doc.document()); assert.equal(doc.activeElement, doc.navigation);
});
