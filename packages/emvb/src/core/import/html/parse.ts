/**
 * W-1074: a small, tolerant HTML reader for the WordPress and HTML import. It turns pasted or
 * uploaded markup into a neutral tree of elements, text and WordPress block delimiters
 * (`<!-- wp:paragraph {"align":"center"} -->`) that `importHtml` maps onto EmVB elements.
 *
 * Why a reader in core and not the browser's DOMParser: core stays free of the DOM (it runs in
 * the admin, on the server and in `bun test` alike), the same input always gives the same tree,
 * Gutenberg's block comments come out as structure instead of comment nodes, and nothing here
 * ever loads, runs or renders the input. The tree only carries tag names, attribute strings and
 * text; the mapper decides what of it becomes plain EmVB props.
 *
 * It follows the parts of HTML's tree building that matter for content (void elements, implied
 * ends of `p`, `li`, `dt`/`dd`, table rows and cells, raw-text elements) and ignores stray end
 * tags. Everything is bounded: nodes read, nesting depth and attribute sizes.
 */
import { decodeEntities } from "../elementor/html.ts";

export type HtmlElement = {
  kind: "element";
  tag: string;
  attrs: Readonly<Record<string, string>>;
  children: HtmlNode[];
};
export type HtmlText = { kind: "text"; text: string };
/** A WordPress block: `name` is namespaced (`core/paragraph`), `attrs` its JSON attributes. */
export type WpBlock = {
  kind: "block";
  name: string;
  attrs: Readonly<Record<string, unknown>>;
  children: HtmlNode[];
};
export type HtmlNode = HtmlElement | HtmlText | WpBlock;

export type ParsedHtml = {
  nodes: HtmlNode[];
  /** The document's `<title>`, when it has one. */
  title?: string;
  /** WordPress block delimiters were found (Gutenberg post content). */
  blocks: boolean;
  /** What the reader dropped on its own: scripts, styles, inline SVG… */
  dropped: string[];
  /** Nesting deeper than the reader keeps was flattened. */
  flattened: boolean;
  /** The input had more nodes than the reader keeps; the rest was left out. */
  cut: boolean;
};

/** Parse nodes kept per import (elements and text runs). */
export const MAX_PARSE_NODES = 20_000;
/** Element nesting kept; deeper elements add their content to the deepest kept one. */
export const MAX_PARSE_DEPTH = 48;
const MAX_ATTRS = 64;
const MAX_ATTR_VALUE = 8192;
const MAX_BLOCK_ATTRS = 65_536;

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Elements whose content is not markup: skipped whole. */
const RAW_TEXT = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
  "xmp",
  "noembed",
  "noframes",
  "plaintext",
  "object",
  "canvas",
]);

const DROPPED_NAME: Record<string, string> = {
  script: "scripts",
  style: "styles",
  svg: "inline SVG drawings",
  math: "MathML formulas",
  noscript: "noscript fallbacks",
  template: "templates",
  textarea: "form fields",
  object: "embedded objects",
  canvas: "canvas drawings",
};

/** Opening one of these ends an open `p` (HTML's "close a p element"). */
const CLOSES_P = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "ul",
]);

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * Implied ends: opening `tag` closes the nearest open element in `closes`, unless one of `stop`
 * comes first (from the innermost element outwards).
 */
const IMPLIED: Record<string, { closes: ReadonlySet<string>; stop: ReadonlySet<string> }> = {
  li: { closes: new Set(["li"]), stop: new Set(["ul", "ol", "menu", "table", "td", "th"]) },
  dt: { closes: new Set(["dt", "dd"]), stop: new Set(["dl", "table", "td", "th"]) },
  dd: { closes: new Set(["dt", "dd"]), stop: new Set(["dl", "table", "td", "th"]) },
  tr: { closes: new Set(["tr"]), stop: new Set(["table", "thead", "tbody", "tfoot"]) },
  td: { closes: new Set(["td", "th"]), stop: new Set(["tr", "table"]) },
  th: { closes: new Set(["td", "th"]), stop: new Set(["tr", "table"]) },
  thead: { closes: new Set(["thead", "tbody", "tfoot"]), stop: new Set(["table"]) },
  tbody: { closes: new Set(["thead", "tbody", "tfoot"]), stop: new Set(["table"]) },
  tfoot: { closes: new Set(["thead", "tbody", "tfoot"]), stop: new Set(["table"]) },
  a: { closes: new Set(["a"]), stop: new Set(["td", "th", "table", "button"]) },
  option: { closes: new Set(["option"]), stop: new Set(["select", "datalist"]) },
};
const P_SCOPE = new Set(["button", "table", "td", "th", "caption", "template", "object"]);

/** Entities HTML knows that the shared decoder doesn't, used to hide a URL's scheme. */
const EXTRA_ENTITIES: Record<string, string> = {
  colon: ":",
  tab: "\t",
  newline: "\n",
  sol: "/",
  bsol: "\\",
  lpar: "(",
  rpar: ")",
  period: ".",
  comma: ",",
  excl: "!",
  quest: "?",
  num: "#",
  equals: "=",
  plus: "+",
  commat: "@",
  percnt: "%",
  lowbar: "_",
  semi: ";",
  ast: "*",
  dollar: "$",
  grave: "`",
};

/**
 * Text and attribute values as a browser reads them: named and numeric references, including
 * numeric ones without their `;` (`&#106avascript:`), so a hidden scheme is seen by the
 * sanitizers and refused.
 */
export function decodeHtml(text: string): string {
  if (!text.includes("&")) return text;
  const named = text.replace(/&([a-z]{2,8});/gi, (whole, name: string) => {
    const extra = EXTRA_ENTITIES[name.toLowerCase()];
    return extra ?? whole;
  });
  const numeric = named
    .replace(/&#(\d{1,7})(?![\d;])/g, "&#$1;")
    .replace(/&#x([0-9a-f]{1,6})(?![0-9a-f;])/gi, "&#x$1;");
  return decodeEntities(numeric);
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function readAttrs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  for (const m of source.matchAll(ATTR)) {
    const name = (m[1] ?? "").toLowerCase();
    if (!name || name in out) continue;
    if (++count > MAX_ATTRS) break;
    const raw = m[2] ?? m[3] ?? m[4] ?? "";
    // A value too long to be a sensible address or caption (a data: image, say) is left out.
    out[name] = raw.length > MAX_ATTR_VALUE ? "" : decodeHtml(raw);
  }
  return out;
}

const BLOCK_COMMENT =
  /^\s*(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+(\{[\s\S]*\}\s+)?(\/)?$/;

type Open = HtmlElement | WpBlock;

/** Reads `input` into a tree. Never throws; malformed markup gives a best-effort tree. */
export function parseHtml(input: string): ParsedHtml {
  const html = input;
  const lower = html.toLowerCase();
  const len = html.length;
  const root: WpBlock = { kind: "block", name: "#root", attrs: {}, children: [] };
  const stack: Open[] = [root];
  const dropped = new Set<string>();
  let title: string | undefined;
  let blocks = false;
  let flattened = false;
  let cut = false;
  let count = 0;

  const top = () => stack[stack.length - 1] as Open;
  const elementDepth = () => stack.length - 1;
  const budget = () => {
    if (count >= MAX_PARSE_NODES) {
      cut = true;
      return false;
    }
    count++;
    return true;
  };

  const addText = (raw: string) => {
    if (!raw) return;
    const text = decodeHtml(raw);
    const kids = top().children;
    const last = kids[kids.length - 1];
    if (last?.kind === "text") {
      last.text += text;
      return;
    }
    if (!budget()) return;
    kids.push({ kind: "text", text });
  };

  /** Closes the nearest open `names` element above any `stop` element; true when one closed. */
  const closeNearest = (names: ReadonlySet<string>, stop: ReadonlySet<string>): boolean => {
    for (let i = stack.length - 1; i > 0; i--) {
      const open = stack[i] as Open;
      if (open.kind === "block") return false;
      if (names.has(open.tag)) {
        stack.length = i;
        return true;
      }
      if (stop.has(open.tag)) return false;
    }
    return false;
  };

  const openElement = (tag: string, attrs: Record<string, string>, isVoid: boolean) => {
    if (CLOSES_P.has(tag)) closeNearest(new Set(["p"]), P_SCOPE);
    if (HEADINGS.has(tag)) {
      const current = top();
      if (current.kind === "element" && HEADINGS.has(current.tag)) stack.pop();
    }
    const implied = IMPLIED[tag];
    if (implied) closeNearest(implied.closes, implied.stop);
    if (!budget()) return;
    const element: HtmlElement = { kind: "element", tag, attrs, children: [] };
    top().children.push(element);
    if (isVoid) return;
    if (elementDepth() >= MAX_PARSE_DEPTH) {
      // Too deep: its content goes into the deepest kept element.
      flattened = true;
      return;
    }
    stack.push(element);
  };

  const closeElement = (tag: string) => {
    for (let i = stack.length - 1; i > 0; i--) {
      const open = stack[i] as Open;
      if (open.kind === "block") return;
      if (open.tag === tag) {
        stack.length = i;
        return;
      }
    }
  };

  const blockComment = (body: string) => {
    const m = BLOCK_COMMENT.exec(body);
    if (!m) return;
    blocks = true;
    const name = `${m[2] ?? "core/"}${m[3] ?? ""}`;
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        const open = stack[i] as Open;
        if (open.kind === "block" && open.name === name) {
          stack.length = i;
          return;
        }
      }
      return;
    }
    let attrs: Record<string, unknown> = {};
    const json = m[4]?.trim();
    if (json && json.length <= MAX_BLOCK_ATTRS) {
      try {
        const parsed = JSON.parse(json) as unknown;
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
          attrs = parsed as Record<string, unknown>;
      } catch {
        // Unreadable attributes: the block keeps its content and default settings.
      }
    }
    if (!budget()) return;
    const block: WpBlock = { kind: "block", name, attrs, children: [] };
    top().children.push(block);
    if (m[5]) return;
    if (stack.length - 1 >= MAX_PARSE_DEPTH) {
      flattened = true;
      return;
    }
    stack.push(block);
  };

  const TAG_NAME = /[a-zA-Z][a-zA-Z0-9-]*/y;
  let i = 0;
  while (i < len) {
    if (count >= MAX_PARSE_NODES) {
      cut = true;
      break;
    }
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      addText(html.slice(i));
      break;
    }
    if (lt > i) addText(html.slice(i, lt));
    i = lt;
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      blockComment(html.slice(i + 4, end === -1 ? len : end));
      i = end === -1 ? len : end + 3;
      continue;
    }
    const next = html[i + 1];
    if (next === "!" || next === "?") {
      // Doctype, CDATA, processing instructions: nothing to keep.
      const end = html.indexOf(">", i);
      i = end === -1 ? len : end + 1;
      continue;
    }
    const closing = next === "/";
    const nameAt = closing ? i + 2 : i + 1;
    TAG_NAME.lastIndex = nameAt;
    const nameMatch = TAG_NAME.exec(html);
    if (!nameMatch) {
      addText("<");
      i++;
      continue;
    }
    const tag = nameMatch[0].toLowerCase();
    let j = nameAt + nameMatch[0].length;
    let quote = "";
    while (j < len) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j++;
    }
    // A tag that never ends is dropped, as browsers do at the end of the input.
    if (j >= len) break;
    const attrSource = html.slice(nameAt + nameMatch[0].length, j);
    i = j + 1;
    if (closing) {
      if (tag === "br") openElement("br", {}, true);
      else if (tag === "p" && !closeNearest(new Set(["p"]), P_SCOPE)) {
        // `</p>` with no open p: nothing to close.
      } else closeElement(tag);
      continue;
    }
    if (RAW_TEXT.has(tag)) {
      const end = lower.indexOf(`</${tag}`, i);
      const content = html.slice(i, end === -1 ? len : end);
      const close = end === -1 ? -1 : html.indexOf(">", end);
      i = close === -1 ? len : close + 1;
      if (tag === "title") {
        if (title === undefined) title = decodeHtml(content);
        continue;
      }
      if (tag === "iframe") {
        // Kept as an element (no content): video embeds become Video elements.
        openElement("iframe", readAttrs(attrSource), true);
        continue;
      }
      const name = DROPPED_NAME[tag];
      if (name) dropped.add(name);
      continue;
    }
    // As in HTML, a trailing slash on a non-void element (`<div/>`) doesn't close it.
    openElement(tag, readAttrs(attrSource), VOID.has(tag));
  }

  return {
    nodes: root.children,
    ...(title?.trim() ? { title: title.replace(/\s+/g, " ").trim().slice(0, 200) } : {}),
    blocks,
    dropped: [...dropped],
    flattened,
    cut,
  };
}
