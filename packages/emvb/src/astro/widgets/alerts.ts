/**
 * W-1025: the opt-in Alert runtime. It shows each dismissible Alert's close button (hidden until
 * this script runs, so a page without it never shows a button that does nothing) and hides the
 * Alert when it is pressed, moving focus to the next thing a keyboard reaches.
 */

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']), summary, iframe";

/** The first focusable element after `from` in the document, else the last one before it. */
function neighbour(from: Element): HTMLElement | null {
  const all = [...from.ownerDocument.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !from.contains(el) && !el.closest("[hidden]"),
  );
  const after = all.find(
    (el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  return (
    after ??
    all.findLast((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) ??
    null
  );
}

export function initAlerts(root: ParentNode = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-emvb-alert-dismiss]")) {
    if (button.dataset["emvbReady"] !== undefined) continue;
    button.dataset["emvbReady"] = "";
    button.addEventListener("click", () => {
      const alert = button.closest<HTMLElement>(".emvb-alert");
      if (!alert) return;
      const next = neighbour(alert);
      alert.hidden = true;
      next?.focus();
    });
  }
}
