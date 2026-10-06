import { z } from "zod";
import { escapeAttr } from "../sanitize/escape.ts";
import { parseDoc, type DocIssue } from "./parse-doc.ts";

const FLOAT_SCHEMA_VERSION = 1;

/** Where a float sits. Start and end follow the page's writing direction. */
export const FLOAT_EDGES = [
  "top",
  "bottom",
  "start-top",
  "end-top",
  "start-bottom",
  "end-bottom",
] as const;

export type FloatEdge = (typeof FLOAT_EDGES)[number];

const FloatSettingsSchema = z.strictObject({
  schemaVersion: z.literal(FLOAT_SCHEMA_VERSION),
  edge: z.enum(FLOAT_EDGES),
  dismiss: z.boolean(),
});

export type FloatSettings = z.infer<typeof FloatSettingsSchema>;

export type FloatValidation =
  | { ok: true; settings: FloatSettings }
  | { ok: false; issues: DocIssue[] };

/** A top bar, kept until the author turns on a close button. */
export function defaultFloatSettings(): FloatSettings {
  return { schemaVersion: FLOAT_SCHEMA_VERSION, edge: "top", dismiss: false };
}

export function validateFloatSettings(raw: unknown): FloatValidation {
  const parsed = parseDoc(raw, FloatSettingsSchema, "float", "Float settings");
  return parsed.ok ? { ok: true, settings: parsed.doc } : parsed;
}

/**
 * Chrome for pinned bars and corner floats. Loaded only when a float matches.
 * Bars reserve their height through the two custom properties the runtime sets.
 */
export const FLOAT_CHROME_CSS = `
.emvb-float{position:fixed;z-index:9000;box-sizing:border-box;max-width:100%;display:flex;align-items:flex-start;gap:.35rem}
.emvb-float[hidden]{display:none!important}
.emvb-float--top{top:0;inset-inline:0}
.emvb-float--bottom{bottom:0;inset-inline:0}
.emvb-float--start-top{top:1rem;inset-inline-start:1rem}
.emvb-float--end-top{top:1rem;inset-inline-end:1rem}
.emvb-float--start-bottom{bottom:1rem;inset-inline-start:1rem}
.emvb-float--end-bottom{bottom:1rem;inset-inline-end:1rem}
.emvb-float__body{min-width:0;flex:1}
.emvb-float__close{flex:none;width:2rem;height:2rem;border:0;border-radius:999px;background:transparent;color:inherit;font-size:1.5rem;line-height:1;cursor:pointer}
.emvb-float__close:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
html{--emvb-float-top:0px;--emvb-float-bottom:0px}
body{padding-top:var(--emvb-float-top);padding-bottom:var(--emvb-float-bottom)}
`
  .replace(/\n+/g, "")
  .trim();

/**
 * Pin rendered float HTML. Not a dialog: no backdrop and no focus trap.
 * A close button is present only when dismiss is on.
 */
export function wrapFloatMarkup(
  id: string,
  title: string,
  bodyHtml: string,
  settings: FloatSettings,
): string {
  const safeId = escapeAttr(id);
  const label = escapeAttr(title.trim() || "Notice");
  const edge = settings.edge;
  const close = settings.dismiss
    ? `<button type="button" class="emvb-float__close" data-emvb-float-dismiss aria-label="Close"><span aria-hidden="true">×</span></button>`
    : "";
  return [
    `<aside class="emvb-float emvb-float--${edge}" id="emvb-float-${safeId}" data-emvb-float="${safeId}" data-emvb-float-edge="${edge}" role="region" aria-label="${label}">`,
    `<div class="emvb-float__body">${bodyHtml}</div>`,
    close,
    `</aside>`,
  ].join("");
}
