/**
 * Optional public Menu script (W-197). Menus are `<details>` disclosures and work without it;
 * this only adds Escape: it closes the open dropdown the focus or pointer is in and returns
 * focus to that dropdown's toggle. Hosts load it when `needsMenuRuntime` is true.
 */
const OPEN = "details.emvb-menu-item__disclosure[open]";

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const active = document.activeElement;
  const inside = active instanceof Element ? active.closest<HTMLDetailsElement>(OPEN) : null;
  const target = inside ?? document.querySelector<HTMLDetailsElement>(`.emvb-menu ${OPEN}`);
  if (!target) return;
  target.open = false;
  target.querySelector<HTMLElement>(":scope > summary")?.focus({ preventScroll: true });
  event.preventDefault();
}

export function initMenus(root: Document = document): void {
  const marked = root.documentElement;
  if (marked.dataset["emvbMenuReady"] === "1") return;
  marked.dataset["emvbMenuReady"] = "1";
  root.addEventListener("keydown", onKeydown);
}
