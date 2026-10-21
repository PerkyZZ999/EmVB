import { clipText } from "../limits.ts";
import { escapeAttr } from "../sanitize/escape.ts";
import type { TriggersDoc } from "./triggers.ts";

/**
 * Minimal chrome styles for public popups (loaded only when popups match). W-758: the close
 * button sticks to the top of a long popup (it scrolled away with the content on phones) and
 * floats, so a long heading wraps beside it instead of running under it.
 */
export const POPUP_CHROME_CSS = `
.emvb-popup{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1.5rem;box-sizing:border-box}
.emvb-popup[hidden]{display:none!important}
.emvb-popup__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.55)}
.emvb-popup__dialog{position:relative;z-index:1;max-width:min(36rem,100%);max-height:min(90vh,100%);overflow:auto;background:#fff;color:#0f172a;border-radius:.75rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.35);padding:1.5rem 1.5rem 1.25rem}
.emvb-popup__close{position:sticky;top:-1rem;z-index:1;float:right;margin:-1rem -1rem 0 .5rem;width:2rem;height:2rem;border:0;border-radius:999px;background:inherit;color:inherit;font-size:1.5rem;line-height:1;cursor:pointer}
.emvb-popup__close:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
.emvb-popup__content{min-width:12rem}
`
  .replace(/\n+/g, "")
  .trim();

/** Screen reader names for popup and float chrome; unset are "Popup" and "Close" (W-690). */
export type ChromeLabels = { popup?: string; close?: string };

/** A label clipped to 80 characters and escaped for an attribute, or the English fallback. */
export const chromeLabel = (text: string | undefined, fallback: string) =>
  escapeAttr(clipText(text?.trim() ?? "", 80) || fallback);

export type PopupPublicConfig = {
  id: string;
  triggers: TriggersDoc;
};

/**
 * Wrap rendered popup body HTML with dialog chrome and a JSON config attribute
 * for the optional public runtime (R-031: only loaded when popups are present).
 */
export function wrapPopupMarkup(
  id: string,
  bodyHtml: string,
  triggers: TriggersDoc,
  /** W-690: the dialog's fallback name and the close button's name, in the site's language. */
  labels: ChromeLabels = {},
): string {
  const config: PopupPublicConfig = { id, triggers };
  const configJson = escapeAttr(JSON.stringify(config));
  const safeId = escapeAttr(id);
  const titleId = `emvb-popup-title-${safeId}`;
  return [
    `<div class="emvb-popup" id="emvb-popup-${safeId}" data-emvb-popup="${safeId}" data-emvb-popup-config="${configJson}" hidden>`,
    `<div class="emvb-popup__backdrop" data-emvb-popup-dismiss tabindex="-1"></div>`,
    // W-282: named "Popup" until the runtime points the name at the content's first heading;
    // naming it after the whole content read every word as the dialog's name.
    `<div class="emvb-popup__dialog" role="dialog" aria-modal="true" aria-label="${chromeLabel(labels.popup, "Popup")}" tabindex="-1">`,
    `<button type="button" class="emvb-popup__close" data-emvb-popup-dismiss aria-label="${chromeLabel(labels.close, "Close")}"><span aria-hidden="true">×</span></button>`,
    `<div class="emvb-popup__content" id="${titleId}">${bodyHtml}</div>`,
    `</div></div>`,
  ].join("");
}
