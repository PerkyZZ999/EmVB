/**
 * Optional public Menu script (W-197). Menus are `<details>` disclosures and work without it;
 * this adds Escape (it closes the open dropdown the focus or pointer is in and returns focus to
 * that dropdown's toggle) and closes an open dropdown when focus or a click lands outside its
 * menu item (W-254). Hosts load it when `needsMenuRuntime` is true.
 */
const OPEN = "details.emvb-menu-item__disclosure[open]";
const DISMISSED = "emvbMenuDismissed";

/** W-783: the menu items under the pointer, so Escape can hide a hover-shown panel. */
let pointerOver: Element | null = null;

function itemsAround(node: Element | null): HTMLElement[] {
  const items: HTMLElement[] = [];
  let item = node?.closest<HTMLElement>(".emvb-menu .emvb-menu-item") ?? null;
  while (item) {
    items.push(item);
    item = item.parentElement?.closest<HTMLElement>(".emvb-menu .emvb-menu-item") ?? null;
  }
  return items;
}

/** Forget a dismissal once the pointer or focus is somewhere else. */
function clearDismissed(target: Node | null): void {
  for (const item of document.querySelectorAll<HTMLElement>("[data-emvb-menu-dismissed]")) {
    if (target && item.contains(target)) continue;
    delete item.dataset[DISMISSED];
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const active = document.activeElement;
  const inside = active instanceof Element ? active.closest<HTMLDetailsElement>(OPEN) : null;
  const target = inside ?? document.querySelector<HTMLDetailsElement>(`.emvb-menu ${OPEN}`);
  // W-783: a panel shown by hover stayed up after Escape until the pointer moved away.
  const hovered = itemsAround(pointerOver);
  for (const item of hovered) item.dataset[DISMISSED] = "1";
  if (!target) {
    if (hovered.length > 0) event.preventDefault();
    return;
  }
  target.open = false;
  target.querySelector<HTMLElement>(":scope > summary")?.focus({ preventScroll: true });
  event.preventDefault();
}

/** W-254: an open dropdown closes once focus or a pointer press lands outside its menu item. */
function closeOthers(event: Event): void {
  const target = event.target instanceof Node ? event.target : null;
  clearDismissed(target);
  for (const details of document.querySelectorAll<HTMLDetailsElement>(`.emvb-menu ${OPEN}`)) {
    const item = details.closest(".emvb-menu-item") ?? details;
    if (target && item.contains(target)) continue;
    details.open = false;
  }
}

export function initMenus(root: Document = document): void {
  const marked = root.documentElement;
  if (marked.dataset["emvbMenuReady"] === "1") return;
  marked.dataset["emvbMenuReady"] = "1";
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("focusin", closeOthers);
  root.addEventListener("pointerdown", closeOthers);
  root.addEventListener("pointerover", (event) => {
    pointerOver = event.target instanceof Element ? event.target : null;
    clearDismissed(pointerOver);
  });
}
