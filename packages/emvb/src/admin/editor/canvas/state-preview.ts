import type { StyleStateName } from "../../../core/index.ts";

export type StatePreview = { id: string; state: StyleStateName };

/**
 * Shows a style state on the selected canvas element (W-089): the editor-only
 * `data-emvb-state` attribute matches the canvas CSS's state rules, so no pointer or script is needed.
 */
export function applyStatePreview(doc: Document, preview: StatePreview | null): void {
  for (const element of doc.querySelectorAll("[data-emvb-state]")) {
    if (element.getAttribute("data-emvb-id") !== preview?.id) {
      element.removeAttribute("data-emvb-state");
    }
  }
  if (!preview) return;
  doc
    .querySelector(`[data-emvb-id="${CSS.escape(preview.id)}"]`)
    ?.setAttribute("data-emvb-state", preview.state);
}
