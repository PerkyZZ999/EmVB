/**
 * Optional public Tabs keyboard / ARIA runtime (W-078).
 * Hosts load this only when `needsTabsRuntime` is true (R-031).
 * CSS radio + :has() remains the no-JS fallback.
 */

function activate(root: HTMLElement, index: number): void {
  if (root.dataset["emvbTabsActivating"] === "1") return;
  root.dataset["emvbTabsActivating"] = "1";
  try {
    const inputs = [...root.querySelectorAll<HTMLInputElement>(":scope > .emvb-tab-input")];
    const labels = [
      ...root.querySelectorAll<HTMLElement>(":scope > .emvb-tab-list > .emvb-tab-label"),
    ];
    const panels = [
      ...root.querySelectorAll<HTMLElement>(":scope > .emvb-tab-panels > .emvb-tab-panel"),
    ];
    if (inputs.length === 0 || labels.length === 0) return;
    const next = ((index % inputs.length) + inputs.length) % inputs.length;
    const input = inputs[next];
    if (!input) return;
    if (!input.checked) input.checked = true;
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const panel = panels[i];
      const selected = i === next;
      if (label) {
        label.setAttribute("aria-selected", selected ? "true" : "false");
        label.tabIndex = selected ? 0 : -1;
      }
      if (panel) {
        panel.setAttribute("aria-hidden", selected ? "false" : "true");
      }
    }
    const focusTarget = labels[next];
    if (focusTarget && document.activeElement !== focusTarget) {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch {
        // focus may fail in non-interactive test hosts
      }
    }
  } finally {
    delete root.dataset["emvbTabsActivating"];
  }
}

function selectedIndex(root: HTMLElement): number {
  const inputs = [...root.querySelectorAll<HTMLInputElement>(":scope > .emvb-tab-input")];
  const checked = inputs.findIndex((el) => el.checked);
  return checked >= 0 ? checked : 0;
}

function enhance(root: HTMLElement): void {
  if (root.dataset["emvbTabsReady"] === "1") return;
  root.dataset["emvbTabsReady"] = "1";
  const list = root.querySelector<HTMLElement>(":scope > .emvb-tab-list");
  if (!list) return;
  list.setAttribute("aria-orientation", "horizontal");
  const labels = [
    ...root.querySelectorAll<HTMLElement>(":scope > .emvb-tab-list > .emvb-tab-label"),
  ];
  const panels = [
    ...root.querySelectorAll<HTMLElement>(":scope > .emvb-tab-panels > .emvb-tab-panel"),
  ];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const panel = panels[i];
    if (!label) continue;
    const panelId = panel?.id || `${root.id || "emvb-tabs"}-panel-${i}`;
    if (panel && !panel.id) panel.id = panelId;
    label.setAttribute("aria-controls", panelId);
    if (panel) {
      const labelId = label.id || `${root.id || "emvb-tabs"}-tab-${i}`;
      if (!label.id) label.id = labelId;
      panel.setAttribute("aria-labelledby", labelId);
    }
  }
  activate(root, selectedIndex(root));

  list.addEventListener("keydown", (event) => {
    const key = event.key;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") {
      return;
    }
    event.preventDefault();
    const current = selectedIndex(root);
    const count = labels.length;
    if (count === 0) return;
    if (key === "ArrowRight") activate(root, current + 1);
    else if (key === "ArrowLeft") activate(root, current - 1);
    else if (key === "Home") activate(root, 0);
    else activate(root, count - 1);
  });

  // Keep ARIA in sync when the CSS-only radio path is used (click / label).
  root.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target || !target.classList.contains("emvb-tab-input")) return;
    activate(root, selectedIndex(root));
  });
}

export function initTabs(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>(".emvb-tabs");
  for (const node of nodes) enhance(node);
}

/** Test helper: select tab by index after enhance. */
export function selectTabForTest(root: HTMLElement, index: number): void {
  activate(root, index);
}
