/**
 * W-1074: the parsed HTML tree → EmVB elements. Headings, paragraphs, lists, images, quotes,
 * tables, embeds and boxes map onto EmVB's own elements; everything else keeps its text or is
 * left out and reported. Only plain text, sanitized URLs and a few validated style values ever
 * reach a node: no markup, inline CSS, class or event handler from the input is kept.
 */
import { MAX_TEXT_LENGTH } from "../../limits.ts";
import { CONTAINER_TAGS } from "../../schema/layout.ts";
import { resolveEmbedUrl } from "../../sanitize/embed-url.ts";
import { sanitizeMediaUrl } from "../../sanitize/media-url.ts";
import type { ImportContext } from "../elementor/context.ts";
import { cleanText, embedVideoUrl, splitLong, stripControl } from "../elementor/html.ts";
import { type Fmt, marksFromChars } from "../elementor/inline-marks.ts";
import { altFromUrl, color } from "../elementor/values.ts";
import type { N } from "../elementor/widgets.ts";
import type { HtmlElement, HtmlNode, WpBlock } from "./parse.ts";

type Style = Record<string, unknown>;
export type Length = { value: number; unit: "px" | "rem" | "em" | "%" | "vw" | "vh" };

/** Text kept per import, so the page stays under EmVB's layout size. */
const MAX_IMPORT_TEXT = 200_000;
/** Boxes nested deeper than this are flattened into their parent. */
export const MAX_BOX_DEPTH = 10;
const MAX_LIST_ITEMS = 200;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLUMNS = 12;

export const GAP: Length = { value: 16, unit: "px" };

/** Inline elements: their text joins the paragraph around them. */
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "big",
  "br",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "font",
  "i",
  "ins",
  "kbd",
  "mark",
  "nobr",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "time",
  "tt",
  "u",
  "var",
  "wbr",
]);
/** Inline formatting EmVB can't show (underline, superscript, code…): kept as plain text. */
const FLATTENED = new Set([
  "u",
  "sub",
  "sup",
  "code",
  "kbd",
  "samp",
  "s",
  "strike",
  "del",
  "ins",
  "mark",
  "small",
  "big",
  "tt",
]);
/** Never content: skipped without a note. */
const SILENT = new Set([
  "head",
  "link",
  "meta",
  "base",
  "col",
  "colgroup",
  "source",
  "track",
  "param",
  "wbr",
  "br",
  "area",
  "map",
]);
const FORM_TAGS = new Set([
  "form",
  "input",
  "select",
  "textarea",
  "button",
  "label",
  "fieldset",
  "legend",
  "option",
  "optgroup",
  "datalist",
  "output",
  "progress",
  "meter",
]);
const TRANSPARENT = new Set(["html", "body", "thead", "tbody", "tfoot", "picture"]);
const BUTTON_CLASS = /(?:^|\s)(?:wp-block-button__link|wp-element-button|button|btn)(?:\s|$)/i;

const isValidHtmlId = (id: string) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id);

/** A CSS length EmVB can store (`24px`, `1.5rem`, `50%`); undefined for anything else. */
export function cssLength(
  raw: unknown,
  units = ["px", "rem", "em", "%", "vw", "vh"],
): Length | undefined {
  if (typeof raw === "number")
    return Number.isFinite(raw) && raw >= 0 ? { value: raw, unit: "px" } : undefined;
  if (typeof raw !== "string") return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(px|rem|em|%|vw|vh)?\s*$/i.exec(raw);
  if (!m) return undefined;
  const value = Number(m[1]);
  const unit = (m[2] ?? "px").toLowerCase();
  if (!Number.isFinite(value) || value > 10_000 || !units.includes(unit)) return undefined;
  if (!m[2] && value !== 0) return undefined;
  return { value: Math.round(value * 100) / 100, unit: unit as Length["unit"] };
}

/** One `property: value` of an inline `style` attribute (last one wins, `!important` dropped). */
function declared(style: string | undefined, property: string): string | undefined {
  if (!style) return undefined;
  let found: string | undefined;
  for (const part of style.split(";")) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    if (part.slice(0, at).trim().toLowerCase() === property)
      found = part
        .slice(at + 1)
        .replace(/!important/i, "")
        .trim();
  }
  return found;
}

const ALIGNS = new Set(["left", "center", "right", "justify"]);

/** An element's text alignment: its `style`, WordPress's `has-text-align-*` class or `align`. */
function alignOf(el: HtmlElement): string | undefined {
  const fromStyle = declared(el.attrs["style"], "text-align")?.toLowerCase();
  if (fromStyle && ALIGNS.has(fromStyle)) return fromStyle;
  const fromClass = /(?:^|\s)has-text-align-(left|center|right|justify)(?:\s|$)/.exec(
    el.attrs["class"] ?? "",
  )?.[1];
  if (fromClass) return fromClass;
  const attr = el.attrs["align"]?.toLowerCase();
  return attr && ALIGNS.has(attr) ? attr : undefined;
}

/** A width or height attribute in pixels. */
const dimension = (value: string | undefined) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 10_000 ? n : undefined;
};

const isCite = (c: HtmlNode): c is HtmlElement =>
  c.kind === "element" && (c.tag === "cite" || c.tag === "footer");

/** Puts style values on every node (keeping what a node already has). */
export function withStyle(nodes: N[], style: Style): N[] {
  if (Object.keys(style).length === 0) return nodes;
  for (const n of nodes) n["style"] = { ...style, ...(n["style"] as Style | undefined) };
  return nodes;
}

type Run = {
  raw: string;
  fmts: (Fmt | undefined)[];
  links: { href: string; text: string }[];
  outside: boolean;
};

export type BlockMapper = (m: Mapper, block: WpBlock, depth: number) => N[];

export class Mapper {
  private textLeft = MAX_IMPORT_TEXT;
  private warnedBudget = false;

  constructor(
    readonly ctx: ImportContext,
    /** Gutenberg content: the report counts blocks, not HTML elements. */
    readonly gutenberg: boolean,
    private readonly blockOf: BlockMapper,
  ) {}

  /** Counts one piece of content for the report (HTML mode; blocks count themselves). */
  unit(produced: boolean): void {
    if (this.gutenberg) return;
    this.ctx.elements++;
    if (produced) this.ctx.mapped++;
  }

  node(type: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}): N {
    return { id: this.ctx.id(), type, props, ...extra };
  }

  box(children: N[], style: Style = {}, props: Record<string, unknown> = {}): N {
    return this.node("container", props, {
      style: { flexDirection: "column", gap: GAP, ...style },
      children,
    });
  }

  /** Spends text from the import's budget; false once it is used up (noted once). */
  take(text: string): boolean {
    if (this.textLeft >= text.length) {
      this.textLeft -= text.length;
      return true;
    }
    this.textLeft = 0;
    if (!this.warnedBudget) {
      this.warnedBudget = true;
      this.ctx.note(
        "skipped",
        "Page",
        "The page has more text than one EmVB page holds; the rest was left out. Import it in parts.",
      );
    }
    return false;
  }

  /** A link address, made safe (old-site pages become this site's paths); unsafe ones noted. */
  href(raw: string | undefined): string | undefined {
    if (!raw?.trim()) return undefined;
    const safe = this.ctx.href(raw);
    if (!safe)
      this.ctx.note(
        "skipped",
        "Links",
        "Links with an unsafe or unsupported address (javascript:, data: and the like) were left out; their text was kept.",
      );
    return safe;
  }

  /** Notes what the import drops from any element: event handlers, inline styles, classes. */
  private attributes(el: HtmlElement): void {
    for (const name of Object.keys(el.attrs)) {
      if (name.startsWith("on")) {
        this.ctx.note(
          "skipped",
          "Scripts",
          "Event handlers (onclick, onerror and the like) were left out.",
        );
        break;
      }
    }
    if (this.gutenberg) return;
    const style = el.attrs["style"];
    if (
      style &&
      style
        .split(";")
        .some((part) => part.includes(":") && !/^\s*(?:text-align|color)\s*:/i.test(part))
    )
      this.ctx.note(
        "approximated",
        "Styles",
        "Inline styles were left out (apart from text colour and alignment); style the page in EmVB.",
      );
  }

  /** A list of parsed nodes → EmVB nodes; loose text and inline elements become paragraphs. */
  nodes(list: readonly HtmlNode[], depth: number): N[] {
    const out: N[] = [];
    let run: HtmlNode[] = [];
    const flush = () => {
      if (run.length === 0) return;
      out.push(...this.paragraph(run));
      run = [];
    };
    for (const item of list) {
      if (this.ctx.overBudget) {
        this.ctx.note(
          "skipped",
          "Page",
          "The page was larger than EmVB allows; its last parts were left out. Import them separately.",
        );
        break;
      }
      if (item.kind === "text" || (item.kind === "element" && !this.blockish(item))) {
        run.push(item);
        continue;
      }
      flush();
      out.push(
        ...(item.kind === "block" ? this.blockOf(this, item, depth) : this.element(item, depth)),
      );
    }
    flush();
    return out;
  }

  /** Whether an element starts its own EmVB element (not part of the text around it). */
  blockish(el: HtmlElement, level = 0): boolean {
    if (el.tag === "a" && BUTTON_CLASS.test(el.attrs["class"] ?? "")) return true;
    if (!INLINE.has(el.tag)) return true;
    if (level > 16) return false;
    return el.children.some(
      (child) =>
        child.kind === "block" || (child.kind === "element" && this.blockish(child, level + 1)),
    );
  }

  /** One HTML element → EmVB nodes. */
  element(el: HtmlElement, depth: number): N[] {
    this.attributes(el);
    const tag = el.tag;
    if (SILENT.has(tag)) return [];
    if (TRANSPARENT.has(tag)) return this.nodes(el.children, depth);
    if (/^h[1-6]$/.test(tag)) return this.heading(el, Number(tag[1]));
    switch (tag) {
      case "p":
      case "figcaption":
      case "summary":
      case "caption":
        return withStyle(this.nodes(el.children, depth), this.alignStyle(el));
      case "ul":
      case "ol":
      case "menu":
        return this.list(el);
      case "img":
        return this.imageNodes(el);
      case "a":
        return this.linkBlock(el, depth);
      case "figure":
        return this.figure(el, depth);
      case "blockquote":
        return this.quote(el.children, depth);
      case "hr":
        this.unit(true);
        return [this.node("divider", {})];
      case "table":
        return this.table(el);
      case "iframe":
      case "embed":
        return this.embed(el);
      case "video":
        return this.video(el);
      case "audio":
        this.unit(false);
        this.ctx.note(
          "skipped",
          "Audio",
          "Audio players were left out (EmVB has no audio element); link to the file instead.",
        );
        return [];
      case "details":
        return this.details(el, depth);
      case "pre":
        return this.pre(el);
      case "dl":
        return this.definitions(el, depth);
      default:
        break;
    }
    if (FORM_TAGS.has(tag)) {
      this.unit(false);
      this.ctx.note(
        "skipped",
        "Forms",
        "Forms and their fields were left out; rebuild them with a Form element (forms plugin).",
      );
      return [];
    }
    if (tag.includes("-"))
      this.ctx.note(
        "unmapped",
        `<${tag.slice(0, 40)}>`,
        "A custom element became a plain box; only its text and images were kept.",
      );
    return this.container(el, depth);
  }

  private alignStyle(el: HtmlElement): Style {
    const align = alignOf(el);
    return align ? { textAlign: align } : {};
  }

  /** A box for a section, div… Single children and empty boxes don't add a level. */
  container(el: HtmlElement, depth: number, style: Style = {}): N[] {
    const deep = depth >= MAX_BOX_DEPTH;
    const kids = withStyle(this.nodes(el.children, deep ? depth : depth + 1), this.alignStyle(el));
    if (deep) {
      if (kids.length > 0)
        this.ctx.note(
          "approximated",
          "Boxes",
          "Boxes nested deeper than EmVB allows were flattened into their parent.",
        );
      return kids;
    }
    const id = el.attrs["id"]?.trim();
    const htmlId = id && isValidHtmlId(id) && !this.ctx.htmlIds.has(id) ? id : undefined;
    if (kids.length === 0) return [];
    if (kids.length === 1 && !htmlId && Object.keys(style).length === 0) return kids;
    if (htmlId) this.ctx.htmlIds.add(htmlId);
    const tag =
      (CONTAINER_TAGS as readonly string[]).includes(el.tag) && el.tag !== "div"
        ? el.tag
        : undefined;
    const made = this.box(kids, style, tag ? { tag } : {});
    if (htmlId) made["htmlId"] = htmlId;
    return [made];
  }

  /** Reads inline content into text with formatting for each character. */
  private collect(
    list: readonly HtmlNode[],
    run: Run,
    stack: Fmt[],
    href: string | undefined,
    linked: boolean,
  ): void {
    for (const item of list) {
      if (item.kind === "block") {
        this.collect(item.children, run, stack, href, linked);
        continue;
      }
      if (item.kind === "text") {
        const text = item.text.replace(/[\r\n\t\f]+/g, " ");
        this.addRun(run, text, stack, href);
        if (linked) {
          const last = run.links.at(-1);
          if (last) last.text += text;
        } else if (text.trim()) run.outside = true;
        continue;
      }
      this.attributes(item);
      const tag = item.tag;
      if (tag === "br") {
        this.addRun(run, "\n", stack, href);
        continue;
      }
      if (tag === "a") {
        const safe = this.href(item.attrs["href"]);
        const opens = safe !== undefined && !linked;
        if (opens) run.links.push({ href: safe, text: "" });
        this.collect(item.children, run, stack, safe ?? href, linked || opens);
        continue;
      }
      let f: Fmt | undefined;
      if (tag === "strong" || tag === "b") f = { bold: true };
      else if (tag === "em" || tag === "i" || tag === "cite" || tag === "dfn") f = { italic: true };
      else if (tag === "span" || tag === "font" || tag === "mark") {
        const raw =
          declared(item.attrs["style"], "color") ??
          (tag === "font" ? item.attrs["color"] : undefined);
        const hex = raw ? color(raw) : undefined;
        if (hex && hex.length <= 7) f = { color: hex };
      }
      if (!f && FLATTENED.has(tag))
        this.ctx.note(
          "approximated",
          "Text",
          "Inline formatting EmVB doesn't have (underline, superscript, code, highlights) became plain text.",
        );
      if (tag === "img" || tag === "iframe" || tag === "video" || tag === "audio") continue;
      this.collect(item.children, run, f ? [...stack, f] : stack, href, linked);
    }
  }

  private addRun(run: Run, text: string, stack: readonly Fmt[], href: string | undefined): void {
    run.raw += text;
    const out: Fmt = {};
    for (const f of stack) {
      if (f.bold) out.bold = true;
      if (f.italic) out.italic = true;
      if (f.color) out.color = f.color;
    }
    if (href) out.href = href;
    const fmt = Object.keys(out).length > 0 ? out : undefined;
    for (let i = 0; i < text.length; i++) run.fmts.push(fmt);
  }

  /** Inline content's plain text, its marks and the one link it is (when it is one). */
  inline(list: readonly HtmlNode[], keepBreaks: boolean) {
    const run: Run = { raw: "", fmts: [], links: [], outside: false };
    this.collect(list, run, [], undefined, false);
    const text = cleanText(run.raw, keepBreaks);
    const single = splitLong(text).length === 1;
    const marks =
      single && run.fmts.some(Boolean) ? marksFromChars(run.raw, run.fmts, keepBreaks, text) : [];
    const onlyLink = run.links.length === 1 && !run.outside ? run.links[0] : undefined;
    return { text, marks, onlyLink };
  }

  /** Plain text of any content (alt-text style: no breaks, no marks). */
  plain(list: readonly HtmlNode[]): string {
    return this.inline(list, false).text;
  }

  /** Loose text and inline elements → a Text (or a Link when it is one whole link). */
  paragraph(list: readonly HtmlNode[]): N[] {
    const { text, marks, onlyLink } = this.inline(list, true);
    if (!text) return [];
    if (!this.take(text)) return [];
    this.unit(true);
    if (onlyLink && text.length <= MAX_TEXT_LENGTH && !text.includes("\n"))
      return [this.node("link", { text, href: onlyLink.href })];
    const parts = splitLong(text);
    return parts.map((part) =>
      this.node("text", {
        text: part,
        ...(parts.length === 1 && marks.length > 0 ? { marks } : {}),
      }),
    );
  }

  heading(el: HtmlElement, level: number): N[] {
    const { text, marks, onlyLink } = this.inline(el.children, false);
    if (!text || !this.take(text)) return [];
    this.unit(true);
    const own = onlyLink
      ? marks.flatMap(({ href: _href, ...rest }) =>
          rest.bold || rest.italic || rest.color ? [rest] : [],
        )
      : marks;
    const parts = splitLong(text);
    return withStyle(
      parts.map((part) =>
        this.node("heading", {
          text: part,
          level,
          ...(onlyLink ? { href: onlyLink.href } : {}),
          ...(parts.length === 1 && own.length > 0 ? { marks: own } : {}),
        }),
      ),
      this.alignStyle(el),
    );
  }

  /** `ul`/`ol` → a List of plain items; nested lists join it one level down. */
  list(el: HtmlElement): N[] {
    const items: string[] = [];
    let nested = false;
    const visit = (list: readonly HtmlNode[], level: number) => {
      for (const item of list) {
        if (item.kind === "text") continue;
        if (item.kind === "block") {
          visit(item.children, level);
          continue;
        }
        if (item.tag !== "li") {
          if (item.tag === "ul" || item.tag === "ol") visit(item.children, level + 1);
          continue;
        }
        const own = item.children.filter(
          (child) => !(child.kind === "element" && (child.tag === "ul" || child.tag === "ol")),
        );
        const text = this.plain(own);
        if (level > 0) nested = true;
        if (text && this.take(text))
          for (const part of splitLong(text)) if (items.length < MAX_LIST_ITEMS) items.push(part);
        for (const child of item.children)
          if (child.kind === "element" && (child.tag === "ul" || child.tag === "ol"))
            visit(child.children, level + 1);
          else if (child.kind === "block") visit(child.children, level + 1);
      }
    };
    visit(el.children, 0);
    if (nested)
      this.ctx.note(
        "approximated",
        "Lists",
        "Nested lists became one level (EmVB lists have one level).",
      );
    if (items.length >= MAX_LIST_ITEMS)
      this.ctx.note("skipped", "Lists", `Lists keep their first ${MAX_LIST_ITEMS} items.`);
    this.unit(items.length > 0);
    if (items.length === 0) return [];
    const ordered = el.tag === "ol";
    const start = ordered ? Number(el.attrs["start"]) : Number.NaN;
    return withStyle(
      [
        this.node("list", {
          items,
          ...(ordered ? { ordered: true } : {}),
          ...(Number.isInteger(start) && start > 1 && start <= 9999 ? { start } : {}),
        }),
      ],
      this.alignStyle(el),
    );
  }

  /** An `img` → its safe address, alt text and size; undefined (noted) when unusable. */
  picture(
    el: HtmlElement,
  ): { src: string; alt: string; decorative?: true; width?: number; height?: number } | undefined {
    const raw =
      el.attrs["src"] ||
      el.attrs["data-src"] ||
      el.attrs["data-lazy-src"] ||
      el.attrs["data-orig-file"] ||
      "";
    const src = sanitizeMediaUrl(raw.trim());
    if (!src) {
      this.ctx.note(
        "skipped",
        "Images",
        "Images with an unsupported address (data:, blob: or a script) were left out.",
      );
      return undefined;
    }
    const width = dimension(el.attrs["width"]);
    const height = dimension(el.attrs["height"]);
    const given = "alt" in el.attrs;
    const alt = cleanText(stripControl(el.attrs["alt"] ?? "")).slice(0, 500);
    if (!given)
      this.ctx.note(
        "approximated",
        "Images",
        "Images without alt text got one from their file name; check it.",
      );
    this.ctx.externalImage(src);
    if (src.startsWith("/") && !this.gutenberg)
      this.ctx.note(
        "approximated",
        "Images",
        "Images with addresses on the old site (/images/… without the site's name) now load from this site; upload them to the media library and pick them in the editor.",
      );
    return {
      src,
      alt: given ? alt : altFromUrl(src),
      ...(given && !alt ? { decorative: true as const } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    };
  }

  image(
    el: HtmlElement,
    extra: { href?: string; newTab?: boolean; caption?: string } = {},
  ): N | undefined {
    const pic = this.picture(el);
    if (!pic) return undefined;
    return this.node(
      "image",
      {
        ...pic,
        ...(extra.href ? { href: extra.href } : {}),
        ...(extra.href && extra.newTab ? { newTab: true } : {}),
        ...(extra.caption ? { caption: extra.caption.slice(0, 500) } : {}),
      },
      { style: { maxWidth: { value: 100, unit: "%" } } },
    );
  }

  private imageNodes(
    el: HtmlElement,
    extra: { href?: string; newTab?: boolean; caption?: string } = {},
  ): N[] {
    const made = this.image(el, extra);
    this.unit(made !== undefined);
    return made ? [made] : [];
  }

  /** A link that holds more than text: a picture (linked image), a button, or boxes. */
  linkBlock(el: HtmlElement, depth: number): N[] {
    const href = this.href(el.attrs["href"]);
    const newTab = el.attrs["target"] === "_blank";
    const elements = el.children.filter((c): c is HtmlElement => c.kind === "element");
    const img = elements.length === 1 && elements[0]?.tag === "img" ? elements[0] : undefined;
    if (img && !this.plain(el.children.filter((c) => c !== img)))
      return this.imageNodes(img, { ...(href ? { href } : {}), newTab });
    if (
      BUTTON_CLASS.test(el.attrs["class"] ?? "") &&
      !el.children.some((c) => c.kind === "element" && this.blockish(c))
    ) {
      return this.button(el.children, href, newTab);
    }
    if (href)
      this.ctx.note(
        "approximated",
        "Links",
        "Links around whole boxes were left out (EmVB links text, buttons and images); their content was kept.",
      );
    return this.nodes(el.children, depth);
  }

  button(content: readonly HtmlNode[], href: string | undefined, newTab: boolean): N[] {
    const text = this.plain(content).slice(0, 200);
    this.unit(text.length > 0);
    if (!text) return [];
    return [
      this.node("button", {
        text,
        ...(href ? { href } : {}),
        ...(href && newTab ? { newTab: true } : {}),
      }),
    ];
  }

  figure(el: HtmlElement, depth: number): N[] {
    const caption = el.children.find(
      (c): c is HtmlElement => c.kind === "element" && c.tag === "figcaption",
    );
    const rest = el.children.filter((c) => c !== caption);
    const elements = rest.filter((c): c is HtmlElement => c.kind === "element");
    const only =
      elements.length === 1 && !this.plain(rest.filter((c) => c.kind === "text"))
        ? elements[0]
        : undefined;
    const captionText = caption ? this.plain(caption.children).slice(0, 500) : "";
    if (only?.tag === "img")
      return this.imageNodes(only, captionText ? { caption: captionText } : {});
    if (only?.tag === "a") {
      const inner = only.children.filter((c): c is HtmlElement => c.kind === "element");
      if (inner.length === 1 && inner[0]?.tag === "img") {
        const href = this.href(only.attrs["href"]);
        return this.imageNodes(inner[0], {
          ...(href ? { href } : {}),
          newTab: only.attrs["target"] === "_blank",
          ...(captionText ? { caption: captionText } : {}),
        });
      }
    }
    if (only?.tag === "picture") {
      const img = only.children.find(
        (c): c is HtmlElement => c.kind === "element" && c.tag === "img",
      );
      if (img) return this.imageNodes(img, captionText ? { caption: captionText } : {});
    }
    if (only?.tag === "blockquote") return this.quote(only.children, depth, caption?.children);
    return this.container(el, depth);
  }

  /** A quote: its paragraphs beside a line, then who said it ("— Name"). */
  quote(content: readonly HtmlNode[], depth: number, citeContent?: readonly HtmlNode[]): N[] {
    const cite = citeContent ?? content.find(isCite)?.children;
    const body = this.nodes(
      content.filter((c) => !isCite(c)),
      depth + 1,
    );
    const who = cite ? this.plain(cite) : "";
    if (who && this.take(who))
      body.push(this.node("text", { text: `— ${who}`.slice(0, MAX_TEXT_LENGTH) }));
    if (body.length === 0) return [];
    return [
      this.box(body, {
        gap: { value: 8, unit: "px" },
        borderStyle: "solid",
        borderWidth: { value: 0, unit: "px" },
        borderLeftWidth: { value: 4, unit: "px" },
        paddingLeft: { value: 20, unit: "px" },
      }),
    ];
  }

  /** A table → a Grid of its cells (EmVB has no table element); header cells are bold. */
  table(el: HtmlElement): N[] {
    const rows: HtmlElement[][] = [];
    let caption: string | undefined;
    const visit = (list: readonly HtmlNode[]) => {
      for (const item of list) {
        if (item.kind === "text") continue;
        if (item.kind === "block") {
          visit(item.children);
          continue;
        }
        if (item.tag === "caption") caption = this.plain(item.children);
        else if (item.tag === "tr") {
          const cells = item.children.filter(
            (c): c is HtmlElement => c.kind === "element" && (c.tag === "td" || c.tag === "th"),
          );
          if (cells.length > 0 && rows.length < MAX_TABLE_ROWS) rows.push(cells);
        } else if (TRANSPARENT.has(item.tag)) visit(item.children);
      }
    };
    visit(el.children);
    this.unit(rows.length > 0);
    if (rows.length === 0) return [];
    const columns = Math.min(MAX_TABLE_COLUMNS, Math.max(...rows.map((r) => r.length)));
    this.ctx.note(
      "approximated",
      "Tables",
      "Tables became a grid of text (EmVB has no table element), so screen readers no longer read them as a table.",
    );
    if (rows.some((r) => r.length > MAX_TABLE_COLUMNS))
      this.ctx.note("skipped", "Tables", `Tables keep their first ${MAX_TABLE_COLUMNS} columns.`);
    const cells: N[] = [];
    for (const row of rows) {
      for (let i = 0; i < columns; i++) {
        if (this.ctx.overBudget) break;
        const cell = row[i];
        const text = cell ? this.plain(cell.children) : "";
        if (!this.take(text)) break;
        cells.push(
          this.node(
            "text",
            { text: text.slice(0, MAX_TEXT_LENGTH) },
            cell?.tag === "th" ? { style: { fontWeight: 700 } } : {},
          ),
        );
      }
    }
    const grid = this.node(
      "grid",
      { columns },
      {
        style: { gap: { value: 8, unit: "px" } },
        children: cells,
      },
    );
    if (!caption) return [grid];
    return [
      this.box(
        [
          this.node(
            "text",
            { text: caption.slice(0, MAX_TEXT_LENGTH) },
            { style: { fontWeight: 700 } },
          ),
          grid,
        ],
        { gap: { value: 8, unit: "px" } },
      ),
    ];
  }

  /** A YouTube or Vimeo frame → a Video; other frames are left out. */
  embed(el: HtmlElement): N[] {
    const raw = el.attrs["src"] ?? "";
    const url = this.videoUrl(raw);
    this.unit(url !== undefined);
    if (url) return [this.videoNode(url, el.attrs["title"])];
    if (el.attrs["srcdoc"] !== undefined && !raw)
      this.ctx.note(
        "skipped",
        "Embeds",
        "Embedded frames with their own HTML (srcdoc) were left out.",
      );
    else
      this.ctx.note(
        "skipped",
        "Embeds",
        "Embedded frames other than YouTube and Vimeo videos were left out (maps, forms, social posts…).",
      );
    return [];
  }

  /** A YouTube, Vimeo or video file address EmVB's Video element plays; undefined otherwise. */
  videoUrl(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const watch = embedVideoUrl(trimmed);
    const candidate = watch ?? trimmed;
    if (candidate.startsWith("//")) return undefined;
    const target = resolveEmbedUrl(candidate);
    if (!target) return undefined;
    return target.kind === "iframe" ? candidate : (sanitizeMediaUrl(candidate) ?? undefined);
  }

  videoNode(url: string, title: string | undefined): N {
    const name = cleanText(stripControl(title ?? "")).slice(0, 200) || "Video";
    return this.node("video", { url, title: name });
  }

  video(el: HtmlElement): N[] {
    const source = el.children.find(
      (c): c is HtmlElement =>
        c.kind === "element" && c.tag === "source" && Boolean(c.attrs["src"]),
    );
    const url = this.videoUrl(el.attrs["src"] ?? source?.attrs["src"] ?? "");
    this.unit(url !== undefined);
    if (!url) {
      this.ctx.note("skipped", "Videos", "Videos with an unsupported address were left out.");
      return [];
    }
    return [this.videoNode(url, el.attrs["title"] ?? el.attrs["aria-label"])];
  }

  /** `details` → an Accordion with one item, open when it was. */
  details(el: HtmlElement, depth: number): N[] {
    const summary = el.children.find(
      (c): c is HtmlElement => c.kind === "element" && c.tag === "summary",
    );
    const title = (summary ? this.plain(summary.children) : "").slice(0, 200) || "Details";
    const body = this.nodes(
      el.children.filter((c) => c !== summary),
      depth + 2,
    );
    this.unit(true);
    const item = this.node(
      "accordion-item",
      { summary: title, ...("open" in el.attrs ? { open: true } : {}) },
      { children: body },
    );
    return [this.node("accordion", {}, { children: [item] })];
  }

  /** Preformatted text and code: a Text that keeps its spacing, in a monospace font. */
  pre(el: HtmlElement): N[] {
    // WordPress's Verse block is a poem: it keeps its spacing but not a code font.
    const verse = /(?:^|\s)wp-block-verse(?:\s|$)/.test(el.attrs["class"] ?? "");
    let raw = "";
    const visit = (list: readonly HtmlNode[]) => {
      for (const item of list) {
        if (item.kind === "text") raw += item.text;
        else if (item.kind === "element" && item.tag === "br") raw += "\n";
        else visit(item.children);
      }
    };
    visit(el.children);
    const text = stripControl(raw.replace(/\r\n?/g, "\n").replace(/\t/g, "  ")).replace(
      /^\n|\n+$/g,
      "",
    );
    this.unit(text.trim().length > 0);
    if (!text.trim() || !this.take(text)) return [];
    return splitLong(text).map((part) =>
      this.node(
        "text",
        { text: part },
        { style: { whiteSpace: "pre-wrap", ...(verse ? {} : { fontFamily: "monospace" }) } },
      ),
    );
  }

  /** `dl` → its terms (bold) and descriptions as Text. */
  definitions(el: HtmlElement, depth: number): N[] {
    const out: N[] = [];
    const visit = (list: readonly HtmlNode[]) => {
      for (const item of list) {
        if (item.kind !== "element") continue;
        if (item.tag === "dt")
          out.push(...withStyle(this.nodes(item.children, depth + 1), { fontWeight: 700 }));
        else if (item.tag === "dd")
          out.push(
            ...withStyle(this.nodes(item.children, depth + 1), {
              paddingLeft: { value: 16, unit: "px" },
            }),
          );
        else if (item.tag === "div") visit(item.children);
      }
    };
    visit(el.children);
    if (out.length === 0) return [];
    return [this.box(out, { gap: { value: 4, unit: "px" } })];
  }
}
