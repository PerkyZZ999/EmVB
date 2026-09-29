/**
 * Optional public Tabs keyboard / ARIA runtime (W-078).
 * Hosts load this only when `needsTabsRuntime` is true (R-031).
 * CSS radio + :has() remains the no-JS fallback.
 */

/** The group's own radios, tab labels and panels; nested groups are left out. */
function parts(root: HTMLElement) {
  const all = <T extends HTMLElement>(selector: string) => [
    ...root.querySelectorAll<T>(`:scope > ${selector}`),
  ];
  return {
    inputs: all<HTMLInputElement>(".emvb-tab-input"),
    labels: all(".emvb-tab-list > .emvb-tab-label"),
    panels: all(".emvb-tab-panels > .emvb-tab-panel"),
  };
}

/** Where each navigation key moves from tab `current` of `count`. */
const KEY_TARGETS: Record<string, (current: number, count: number) => number> = {
  ArrowRight: (current) => current + 1,
  ArrowLeft: (current) => current - 1,
  Home: () => 0,
  End: (_current, count) => count - 1,
};

function activate(root: HTMLElement, index: number): void {
  if (root.dataset["emvbTabsActivating"] === "1") return;
  root.dataset["emvbTabsActivating"] = "1";
  try {
    const { inputs, labels, panels } = parts(root);
    if (inputs.length === 0 || labels.length === 0) return;
    const next = ((index % inputs.length) + inputs.length) % inputs.length;
    const input = inputs[next];
    if (!input) return;
    if (!input.checked) input.checked = true;
    for (const [i, label] of labels.entries()) {
      const selected = i === next;
      label.setAttribute("aria-selected", String(selected));
      label.tabIndex = selected ? 0 : -1;
      panels[i]?.setAttribute("aria-hidden", String(!selected));
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
  const checked = parts(root).inputs.findIndex((el) => el.checked);
  return checked >= 0 ? checked : 0;
}

/** Points each tab at its panel and back, giving either an id when it has none. */
function linkTabs(root: HTMLElement, labels: HTMLElement[], panels: HTMLElement[]): void {
  const prefix = root.id || "emvb-tabs";
  for (const [i, label] of labels.entries()) {
    const panel = panels[i];
    const panelId = panel?.id || `${prefix}-panel-${i}`;
    if (panel && !panel.id) panel.id = panelId;
    label.setAttribute("aria-controls", panelId);
    if (panel) {
      if (!label.id) label.id = `${prefix}-tab-${i}`;
      panel.setAttribute("aria-labelledby", label.id);
    }
  }
}

function enhance(root: HTMLElement): void {
  if (root.dataset["emvbTabsReady"] === "1") return;
  root.dataset["emvbTabsReady"] = "1";
  const list = root.querySelector<HTMLElement>(":scope > .emvb-tab-list");
  if (!list) return;
  list.setAttribute("aria-orientation", "horizontal");
  const { labels, panels } = parts(root);
  linkTabs(root, labels, panels);
  activate(root, selectedIndex(root));

  list.addEventListener("keydown", (event) => {
    const target = KEY_TARGETS[event.key];
    if (!target) return;
    event.preventDefault();
    if (labels.length === 0) return;
    activate(root, target(selectedIndex(root), labels.length));
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
