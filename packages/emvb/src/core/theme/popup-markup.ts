import { escapeAttr } from "../sanitize/escape.ts";
import type { TriggersDoc } from "./triggers.ts";

/** Minimal chrome styles for public popups (loaded only when popups match). */
export const POPUP_CHROME_CSS = `
.emvb-popup{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1.5rem;box-sizing:border-box}
.emvb-popup[hidden]{display:none!important}
.emvb-popup__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.55)}
.emvb-popup__dialog{position:relative;z-index:1;max-width:min(36rem,100%);max-height:min(90vh,100%);overflow:auto;background:#fff;color:#0f172a;border-radius:.75rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.35);padding:1.5rem 1.5rem 1.25rem}
.emvb-popup__close{position:absolute;top:.5rem;right:.5rem;width:2rem;height:2rem;border:0;border-radius:999px;background:transparent;color:inherit;font-size:1.5rem;line-height:1;cursor:pointer}
.emvb-popup__close:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
.emvb-popup__content{min-width:12rem}
`
  .replace(/\n+/g, "")
  .trim();

export type PopupPublicConfig = {
  id: string;
  triggers: TriggersDoc;
};

/**
 * Wrap rendered popup body HTML with dialog chrome and a JSON config attribute
 * for the optional public runtime (R-031: only loaded when popups are present).
 */
export function wrapPopupMarkup(id: string, bodyHtml: string, triggers: TriggersDoc): string {
  const config: PopupPublicConfig = { id, triggers };
  const configJson = escapeAttr(JSON.stringify(config));
  const safeId = escapeAttr(id);
  const titleId = `emvb-popup-title-${safeId}`;
  return [
    `<div class="emvb-popup" id="emvb-popup-${safeId}" data-emvb-popup="${safeId}" data-emvb-popup-config="${configJson}" hidden>`,
    `<div class="emvb-popup__backdrop" data-emvb-popup-dismiss tabindex="-1"></div>`,
    `<div class="emvb-popup__dialog" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">`,
    `<button type="button" class="emvb-popup__close" data-emvb-popup-dismiss aria-label="Close"><span aria-hidden="true">×</span></button>`,
    `<div class="emvb-popup__content" id="${titleId}">${bodyHtml}</div>`,
    `</div></div>`,
  ].join("");
}
