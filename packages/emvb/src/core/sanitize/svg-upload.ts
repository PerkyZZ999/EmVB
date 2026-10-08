import { serialize } from "../render/vnode.ts";
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

const NUMBER = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/;

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
  if (!attrs.viewBox) {
    const w = NUMBER.exec(width ?? "")?.[1];
    const h = NUMBER.exec(height ?? "")?.[1];
    if (!w || !h || Number(w) === 0 || Number(h) === 0)
      return {
        ok: false,
        message: "This SVG has no viewBox, nor a width and height in px, so it can't be scaled.",
      };
    attrs.viewBox = `0 0 ${w} ${h}`;
  }
  const svg = serialize({
    tag: "svg",
    attrs: { xmlns: "http://www.w3.org/2000/svg", ...attrs },
    children: tree.children,
  });
  const stored = utf8(svg);
  if (stored > ICON_SVG_MAX) return tooBig(stored);
  return { ok: true, svg, imagesLeftOut: report.images };
}
