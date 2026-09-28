import { sanitizeMediaUrl } from "./media-url.ts";
import type { VNode } from "../render/vnode.ts";

/**
 * SVG allowlist (R-032 / W-073 / W-079).
 *
 * Expanded carefully for authors: defs/symbol/use (fragment href only),
 * image (http(s)/relative via sanitizeMediaUrl), gradients/stops, text/tspan,
 * clipPath/mask/pattern/marker. Still rejects script, foreignObject, anchors,
 * iframe, style elements/attrs, event handlers, and javascript:/data: urls.
 */

const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc",
  "defs",
  "symbol",
  "use",
  "image",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "marker",
  "text",
  "tspan",
]);

const ATTR_ALLOW = new Set([
  "viewBox",
  "xmlns",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-opacity",
  "fill-opacity",
  "opacity",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
  "transform",
  "role",
  "aria-hidden",
  "aria-label",
  "focusable",
  "id",
  "href",
  "xlink:href",
  "preserveAspectRatio",
  "gradientUnits",
  "gradientTransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "markerUnits",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
  "orient",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "dx",
  "dy",
  "clip-path",
  "mask",
]);

/** Hard reject before parse — script/handlers/foreignObject/style/a/iframe and data: urls. */
const FORBIDDEN =
  /<script\b|<\/script\b|\bon[a-z]+\s*=|javascript:|data:|<\s*foreignObject\b|<\s*style\b|<\s*iframe\b|<\s*a\b/i;

const FRAGMENT_HREF = /^#[A-Za-z_][\w.-]*$/;
const URL_HASH_REF = /^url\(\s*#[A-Za-z_][\w.-]*\s*\)$/i;
const MAX_MARKUP = 32_768;

type Tok =
  | { kind: "open"; tag: string; attrs: Record<string, string>; selfClosing: boolean }
  | { kind: "close"; tag: string }
  | { kind: "text"; value: string };

function decodeAttr(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function isSafeHref(tag: string, name: string, value: string): boolean {
  if (name !== "href" && name !== "xlink:href") return true;
  if (tag === "use") return FRAGMENT_HREF.test(value);
  if (tag === "image") return sanitizeMediaUrl(value) !== undefined;
  // Other tags should not carry href.
  return false;
}

function isSafeUrlRefAttr(name: string, value: string): boolean {
  if (name !== "clip-path" && name !== "mask") return true;
  if (value === "none") return true;
  return URL_HASH_REF.test(value);
}

function parseAttrs(tag: string, raw: string): Record<string, string> | undefined {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[1] ?? "";
    if (!ATTR_ALLOW.has(name)) continue;
    const value = decodeAttr(match[2] ?? match[3] ?? "");
    if (/[<>`]|javascript:/i.test(value)) return undefined;
    if (name === "transform" && !/^[a-z0-9.\s,()\-+e]+$/i.test(value)) return undefined;
    if (name === "gradientTransform" && !/^[a-z0-9.\s,()\-+e]+$/i.test(value)) return undefined;
    if (name === "patternTransform" && !/^[a-z0-9.\s,()\-+e]+$/i.test(value)) return undefined;
    if (!isSafeHref(tag, name, value)) return undefined;
    if (!isSafeUrlRefAttr(name, value)) return undefined;
    // Never allow inline style attribute (XSS vector); presentation attrs only.
    if (name === "style") return undefined;
    attrs[name] = value;
  }
  if (/\bon[a-z]+\s*=/i.test(raw)) return undefined;
  if (/\bstyle\s*=/i.test(raw)) return undefined;
  return attrs;
}

function tokenize(input: string): Tok[] | undefined {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === "<") {
      if (input.startsWith("<!--", i)) {
        const end = input.indexOf("-->", i + 4);
        if (end < 0) return undefined;
        i = end + 3;
        continue;
      }
      if (input.startsWith("<!", i) || input.startsWith("<?", i)) return undefined;
      const close = input.indexOf(">", i + 1);
      if (close < 0) return undefined;
      const body = input.slice(i + 1, close).trim();
      i = close + 1;
      if (body.startsWith("/")) {
        const tag = body.slice(1).trim().toLowerCase();
        if (!SVG_TAGS.has(tag)) return undefined;
        tokens.push({ kind: "close", tag });
        continue;
      }
      const selfClosing = body.endsWith("/");
      const openBody = selfClosing ? body.slice(0, -1).trim() : body;
      const space = openBody.search(/\s/);
      const tag = (space < 0 ? openBody : openBody.slice(0, space)).toLowerCase();
      if (!SVG_TAGS.has(tag)) return undefined;
      const attrRaw = space < 0 ? "" : openBody.slice(space);
      const attrs = parseAttrs(tag, attrRaw);
      if (!attrs) return undefined;
      tokens.push({ kind: "open", tag, attrs, selfClosing });
      continue;
    }
    const next = input.indexOf("<", i);
    const text = input.slice(i, next < 0 ? input.length : next);
    i = next < 0 ? input.length : next;
    if (text.trim()) tokens.push({ kind: "text", value: text });
  }
  return tokens;
}

function build(tokens: Tok[]): VNode | undefined {
  let index = 0;

  const read = (): VNode | string | undefined => {
    const tok = tokens[index];
    if (!tok) return undefined;
    if (tok.kind === "text") {
      index += 1;
      return tok.value;
    }
    if (tok.kind === "close") return undefined;
    index += 1;
    if (tok.selfClosing) {
      return { tag: tok.tag, attrs: { ...tok.attrs }, children: [] };
    }
    const children: (VNode | string)[] = [];
    while (index < tokens.length) {
      const next = tokens[index];
      if (!next) break;
      if (next.kind === "close") {
        if (next.tag !== tok.tag) return undefined;
        index += 1;
        break;
      }
      const child = read();
      if (child === undefined) return undefined;
      if (typeof child === "string") {
        if (
          tok.tag === "title" ||
          tok.tag === "desc" ||
          tok.tag === "text" ||
          tok.tag === "tspan"
        ) {
          children.push(child);
        }
        continue;
      }
      children.push(child);
    }
    return { tag: tok.tag, attrs: { ...tok.attrs }, children };
  };

  const root = read();
  if (!root || typeof root === "string" || root.tag !== "svg") return undefined;
  if (index !== tokens.length) return undefined;
  return root;
}

/**
 * Parse pasted SVG into an allowlisted VNode tree (R-032 / W-073 / W-079).
 * Rejects scripts, handlers, foreignObject, style, anchors, and unsafe urls.
 * Allows fragment-only `use` and media-policy `image` hrefs.
 */
export function sanitizeSvgMarkup(raw: string): VNode | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_MARKUP) return undefined;
  if (FORBIDDEN.test(trimmed)) return undefined;
  if (!/<svg[\s>]/i.test(trimmed)) return undefined;
  const tokens = tokenize(trimmed);
  if (!tokens) return undefined;
  return build(tokens);
}

/** True when markup is safe to store (same rules as render). */
export function isSafeSvgMarkup(raw: string): boolean {
  return sanitizeSvgMarkup(raw) !== undefined;
}
