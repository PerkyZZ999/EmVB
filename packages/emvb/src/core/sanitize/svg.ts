import type { VNode } from "../render/vnode.ts";

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
]);

const FORBIDDEN =
  /<script\b|<\/script\b|\bon[a-z]+\s*=|javascript:|data:|<\s*foreignObject\b|<\s*use\b|<\s*image\b|<\s*style\b|<\s*iframe\b|<\s*a\b|xlink:href|\bhref\s*=/i;

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

function parseAttrs(raw: string): Record<string, string> | undefined {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[1] ?? "";
    if (!ATTR_ALLOW.has(name)) continue;
    const value = decodeAttr(match[2] ?? match[3] ?? "");
    if (/[<>`]|javascript:/i.test(value)) return undefined;
    if (name === "transform" && !/^[a-z0-9.\s,()\-+e]+$/i.test(value)) return undefined;
    attrs[name] = value;
  }
  if (/\bon[a-z]+\s*=/i.test(raw)) return undefined;
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
      const attrs = parseAttrs(attrRaw);
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
        if (tok.tag === "title" || tok.tag === "desc") children.push(child);
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
 * Parse pasted SVG into an allowlisted VNode tree (R-032 / W-073).
 * Rejects scripts, handlers, foreignObject, use, image, style, anchors, and urls.
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
