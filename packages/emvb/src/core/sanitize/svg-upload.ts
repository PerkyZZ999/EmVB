import { serialize, type VNode } from "../render/vnode.ts";
import { ICON_SVG_MAX } from "../schema/layout.ts";
import { sanitizeSvgReport } from "./svg.ts";

/**
 * Upload SVG (W-239). An uploaded file is tidied, then run through the same sanitizer as pasted
 * SVG and every render (W-073 / W-231): scripts, event handlers, foreignObject, `<style>`, links
 * and unsafe URLs refuse the file; external `<image>`s are left out. The tidy step only removes
 * what design tools add around the drawing and turns inline `style` paint into attributes; the
 * sanitizer still decides what is kept.
 */

/** The file as picked. Design tools pad SVGs; what's stored is checked against ICON_SVG_MAX. */
export const UPLOAD_SVG_MAX_BYTES = 256 * 1024;

/** An uploaded icon as EmVB stores it (plugin storage `icons`) and lists it. */
export type UploadedIcon = { name: string; svg: string; uploadedAt: string };
export type UploadedIconItem = UploadedIcon & { id: string };

export type PreparedSvg =
  | { ok: true; svg: string; imagesLeftOut: number }
  | { ok: false; message: string };

const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;
const utf8 = (text: string) => new TextEncoder().encode(text).length;

/** Paint properties an inline `style` may carry over as attributes (Inkscape writes them so). */
const STYLE_TO_ATTR = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "clip-rule",
  "stop-color",
  "stop-opacity",
]);
/** Colours, numbers, keywords and `url(#id)`; anything else in a style is dropped. */
const STYLE_VALUE =
  /^(?:#[\da-f]{3,8}|[a-z-]+|-?[\d.]+(?:px|%)?(?:[\s,]+-?[\d.]+(?:px|%)?)*|url\(#[\w.-]+\)|rgba?\([\d\s.,%]+\))$/i;

/** `style="fill:#f00;stroke:none"` → ` fill="#f00" stroke="none"`, skipping attributes already set. */
function styleToAttrs(tag: string): string {
  const has = (name: string) => new RegExp(`\\s${name}\\s*=`, "i").test(tag);
  return tag.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i, (_match, _quoted, dq, sq) => {
    let out = "";
    for (const decl of String(dq ?? sq ?? "").split(";")) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const name = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim();
      if (!STYLE_TO_ATTR.has(name) || !STYLE_VALUE.test(value) || has(name)) continue;
      out += ` ${name}="${value}"`;
    }
    return out;
  });
}

/** What design tools add around the drawing: prolog, comments, doctype, editor metadata. */
export function tidyUploadedSvg(raw: string): string {
  let text = raw.replace(/^\uFEFF/, "");
  text = text.replace(/<\?[\s\S]*?\?>/g, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>/gi, "");
  text = text.replace(/<metadata\b[\s\S]*?<\/metadata\s*>/gi, "");
  text = text.replace(/<metadata\b[^>]*\/>/gi, "");
  // The Icon's title names it; a file's own <title>/<desc> would add a stray tooltip.
  text = text.replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  // Editor elements (sodipodi:namedview, inkscape:grid, …): any prefixed element but svg/xlink.
  text = text.replace(/<((?!svg:|xlink:)[a-z][\w.-]*:[\w.-]+)\b[^>]*\/>/gi, "");
  text = text.replace(/<((?!svg:|xlink:)[a-z][\w.-]*:[\w.-]+)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  // Prefixed attributes and namespace declarations, except xlink:href and xml:space.
  text = text.replace(/<[a-z][^>]*>/gi, (tag) =>
    styleToAttrs(
      tag.replace(
        /\s(?!xlink:href\b|xml:space\b)[a-z][\w.-]*:[\w.-]+\s*=\s*("[^"]*"|'[^']*')/gi,
        "",
      ),
    ),
  );
  return text.trim();
}

/** Why the sanitizer refused a file, as an author can act on it. */
function refusal(text: string): string {
  if (!/<svg\b/i.test(text)) return "This file isn't an SVG. Choose an .svg file.";
  if (/<script\b|\son[a-z]+\s*=|<foreignObject\b|javascript:/i.test(text))
    return "This SVG contains scripts, event handlers or embedded HTML, so EmVB won't use it.";
  if (/<style\b/i.test(text))
    return "This SVG styles its shapes with a <style> block, which icons can't keep. Export it with presentation attributes (Illustrator: Styling → Presentation Attributes; Inkscape: Optimized SVG) and upload it again.";
  return "EmVB couldn't use this SVG: it has parts icons can't keep (links, animations or unsafe URLs) or isn't well formed. Export it again as plain SVG and retry.";
}

const tooBig = (bytes: number): PreparedSvg => ({
  ok: false,
  message: `After cleaning, this SVG is ${kb(bytes)}; an icon can be up to ${kb(ICON_SVG_MAX)}. Simplify it (for example with SVGO) and try again.`,
});

/** Absolute CSS units in px; em and % depend on where the file was drawn, so they can't count. */
const UNIT_PX: Record<string, number> = {
  "": 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};
const LENGTH = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i;

/** A width or height in px (from any absolute unit), or undefined. */
function pxLength(value: string | undefined): number | undefined {
  const match = LENGTH.exec(value ?? "");
  const factor = match ? UNIT_PX[match[2]?.toLowerCase() ?? ""] : undefined;
  if (!match || factor === undefined) return undefined;
  const px = Math.round(Number(match[1]) * factor * 1000) / 1000;
  return px > 0 && Number.isFinite(px) ? px : undefined;
}

/** Four numbers with a positive width and height; any other viewBox draws nothing (W-241). */
function validViewBox(value: string | undefined): boolean {
  const parts = (value ?? "").trim().split(/[\s,]+/);
  if (parts.length !== 4) return false;
  const nums = parts.map(Number);
  const [, , width = 0, height = 0] = nums;
  return nums.every(Number.isFinite) && width > 0 && height > 0;
}

/** Tags that only hold parts for other shapes: an SVG with nothing else draws nothing (W-241). */
const NOT_DRAWN = new Set([
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "filter",
  "symbol",
  "marker",
]);
const GROUPS = new Set(["g", "svg", "a", "switch"]);

function draws(children: readonly (VNode | string)[]): boolean {
  return children.some((child) => {
    if (typeof child === "string") return false;
    const tag = child.tag.toLowerCase();
    if (GROUPS.has(tag)) return draws(child.children);
    // A left-out outside image stays as an empty <image>.
    if (tag === "image") return Boolean(child.attrs.href ?? child.attrs["xlink:href"]);
    return !NOT_DRAWN.has(tag);
  });
}

/**
 * An uploaded file ready to store as an icon: tidied, sanitized, a viewBox (from width and
 * height when missing, so it scales), its own width/height dropped, and within ICON_SVG_MAX.
 */
export function prepareUploadedSvg(raw: string): PreparedSvg {
  const size = utf8(raw);
  if (size > UPLOAD_SVG_MAX_BYTES)
    return {
      ok: false,
      message: `This file is ${kb(size)}. Upload an SVG up to ${kb(UPLOAD_SVG_MAX_BYTES)}.`,
    };
  const text = tidyUploadedSvg(raw);
  // The sanitizer refuses markup over its limit outright; say it's the size.
  if (text.length > ICON_SVG_MAX) return tooBig(utf8(text));
  const report = sanitizeSvgReport(text);
  const tree = report.tree;
  if (!tree) return { ok: false, message: refusal(text) };
  const { width, height, id: _id, class: _class, ...attrs } = tree.attrs;
  if (!validViewBox(attrs.viewBox)) {
    const w = pxLength(width);
    const h = pxLength(height);
    if (w === undefined || h === undefined)
      return {
        ok: false,
        message: attrs.viewBox
          ? "This SVG's viewBox isn't four numbers with a positive width and height, and it has no width and height in px, pt, mm, cm or in to use instead, so it can't be scaled."
          : "This SVG has no viewBox, nor a width and height in px, pt, mm, cm or in, so it can't be scaled.",
      };
    attrs.viewBox = `0 0 ${w} ${h}`;
  }
  if (!draws(tree.children))
    return { ok: false, message: "This SVG has nothing to draw: it has no shapes, paths or text." };
  const svg = serialize({
    tag: "svg",
    attrs: { xmlns: "http://www.w3.org/2000/svg", ...attrs },
    children: tree.children,
  });
  const stored = utf8(svg);
  if (stored > ICON_SVG_MAX) return tooBig(stored);
  return { ok: true, svg, imagesLeftOut: report.images };
}
