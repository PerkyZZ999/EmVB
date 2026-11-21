/**
 * Import from WordPress or HTML (W-1074): WordPress post content (Gutenberg block markup) or any
 * HTML page → an EmVB layout and a report, like the Elementor import (D-069). Pure and
 * synchronous; the admin passes the pasted or uploaded text in and nothing is ever fetched.
 * The result is always a layout EmVB accepts: what fails validation is pruned and reported.
 */
import type { Layout } from "../../schema/layout.ts";
import { ImportContext, type ImportNote, type ImportOptions } from "../elementor/context.ts";
import { cleanText, stripControl } from "../elementor/html.ts";
import { pointAtCopies, validImport } from "../elementor/index.ts";
import { mapBlock } from "./blocks.ts";
import { Mapper } from "./map.ts";
import { type HtmlElement, type HtmlNode, parseHtml } from "./parse.ts";

/** Pasted or uploaded HTML larger than this is refused before reading. */
export const MAX_HTML_IMPORT_CHARS = 4 * 1024 * 1024;

export type HtmlImportOptions = Pick<ImportOptions, "media" | "random">;

export type HtmlImport =
  | {
      ok: true;
      layout: Layout;
      /** The page's `<title>` (or its first main heading). */
      title?: string;
      /** WordPress block markup, or plain HTML. */
      source: "wordpress" | "html";
      /** Blocks (WordPress) or content elements (HTML) read, and how many became EmVB elements. */
      elements: number;
      mapped: number;
      notes: ImportNote[];
      /** Images on another site the page uses (the dialog can copy them to the media library). */
      images: string[];
    }
  | { ok: false; error: string };

/** The `main` element, when a whole page has exactly one: only it is imported. */
function mainOf(nodes: readonly HtmlNode[]): HtmlElement | undefined {
  const found: HtmlElement[] = [];
  const visit = (list: readonly HtmlNode[], level: number) => {
    for (const item of list) {
      if (item.kind !== "element" || level > 12 || found.length > 1) continue;
      if (item.tag === "main") found.push(item);
      else visit(item.children, level + 1);
    }
  };
  visit(nodes, 0);
  return found.length === 1 ? found[0] : undefined;
}

/** The text of the first `h1`, for the page title when there is no `<title>`. */
function firstHeading(nodes: readonly HtmlNode[]): string | undefined {
  const textOf = (list: readonly HtmlNode[]): string =>
    list.map((item) => (item.kind === "text" ? item.text : textOf(item.children))).join("");
  const stack = [...nodes];
  for (let seen = 0; stack.length > 0 && seen < 5000; seen++) {
    const item = stack.shift();
    if (!item || item.kind === "text") continue;
    if (item.kind === "element" && item.tag === "h1")
      return cleanText(stripControl(textOf(item.children))).slice(0, 200) || undefined;
    stack.unshift(...item.children);
  }
  return undefined;
}

/** WordPress post content or an HTML page → an EmVB layout and an import report. */
export function importHtml(input: string, options: HtmlImportOptions = {}): HtmlImport {
  if (input.length > MAX_HTML_IMPORT_CHARS)
    return { ok: false, error: "This file is larger than 4 MB. Import one page at a time." };
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste or choose some HTML first." };
  if (/^[[{]/.test(text))
    return {
      ok: false,
      error: "This looks like JSON. For an Elementor export, use Import from Elementor.",
    };
  if (/^<\?xml[\s\S]{0,400}<rss/i.test(text))
    return {
      ok: false,
      error:
        "This is a WordPress export file (WXR). Open the post in WordPress's code editor and paste its content instead.",
    };
  const parsed = parseHtml(text);
  const ctx = new ImportContext(options);
  ctx.findOldSite(text.slice(0, 1_000_000));
  const gutenberg = parsed.blocks;
  const m = new Mapper(ctx, gutenberg, mapBlock);

  let nodes = parsed.nodes;
  const main = gutenberg ? undefined : mainOf(nodes);
  if (main) {
    nodes = main.children;
    ctx.note(
      "approximated",
      "Page",
      "Only the page's main content was imported. Its header, navigation and footer were left out; build those in Theme Builder.",
    );
  }
  const children = m.nodes(nodes, 1);
  for (const what of parsed.dropped)
    ctx.note("skipped", "Scripts and styles", `Left out: ${what}.`);
  if (parsed.flattened)
    ctx.note("approximated", "Page", "Markup nested very deeply was flattened.");
  if (parsed.cut)
    ctx.note(
      "skipped",
      "Page",
      "The page has more markup than one import reads; the rest was left out.",
    );
  if (children.length === 0)
    return {
      ok: false,
      error:
        "Nothing in this HTML could be imported." +
        (ctx.report()[0] ? ` (${ctx.report()[0]?.message})` : " It has no text, images or videos."),
    };
  ctx.note(
    "approximated",
    "Styles",
    "Your old site's stylesheets and classes aren't imported; the page takes your EmVB site styles.",
  );
  const root = m.node(
    "container",
    {},
    {
      style: {
        flexDirection: "column",
        gap: { value: 16, unit: "px" },
        width: { value: 100, unit: "%" },
        maxWidth: { value: 1140, unit: "px" },
        marginLeft: "auto",
        marginRight: "auto",
        paddingTop: { value: 40, unit: "px" },
        paddingBottom: { value: 40, unit: "px" },
        paddingLeft: { value: 20, unit: "px" },
        paddingRight: { value: 20, unit: "px" },
      },
      children,
    },
  );
  if (options.media) pointAtCopies(root, ctx);
  const checked = validImport(root, ctx);
  if (!checked.ok) return checked;
  const title = parsed.title ?? firstHeading(nodes);
  return {
    ok: true,
    layout: checked.layout,
    ...(title ? { title } : {}),
    source: gutenberg ? "wordpress" : "html",
    elements: ctx.elements,
    mapped: ctx.mapped,
    notes: ctx.report(),
    images: [...ctx.images],
  };
}
