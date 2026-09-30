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
