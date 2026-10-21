/** Layout boxes alone do not imply visibility: a closed drawer can retain its box. */
function isVisible(node: HTMLElement): boolean {
  if (!node.isConnected || node.closest("[hidden], [inert]") || !node.getClientRects().length) return false;
  const style = node.ownerDocument.defaultView?.getComputedStyle(node);
  if (style?.visibility === "hidden" || style?.visibility === "collapse" || style?.display === "none") return false;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName !== "DETAILS" || parent.hasAttribute("open")) continue;
    const summary = Array.from(parent.children).find((child) => child.tagName === "SUMMARY");
    if (!summary?.contains(node)) return false;
  }
  return true;
}

/** Native summaries participate in Tab order; descendants of closed details do not. */
export function settingsTabStops(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], summary, [tabindex]"))
    .filter((node) => node.tabIndex >= 0 && !node.matches(":disabled") && isVisible(node))
    .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
}

export function restoreSettingsFocus(previous: Element | null, owner: Document): void {
  const navigation = owner.querySelector<HTMLButtonElement>(".workspace-navigation-toggle");
  if (previous instanceof HTMLElement && previous.isConnected) {
    const sidebar = previous.closest(".sidebar");
    // Mobile closing transitions may retain both boxes and visibility for 180ms.
    // The shell's drawer state, not the transition frame, determines accessibility.
    const closedDrawer = sidebar && !sidebar.closest(".sidebar-mobile-open") && navigation && isVisible(navigation);
    if (!closedDrawer && isVisible(previous)) {
      previous.focus({ preventScroll: true });
      if (owner.activeElement === previous) return;
    }
  }
  const fallback = navigation && isVisible(navigation) ? navigation : owner.querySelector<HTMLButtonElement>(".sidebar-settings");
  if (fallback && isVisible(fallback)) fallback.focus({ preventScroll: true });
}
