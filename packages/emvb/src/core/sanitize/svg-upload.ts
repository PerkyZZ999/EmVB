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
  const seen = new Map<string, boolean>();
  const has = (name: string) => {
    let found = seen.get(name);
    if (found === undefined) {
      found = new RegExp(`\\s${name}\\s*=`, "i").test(tag);
      seen.set(name, found);
    }
    return found;
  };
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

/*
 * S-07: the tidy step scans left to right with indexOf, so a crafted file costs time in
 * proportion to its size. Lazy regexes rescanned to the end of the file for every unclosed
 * opener (seconds per 256 KB request). A construct that never closes means the file isn't well
 * formed, and it's refused.
 */

const WORD = /\w/;
const SPACE = /\s/;
const NAME_CHAR = /[\w.-]/;
const isWord = (c: string | undefined) => c !== undefined && WORD.test(c);

/** A file that isn't well formed. */
const MALFORMED = Symbol("malformed");
type Pass = string | typeof MALFORMED;

/** Removes every `open … close` (shortest match). */
function removeBetween(s: string, open: string, close: string): Pass {
  let out = "";
  let pos = 0;
  for (;;) {
    const start = s.indexOf(open, pos);
    if (start < 0) return out + s.slice(pos);
    const end = s.indexOf(close, start + open.length);
    if (end < 0) return MALFORMED;
    out += s.slice(pos, start);
    pos = end + close.length;
  }
}

/** The end of `</name\s*>` (its `>`) at or after `from`, case-insensitively, or -1. */
function closerEnd(s: string, lower: string, name: string, from: number): number {
  const opener = `</${name}`;
  for (let at = lower.indexOf(opener, from); at >= 0; at = lower.indexOf(opener, at + 1)) {
    let k = at + opener.length;
    while (k < s.length && SPACE.test(s.charAt(k))) k++;
    if (s.charAt(k) === ">") return k;
  }
  return -1;
}

/** `<!DOCTYPE …>`, with or without an internal subset in brackets. */
function removeDoctype(s: string): Pass {
  const lower = s.toLowerCase();
  let out = "";
  let pos = 0;
  for (;;) {
    const start = lower.indexOf("<!doctype", pos);
    if (start < 0) return out + s.slice(pos);
    let k = start + 9;
    while (k < s.length && s[k] !== "[" && s[k] !== ">") k++;
    if (k >= s.length) return MALFORMED;
    if (s[k] === "[") {
      let end = -1;
      for (let close = s.indexOf("]", k + 1); close >= 0; close = s.indexOf("]", close + 1)) {
        let m = close + 1;
        while (m < s.length && SPACE.test(s.charAt(m))) m++;
        if (s[m] === ">") {
          end = m;
          break;
        }
      }
      if (end < 0) return MALFORMED;
      k = end;
    }
    out += s.slice(pos, start);
    pos = k + 1;
  }
}

/** The next `<name` at or after `from` that ends on a word boundary, or -1. */
function nextOpener(s: string, lower: string, name: string, from: number): number {
  for (let at = lower.indexOf(`<${name}`, from); at >= 0; at = lower.indexOf(`<${name}`, at + 1))
    if (!isWord(s[at + name.length + 1])) return at;
  return -1;
}

/** `<metadata>…</metadata>` and `<metadata/>`. */
function removeMetadata(s: string): Pass {
  let lower = s.toLowerCase();
  let out = "";
  let pos = 0;
  for (;;) {
    const start = nextOpener(s, lower, "metadata", pos);
    if (start < 0) break;
    const end = closerEnd(s, lower, "metadata", start + 9);
    if (end < 0) break;
    out += s.slice(pos, start);
    pos = end + 1;
  }
  const paired = out + s.slice(pos);
  lower = paired.toLowerCase();
  out = "";
  pos = 0;
  for (let from = 0; ;) {
    const start = nextOpener(paired, lower, "metadata", from);
    if (start < 0) return out + paired.slice(pos);
    const gt = paired.indexOf(">", start + 9);
    if (gt < 0 || paired[gt - 1] !== "/" || gt - 1 < start + 9) return MALFORMED;
    out += paired.slice(pos, start);
    pos = gt + 1;
    from = pos;
  }
}

/** `<title>…</title>` and `<desc>…</desc>`: the Icon's title names it. */
function removeTitles(s: string): Pass {
  const lower = s.toLowerCase();
  let out = "";
  let pos = 0;
  let title = -1;
  let desc = -1;
  const next = (name: string, at: number) => {
    // A search starts where the last match ended, so a far opener isn't searched for again.
    if (at >= pos) return at;
    const found = nextOpener(s, lower, name, pos);
    return found < 0 ? Number.POSITIVE_INFINITY : found;
  };
  for (;;) {
    title = next("title", title);
    desc = next("desc", desc);
    const start = Math.min(title, desc);
    if (start === Number.POSITIVE_INFINITY) return out + s.slice(pos);
    const name = start === title ? "title" : "desc";
    const gt = s.indexOf(">", start + name.length + 1);
    if (gt < 0) return MALFORMED;
    const end = closerEnd(s, lower, name, gt + 1);
    if (end < 0) return MALFORMED;
    out += s.slice(pos, start);
    pos = end + 1;
  }
}

/**
 * An editor element's name at `<` (sodipodi:namedview, inkscape:grid, …: any prefixed name but
 * svg: and xlink:), as the names it can be read as, longest first; empty when there is none.
 */
function prefixedNames(s: string, lt: number): string[] {
  const first = lt + 1;
  if (!/[a-z]/i.test(s.charAt(first))) return [];
  if (/^(?:svg|xlink):/i.test(s.slice(first, first + 6))) return [];
  let colon = first + 1;
  while (colon < s.length && NAME_CHAR.test(s.charAt(colon))) colon++;
  if (s[colon] !== ":") return [];
  let end = colon + 1;
  while (end < s.length && NAME_CHAR.test(s.charAt(end))) end++;
  const names: string[] = [];
  for (let k = end; k > colon + 1; k--)
    if (isWord(s[k - 1]) !== isWord(s[k])) names.push(s.slice(first, k));
  return names;
}

/** Every `</name\s*>` of the text: lower-cased name → the positions of its `<` and `>`. */
function closersByName(s: string): Map<string, { at: number; end: number }[]> {
  const closers = new Map<string, { at: number; end: number }[]>();
  for (let at = s.indexOf("</"); at >= 0; at = s.indexOf("</", at + 2)) {
    let k = at + 2;
    while (k < s.length && !SPACE.test(s.charAt(k)) && s[k] !== ">" && s[k] !== "<") k++;
    const name = s.slice(at + 2, k).toLowerCase();
    while (k < s.length && SPACE.test(s.charAt(k))) k++;
    if (s[k] !== ">" || !name) continue;
    const list = closers.get(name);
    if (list) list.push({ at, end: k });
    else closers.set(name, [{ at, end: k }]);
  }
  return closers;
}

/** The first closer that starts after `from`. */
function firstAfter(list: { at: number; end: number }[] | undefined, from: number) {
  if (!list) return undefined;
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((list[mid]?.at ?? 0) > from) high = mid;
    else low = mid + 1;
  }
  return list[low];
}

/** Editor elements: `<inkscape:grid/>`, then `<inkscape:grid>…</inkscape:grid>`. */
function removePrefixedElements(s: string): Pass {
  let out = "";
  let pos = 0;
  let gt = -1;
  for (let lt = s.indexOf("<"); lt >= 0; lt = s.indexOf("<", lt + 1)) {
    const name = prefixedNames(s, lt)[0];
    if (name === undefined) continue;
    if (gt < lt) gt = s.indexOf(">", lt);
    if (gt < 0) break;
    if (s[gt - 1] !== "/" || gt - 1 < lt + 1 + name.length) continue;
    out += s.slice(pos, lt);
    pos = gt + 1;
    lt = gt;
  }
  const kept = out + s.slice(pos);
  const closers = closersByName(kept);
  out = "";
  pos = 0;
  gt = -1;
  for (let lt = kept.indexOf("<"); lt >= 0; lt = kept.indexOf("<", lt + 1)) {
    const names = prefixedNames(kept, lt);
    if (names.length === 0) continue;
    if (gt < lt) gt = kept.indexOf(">", lt);
    if (gt < 0) return MALFORMED;
    let closer: { at: number; end: number } | undefined;
    for (const name of names) {
      closer = firstAfter(closers.get(name.toLowerCase()), gt);
      if (closer) break;
    }
    if (!closer) return MALFORMED;
    out += kept.slice(pos, lt);
    pos = closer.end + 1;
    lt = closer.end;
  }
  return out + kept.slice(pos);
}

/** Prefixed attributes and namespace declarations go, except xlink:href and xml:space. */
function tidyTags(s: string): Pass {
  let out = "";
  let pos = 0;
  for (let lt = s.indexOf("<"); lt >= 0; lt = s.indexOf("<", lt + 1)) {
    if (!/[a-z]/i.test(s.charAt(lt + 1))) continue;
    const gt = s.indexOf(">", lt);
    if (gt < 0) return MALFORMED;
    const tag = s.slice(lt, gt + 1);
    out +=
      s.slice(pos, lt) +
      styleToAttrs(
        tag.replace(
          /\s(?!xlink:href\b|xml:space\b)[a-z][\w.-]*:[\w.-]+\s*=\s*("[^"]*"|'[^']*')/gi,
          "",
        ),
      );
    pos = gt + 1;
    lt = gt;
  }
  return out + s.slice(pos);
}

/**
 * What design tools add around the drawing: prolog, comments, doctype, editor metadata.
 * Undefined when the file isn't well formed.
 */
export function tidyUploadedSvg(raw: string): string | undefined {
  let text: Pass = raw.replace(/^﻿/, "");
  const passes: ((s: string) => Pass)[] = [
    (s) => removeBetween(s, "<?", "?>"),
    (s) => removeBetween(s, "<!--", "-->"),
    removeDoctype,
    removeMetadata,
    removeTitles,
    removePrefixedElements,
    tidyTags,
  ];
  for (const pass of passes) {
    text = pass(text);
    if (text === MALFORMED) return undefined;
  }
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
  if (text === undefined)
    return {
      ok: false,
      message:
        "This SVG is not well formed: a tag, comment or declaration in it never closes. Export it again as plain SVG and retry.",
    };
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
