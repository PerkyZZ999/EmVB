/** What Tab can land on inside the editor. */
const TABBABLE = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
  "[contenteditable='true']",
].join(",");

/** Visible, enabled, in the tab order, and not one of Base UI's focus guards. */
export function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => {
    if (el.hasAttribute("data-base-ui-focus-guard")) return false;
    if (el.tabIndex < 0) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    if (el instanceof HTMLInputElement && el.type === "hidden") return false;
    if (el.closest("[inert],[hidden]")) return false;
    return el.getClientRects().length > 0;
  });
}

/**
 * W-984: Tab past the last control goes to the first, Shift+Tab before the first goes to the
 * last. The dialog's own trap uses focus guards that, in the production build, sometimes let
 * focus fall to the page behind; wrapping here means Tab never reaches them. Returns whether it
 * moved focus (and stopped the key).
 */
export function wrapTab(event: KeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return false;
  const items = tabbablesIn(root);
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return false;
  const active = root.ownerDocument.activeElement;
  const target = event.shiftKey
    ? active === first || !root.contains(active)
      ? last
      : null
    : active === last || !root.contains(active)
      ? first
      : null;
  if (!target) return false;
  event.preventDefault();
  target.focus();
  return true;
}

/** An open EmVB dialog (Kumo/Base UI popup with EmVB content) around `el`, if any. */
export function emvbDialogOf(el: Element | null): HTMLElement | null {
  const dialog = el?.closest<HTMLElement>('[role="dialog"],[role="alertdialog"]') ?? null;
  if (!dialog) return null;
  const ours =
    dialog.matches("[data-emvb-image-editor-popup]") ||
    dialog.querySelector('[data-emvb-dialog],.emvb-dialog,[class*="emvb-"]') !== null;
  return ours ? dialog : null;
}

let installed = false;

/**
 * W-984: one Tab handler for every EmVB dialog, installed once with the admin. EmDash's own
 * dialogs are left alone.
 */
export function installDialogTabWrap(doc: Document): void {
  if (installed) return;
  installed = true;
  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const dialog = emvbDialogOf(doc.activeElement);
      if (dialog) wrapTab(event, dialog);
    },
    true,
  );
}
