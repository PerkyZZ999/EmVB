/**
 * Elementor's HTML (Text Editor, HTML widget, accordion and tab content) → EmVB blocks (W-945).
 * A small tolerant tokenizer, not a DOM: it only ever produces plain text, so no markup from
 * the input reaches the page. Scripts, styles and comments are dropped; inline formatting is
 * flattened (and noted); links, images and embeds keep their URLs after sanitizing.
 */
import { MAX_TEXT_LENGTH } from "../../limits.ts";

export type Block =
  | { kind: "heading"; level: number; text: string; href?: string }
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "image"; src: string; alt: string }
  | { kind: "divider" }
  | { kind: "video"; url: string };

export type HtmlResult = {
  blocks: Block[];
  /** Inline formatting (bold, colour spans, inline links) was flattened to plain text. */
  flattened: boolean;
  /** Tags or embeds that were dropped (script, iframe from an unknown host, form, table, ...). */
  dropped: string[];
};

/** Input HTML longer than this is cut (a Text Editor holds far less in practice). */
const MAX_HTML_LENGTH = 200_000;
const MAX_BLOCKS = 400;

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  middot: "·",
  bull: "•",
  euro: "€",
  pound: "£",
  deg: "°",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number(body.slice(1));
      if (
        !Number.isFinite(code) ||
        code <= 0 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      )
        return "";
      return String.fromCodePoint(code);
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/**
 * Collapses whitespace and drops control characters. A line feed is a `<br>` the tokenizer kept
 * (source line breaks become spaces first); Text elements show it (`white-space: pre-line`).
 */
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** Drops control characters (keeps tab and line feed). */
export const stripControl = (text: string) => text.replace(CONTROL, "");

export function cleanText(text: string, keepBreaks = false): string {
  const flat = stripControl(text.replace(/\t/g, " "))
    .replace(/[ \u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return keepBreaks ? flat : flat.replace(/\n+/g, " ");
}

/** Splits text longer than an element allows at word boundaries, keeping all of it. */
export function splitLong(text: string, max = MAX_TEXT_LENGTH): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

const RAW_TEXT = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "noscript",
  "template",
  "svg",
  "math",
]);
const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "blockquote",
  "figure",
  "figcaption",
  "pre",
  "address",
  "center",
  "main",
  "aside",
  "nav",
  "dl",
  "dt",
  "dd",
  "tr",
]);
const INLINE_FORMAT = new Set([
  "strong",
  "b",
  "em",
  "i",
  "u",
  "span",
  "font",
  "mark",
  "small",
  "sub",
  "sup",
  "code",
  "s",
  "del",
  "ins",
  "abbr",
  "cite",
  "q",
  "kbd",
  "var",
  "time",
]);
const DROP_WITH_NOTE = new Set([
  "form",
  "input",
  "button",
  "select",
  "object",
  "embed",
  "canvas",
  "audio",
  "video",
]);

function attrs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(
    /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    const name = (m[1] ?? "").toLowerCase();
    if (!name) continue;
    if (!(name in out)) out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** YouTube / Vimeo iframe src → a watch URL EmVB's Video element accepts. */
export function embedVideoUrl(src: string): string | undefined {
  const yt =
    /^(?:https?:)?\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i.exec(
      src,
    );
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`;
  const vimeo = /^(?:https?:)?\/\/player\.vimeo\.com\/video\/(\d{1,15})/i.exec(src);
  if (vimeo) return `https://vimeo.com/${vimeo[1]}`;
  return undefined;
}

/** HTML → blocks. `safeHref`/`safeSrc` decide which URLs are kept (callers pass EmVB's sanitizers). */
export function htmlToBlocks(
  input: string,
  safeHref: (url: string) => string | undefined,
  safeSrc: (url: string) => string | undefined,
): HtmlResult {
  const html = input.length > MAX_HTML_LENGTH ? input.slice(0, MAX_HTML_LENGTH) : input;
  const blocks: Block[] = [];
  const dropped = new Set<string>();
  let flattened = false;
  if (input.length > MAX_HTML_LENGTH) dropped.add("text past 200,000 characters");

  let buffer = "";
  let heading: number | undefined;
  /** Links seen in the current paragraph, and whether all its text was inside one link. */
  let links: { href: string; text: string }[] = [];
  let linkDepth = 0;
  let textOutsideLink = false;
  let list: { ordered: boolean; items: string[] } | undefined;
  let listDepth = 0;
  let item: string | undefined;

  const push = (block: Block) => {
    if (blocks.length < MAX_BLOCKS) blocks.push(block);
    else dropped.add(`content past ${MAX_BLOCKS} blocks`);
  };

  const flush = () => {
    const text = cleanText(buffer, heading === undefined);
    buffer = "";
    const onlyLink = links.length === 1 && !textOutsideLink ? links[0] : undefined;
    if (links.length > 0 && !onlyLink) flattened = true;
    links = [];
    textOutsideLink = false;
    if (!text) {
      heading = undefined;
      return;
    }
    if (heading !== undefined) {
      for (const part of splitLong(text)) {
        push({
          kind: "heading",
          level: heading,
          text: part,
          ...(onlyLink ? { href: onlyLink.href } : {}),
        });
      }
    } else if (onlyLink && text.length <= MAX_TEXT_LENGTH) {
      push({ kind: "link", text, href: onlyLink.href });
    } else {
      for (const part of splitLong(text)) push({ kind: "text", text: part });
    }
    heading = undefined;
  };

  const flushItem = () => {
    if (item === undefined || !list) return;
    const text = cleanText(item);
    if (text)
      for (const part of splitLong(text)) if (list.items.length < 200) list.items.push(part);
    item = undefined;
  };

  const addText = (raw: string) => {
    const text = decodeEntities(raw.replace(/[\r\n\t\f]+/g, " "));
    if (item !== undefined) {
      item += text;
      return;
    }
    if (list && listDepth > 0) {
      if (text.trim()) item = text;
      return;
    }
    buffer += text;
    if (linkDepth > 0) {
      const last = links[links.length - 1];
      if (last) last.text += text;
    } else if (text.trim()) {
      textOutsideLink = true;
    }
  };

  const token =
    /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html)) !== null) {
    const whole = match[0];
    const name = match[1]?.toLowerCase();
    if (!name) {
      if (whole.startsWith("<!") || whole === "<") continue;
      addText(whole);
      continue;
    }
    const closing = whole[1] === "/";
    if (!closing && RAW_TEXT.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, token.lastIndex);
      token.lastIndex = end === -1 ? html.length : end;
      if (name === "script" || name === "style") dropped.add(name);
      else if (name === "svg") dropped.add("inline SVG");
      continue;
    }
    if (RAW_TEXT.has(name)) continue;
    const attributes = closing ? {} : attrs(match[2] ?? "");

    if (/^h[1-6]$/.test(name)) {
      flush();
      if (!closing) heading = Number(name[1]);
      continue;
    }
    if (name === "ul" || name === "ol") {
      if (!closing) {
        if (listDepth === 0) {
          flush();
          list = { ordered: name === "ol", items: [] };
        } else {
          flushItem();
          flattened = true;
        }
        listDepth++;
      } else if (listDepth > 0) {
        listDepth--;
        flushItem();
        if (listDepth === 0 && list) {
          if (list.items.length > 0)
            push({ kind: "list", ordered: list.ordered, items: list.items });
          list = undefined;
        }
      }
      continue;
    }
    if (name === "li") {
      if (list && listDepth > 0) {
        flushItem();
        if (!closing) item = "";
      } else if (!closing) {
        flush();
      }
      continue;
    }
    if (name === "br") {
      if (item !== undefined) item += " ";
      else buffer += "\n";
      continue;
    }
    if (name === "hr") {
      flush();
      push({ kind: "divider" });
      continue;
    }
    if (name === "img") {
      const src = safeSrc(attributes["src"] ?? "");
      if (!src) {
        if (attributes["src"]) dropped.add("image with an unsupported address");
        continue;
      }
      flush();
      push({ kind: "image", src, alt: cleanText(attributes["alt"] ?? "").slice(0, 500) });
      continue;
    }
    if (name === "iframe") {
      if (closing) continue;
      const url = embedVideoUrl(attributes["src"] ?? "");
      if (url) {
        flush();
        push({ kind: "video", url });
      } else {
        dropped.add("embedded frame (iframe)");
      }
      continue;
    }
    if (name === "a") {
      if (!closing) {
        const href = safeHref(attributes["href"] ?? "");
        linkDepth++;
        if (href && linkDepth === 1) {
          links.push({ href, text: "" });
        } else if (attributes["href"] && !href) {
          dropped.add("link with an unsafe address");
        }
      } else if (linkDepth > 0) {
        linkDepth--;
      }
      continue;
    }
    if (name === "table" || name === "thead" || name === "tbody") {
      if (!closing && name === "table") {
        flush();
        dropped.add("table (its cells are kept as paragraphs)");
      }
      continue;
    }
    if (name === "td" || name === "th") {
      buffer += " ";
      continue;
    }
    if (BLOCK.has(name)) {
      if (list && listDepth > 0) continue;
      flush();
      continue;
    }
    if (INLINE_FORMAT.has(name)) {
      if (!closing && (name !== "span" || attributes["style"] || attributes["class"]))
        flattened = true;
      continue;
    }
    if (DROP_WITH_NOTE.has(name)) {
      if (!closing) dropped.add(name);
      continue;
    }
    // Any other tag: keep its text, drop the tag.
  }
  flush();
  if (list && list.items.length > 0) {
    flushItem();
    push({ kind: "list", ordered: list.ordered, items: list.items });
  }
  return { blocks, flattened, dropped: [...dropped] };
}
