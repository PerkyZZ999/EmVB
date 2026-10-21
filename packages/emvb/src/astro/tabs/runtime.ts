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

/** Selects tab `index`; only keyboard navigation moves focus, never load or a radio change. */
function activate(root: HTMLElement, index: number, focus = false): void {
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
    const focusTarget = focus ? labels[next] : undefined;
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
  const { inputs, labels, panels } = parts(root);
  // W-195: the tabs now take keyboard focus, so the invisible radios leave the Tab order.
  for (const input of inputs) {
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
  }
  linkTabs(root, labels, panels);
  activate(root, selectedIndex(root));

  list.addEventListener("keydown", (event) => {
    // W-675: Alt+Left is the browser's Back; Ctrl/Cmd+Home and friends belong to the browser too.
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    // W-405: in right-to-left text the first tab is on the right, so the arrows swap.
    const rtl = list.closest("[dir]")?.getAttribute("dir")?.toLowerCase() === "rtl";
    const key =
      rtl && event.key === "ArrowRight"
        ? "ArrowLeft"
        : rtl && event.key === "ArrowLeft"
          ? "ArrowRight"
          : event.key;
    const target = KEY_TARGETS[key];
    if (!target) return;
    event.preventDefault();
    if (labels.length === 0) return;
    activate(root, target(selectedIndex(root), labels.length), true);
  });

  // W-779: a click on a tab focused its invisible radio (the label's default), so the arrows that
  // followed moved an unseen focus and Tab stopped on the tab again. Select and focus the tab.
  list.addEventListener("click", (event) => {
    const label = (event.target as Element | null)?.closest?.<HTMLElement>(".emvb-tab-label");
    const index = label ? labels.indexOf(label) : -1;
    if (index < 0 || event.defaultPrevented) return;
    event.preventDefault();
    activate(root, index, true);
  });

  // Keep ARIA in sync when the CSS-only radio path is used (click / label).
  root.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target || !target.classList.contains("emvb-tab-input")) return;
    activate(root, selectedIndex(root));
  });
}

/**
 * W-414: opens every closed tab around `target` (outermost first) so a link to something inside a
 * tab, a table of contents entry most often, lands on it. True when a tab was opened.
 */
function revealInTabs(target: Element): boolean {
  const steps: { root: HTMLElement; index: number }[] = [];
  let panel = target.closest<HTMLElement>(".emvb-tab-panel");
  while (panel) {
    const root = panel.parentElement?.parentElement;
    if (root?.classList.contains("emvb-tabs")) {
      const index = parts(root).panels.indexOf(panel);
      if (index >= 0) steps.unshift({ root, index });
    }
    panel = root?.parentElement?.closest<HTMLElement>(".emvb-tab-panel") ?? null;
  }
  let opened = false;
  for (const { root, index } of steps) {
    if (selectedIndex(root) === index) continue;
    activate(root, index);
    opened = true;
  }
  return opened;
}

function targetOf(hash: string): Element | null {
  if (!hash || hash === "#") return null;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

/** After opening a tab, the browser's own jump already happened, so scroll again. */
function revealHash(hash: string): void {
  const target = targetOf(hash);
  if (!target || !revealInTabs(target)) return;
  target.scrollIntoView?.({ block: "start" });
}

let hashWatch = false;

export function initTabs(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>(".emvb-tabs");
  for (const node of nodes) enhance(node);
  if (hashWatch || typeof window === "undefined") return;
  hashWatch = true;
  // A link to the page's own anchors, then the URL's hash on load and on back/forward.
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#"]');
    if (link) revealHash(link.getAttribute("href") ?? "");
  });
  window.addEventListener("hashchange", () => revealHash(window.location.hash));
  revealHash(window.location.hash);
}

/** Test helper: select tab by index after enhance. */
export function selectTabForTest(root: HTMLElement, index: number): void {
  activate(root, index);
}
