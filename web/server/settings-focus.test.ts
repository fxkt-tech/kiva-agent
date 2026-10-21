import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { restoreSettingsFocus, settingsTabStops } from "../features/settings/focus";

// Minimal DOM seam: deliberately retain layout boxes for closed disclosures/drawers,
// so passing these tests requires semantic visibility checks, not a rectangle shortcut.
class ElementFixture {
  children: ElementFixture[] = [];
  parentElement: ElementFixture | null = null;
  isConnected = true;
  tabIndex = 0;
  rendered = true;
  disabled = false;
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
  matches(selector: string) {
    assert.equal(selector, ":disabled");
    return this.disabled || Boolean(this.parentElement?.tagName === "FIELDSET" && this.parentElement.disabled);
  }
  querySelectorAll(selector: string) {
    assert.match(selector, /summary/);
    const all = this.children.flatMap((child) => [child, ...child.descendants()]);
    return all.filter((child) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A", "SUMMARY"].includes(child.tagName) || child.hasAttribute("tabindex"));
  }
  descendants(): ElementFixture[] { return this.children.flatMap((child) => [child, ...child.descendants()]); }
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

it("settings Tab boundaries include summaries but exclude closed, hidden, disabled and negative-tabindex controls", () => {
  const doc = new DocumentFixture(), scope = new ElementFixture("SECTION", doc);
  const close = scope.append(new ElementFixture("BUTTON", doc));
  const hiddenPanel = scope.append(new ElementFixture("SECTION", doc)); hiddenPanel.attributes.add("hidden"); hiddenPanel.append(new ElementFixture("INPUT", doc));
  const details = scope.append(new ElementFixture("DETAILS", doc));
  const summary = details.append(new ElementFixture("SUMMARY", doc));
  details.append(new ElementFixture("INPUT", doc));
  const negative = scope.append(new ElementFixture("BUTTON", doc)); negative.tabIndex = -1;
  const fieldset = scope.append(new ElementFixture("FIELDSET", doc)); fieldset.disabled = true; fieldset.append(new ElementFixture("INPUT", doc));
  const hidden = scope.append(new ElementFixture("A", doc)); hidden.style.visibility = "hidden";
  const absent = scope.append(new ElementFixture("INPUT", doc)); absent.rendered = false;
  const stops = settingsTabStops(scope.element());
  assert.deepEqual(stops, [close, summary]);
  details.attributes.add("open");
  assert.deepEqual(settingsTabStops(scope.element()), [close, summary, details.children[1]]);
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
