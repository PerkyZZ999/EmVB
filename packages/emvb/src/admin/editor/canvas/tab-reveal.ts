/** The group's own radios and panels; nested groups are left out. */
const own = (tabs: Element) => ({
  inputs: [...tabs.querySelectorAll<HTMLInputElement>(":scope > .emvb-tab-input")],
  labels: [...tabs.querySelectorAll(":scope > .emvb-tab-list > .emvb-tab-label")],
  panels: [...tabs.querySelectorAll(":scope > .emvb-tab-panels > .emvb-tab-panel")],
});

/**
 * Checks the tab radios that show element `id` on the canvas, so an element selected inside a
 * hidden tab panel (from Layers, or a tab label) appears. The canvas has no tabs script (D-011).
 */
export function revealInTabs(doc: Document, id: string | null): void {
  if (!id) return;
  const element = doc.querySelector(`[data-emvb-id="${CSS.escape(id)}"]`);
  for (
    let panel = element?.closest(".emvb-tab-panel");
    panel;
    panel = panel.parentElement?.closest(".emvb-tab-panel")
  ) {
    const tabs = panel.closest(".emvb-tabs");
    if (!tabs) continue;
    const { inputs, panels } = own(tabs);
    const input = inputs[panels.indexOf(panel)];
    if (input && !input.checked) input.checked = true;
  }
}

/** The tab panel a click on its tab label stands for, since labels carry no element id. */
export function tabPanelIdForLabel(target: EventTarget | null): string | null {
  const label = (target as Element | null)?.closest?.(".emvb-tab-label");
  const tabs = label?.closest(".emvb-tabs");
  if (!label || !tabs) return null;
  const { labels, panels } = own(tabs);
  return panels[labels.indexOf(label)]?.getAttribute("data-emvb-id") ?? null;
}

const AUTO_OPEN = "data-emvb-auto-open";

/**
 * Opens the closed accordion items that hold element `id` on the canvas, so it can be seen and
 * edited, and closes the ones it opened before once the selection leaves them. Canvas only: the
 * saved Open setting is untouched (W-130).
 */
export function revealInAccordions(
  doc: Document,
  id: string | null,
  savedOpen: (itemId: string) => boolean = () => false,
): void {
  const element = id ? doc.querySelector(`[data-emvb-id="${CSS.escape(id)}"]`) : null;
  const holders = new Set<HTMLDetailsElement>();
  for (
    let item = element?.closest<HTMLDetailsElement>("details.emvb-accordion-item");
    item;
    item = item.parentElement?.closest<HTMLDetailsElement>("details.emvb-accordion-item")
  ) {
    holders.add(item);
  }
  for (const item of doc.querySelectorAll<HTMLDetailsElement>(`details[${AUTO_OPEN}]`)) {
    if (holders.has(item)) continue;
    item.removeAttribute(AUTO_OPEN);
    // Open was switched on while we held it open: leave it open.
    if (!savedOpen(item.getAttribute("data-emvb-id") ?? "")) item.open = false;
  }
  for (const item of holders) {
    if (item.open) continue;
    item.setAttribute(AUTO_OPEN, "");
    item.open = true;
  }
}

/**
 * Opens the menu disclosures that hold element `id` on the canvas, and closes the ones it
 * opened before once the selection leaves them. The public page stays closed until the visitor
 * opens it.
 */
export function revealInMenus(doc: Document, id: string | null): void {
  const element = id ? doc.querySelector(`[data-emvb-id="${CSS.escape(id)}"]`) : null;
  const holders = new Set<HTMLDetailsElement>();
  for (
    let item = element?.closest("li.emvb-menu-item");
    item;
    item = item.parentElement?.closest("li.emvb-menu-item")
  ) {
    const details = item.querySelector<HTMLDetailsElement>(
      ":scope > .emvb-menu-item__bar > details",
    );
    if (details) holders.add(details);
  }
  for (const details of doc.querySelectorAll<HTMLDetailsElement>(
    `details.emvb-menu-item__disclosure[${AUTO_OPEN}]`,
  )) {
    if (holders.has(details)) continue;
    details.removeAttribute(AUTO_OPEN);
    details.open = false;
  }
  for (const details of holders) {
    if (details.open) continue;
    details.setAttribute(AUTO_OPEN, "");
    details.open = true;
  }
}
