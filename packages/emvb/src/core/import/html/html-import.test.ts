import { describe, expect, test } from "bun:test";
import gutenbergPost from "../../../../test/fixtures/html/gutenberg-post.html.txt";
import plainPage from "../../../../test/fixtures/html/plain-page.html.txt";
import { XSS_CORPUS } from "../../../../test/fixtures/xss.ts";
import { MAX_DEPTH, MAX_LAYOUT_BYTES, MAX_NODES } from "../../limits.ts";
import { renderPage } from "../../render/index.ts";
import { emptyDesign } from "../../schema/design.ts";
import type { Layout, LayoutNode } from "../../schema/layout.ts";
import { validateLayout } from "../../validate.ts";
import { type HtmlImport, importHtml, MAX_HTML_IMPORT_CHARS } from "./index.ts";

// The fixtures are `.html.txt` so formatters and linters leave their (deliberately loose) markup alone.
const FIXTURES: Record<string, string> = {
  "gutenberg-post.html": gutenbergPost,
  "plain-page.html": plainPage,
};
const fixture = (name: string) => FIXTURES[name] ?? "";

type Node = LayoutNode & {
  children?: Node[];
  style?: Record<string, unknown>;
  devices?: Record<string, Record<string, unknown>>;
};

function ok(result: HtmlImport) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

const all = (node: Node): Node[] => [node, ...(node.children ?? []).flatMap(all)];
const nodes = (layout: Layout) => all(layout.root as Node);
const ofType = (layout: Layout, type: string) => nodes(layout).filter((n) => n.type === type);
const props = (n: Node | undefined) => (n?.props ?? {}) as Record<string, unknown>;
const notes = (result: { notes: { message: string }[] }) =>
  result.notes.map((n) => n.message).join("\n");
const depthOf = (node: Node): number =>
  1 + Math.max(0, ...(node.children ?? []).map((c) => depthOf(c)));

function render(layout: Layout) {
  return renderPage(layout, emptyDesign()) as { html: string; css?: string };
}

describe("W-1074: WordPress block markup", () => {
  const result = ok(importHtml(fixture("gutenberg-post.html")));
  const layout = result.layout;

  test("the report counts blocks and the title comes from the first main heading", () => {
    expect(result.source).toBe("wordpress");
    expect(result.title).toBe("Visit the Riverside bakery");
    expect(result.elements).toBeGreaterThan(20);
    expect(result.mapped).toBeLessThan(result.elements);
    expect(validateLayout(layout).ok).toBe(true);
  });

  test("headings and paragraphs keep their level, alignment, colour and inline marks", () => {
    const [h1] = ofType(layout, "heading");
    expect(props(h1)).toMatchObject({ text: "Visit the Riverside bakery", level: 1 });
    expect(props(h1)["marks"]).toEqual([{ start: 10, end: 19, italic: true }]);
    expect(h1?.style?.["textAlign"]).toBe("center");
    const para = ofType(layout, "text").find((n) => String(props(n)["text"]).startsWith("Fresh"));
    expect(para?.style?.["color"]).toBe("#334155");
    const marks = props(para)["marks"] as { href?: string; bold?: true }[];
    expect(marks.some((m) => m.bold)).toBe(true);
    // A link to the old site's page now points at the same path on this site.
    expect(marks.some((m) => m.href === "/menu")).toBe(true);
  });

  test("lists, images, galleries and buttons map onto EmVB's elements", () => {
    const [list] = ofType(layout, "list");
    expect(props(list)).toEqual({ ordered: true, items: ["Sourdough", "Rye", "Dark rye"] });
    const [image] = ofType(layout, "image");
    expect(props(image)).toMatchObject({ alt: "A loaf on a board", caption: "Our country loaf" });
    const [gallery] = ofType(layout, "gallery");
    expect(props(gallery)).toEqual({ columns: 2, lightbox: true });
    expect(gallery?.children?.map((c) => props(c)["alt"])).toEqual(["Croissants", "Fruit tart"]);
    const [button] = ofType(layout, "button");
    expect(props(button)).toEqual({ text: "Order online", href: "/order", newTab: true });
    expect(result.images).toContain("https://bakery.example/wp-content/uploads/2026/03/loaf.jpg");
  });

  test("columns keep their widths and stack on phones; groups and covers keep their look", () => {
    const row = nodes(layout).find(
      (n) => n.style?.["flexDirection"] === "row" && n.style["gap"] !== undefined && n.devices,
    );
    expect(row?.devices?.["mobile"]).toEqual({ flexDirection: "column" });
    expect(row?.children?.[0]?.style?.["flexBasis"]).toEqual({ value: 40, unit: "%" });
    expect(row?.children?.[1]?.style?.["flexGrow"]).toBe(1);
    const group = nodes(layout).find((n) => n.style?.["backgroundColor"] === "#fef3c7");
    expect(group?.style?.["paddingTop"]).toEqual({ value: 32, unit: "px" });
    expect(group?.children).toHaveLength(2);
    const cover = nodes(layout).find((n) => typeof n.style?.["backgroundImage"] === "string");
    expect(cover?.style).toMatchObject({
      backgroundImage: "https://bakery.example/wp-content/uploads/2026/03/oven.jpg",
      minHeight: { value: 360, unit: "px" },
      overlay: { color: "#000000", opacity: 0.4 },
      color: "#ffffff",
    });
    expect(props(cover?.children?.[0])["text"]).toBe("Baked since 1987");
  });

  test("separators, spacers, embeds, tables, social links and quotes", () => {
    expect(ofType(layout, "divider")).toHaveLength(1);
    expect(props(ofType(layout, "spacer")[0])).toEqual({ height: { value: 48, unit: "px" } });
    expect(props(ofType(layout, "video")[0])).toEqual({
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      title: "A morning in the bakery",
    });
    const [grid] = ofType(layout, "grid");
    expect(props(grid)).toEqual({ columns: 2 });
    expect(grid?.children?.map((c) => props(c)["text"])).toEqual([
      "Bread",
      "Price",
      "Sourdough",
      "6.50",
      "Rye",
      "5.00",
    ]);
    expect(grid?.children?.[0]?.style?.["fontWeight"]).toBe(700);
    const social = ofType(layout, "social-link").map((n) => props(n)["network"]);
    expect(social).toEqual(["instagram", "email"]);
    const quote = ofType(layout, "text").find((n) => props(n)["text"] === "— A happy customer");
    expect(quote).toBeDefined();
  });

  test("WordPress-only blocks, shortcodes and plugin blocks are reported", () => {
    const report = notes(result);
    expect(report).toContain("WordPress builds this when the page is shown");
    expect(report).toContain('The shortcode [contact-form-7 id="12"] needs WordPress');
    const plugin = result.notes.find((n) => n.element === "Acme: Testimonial Slider");
    expect(plugin?.kind).toBe("unmapped");
    expect(ofType(layout, "text").some((n) => props(n)["text"] === "Lovely staff.")).toBe(true);
    // The Custom HTML block keeps its words, never its script.
    expect(ofType(layout, "text").some((n) => props(n)["text"] === "Free coffee on Fridays")).toBe(
      true,
    );
    expect(JSON.stringify(layout)).not.toContain("track()");
    expect(report).toContain("Left out: scripts.");
  });

  test("a search block's and a social link's texts from block attributes are plain one-liners", () => {
    const imported = ok(
      importHtml(
        [
          '<!-- wp:search {"label":"Find\\u0000 it\\n now","placeholder":"  Bread\\u0007…  ","buttonText":"Go"} /-->',
          '<!-- wp:social-links --><ul><!-- wp:social-link {"url":"https://instagram.com/x","service":"instagram","label":"Our\\u0001\\n photos"} /--></ul><!-- /wp:social-links -->',
        ].join("\n"),
      ),
    );
    expect(props(ofType(imported.layout, "search-form")[0])).toEqual({
      label: "Find it now",
      placeholder: "Bread…",
      buttonText: "Go",
    });
    expect(props(ofType(imported.layout, "social-link")[0])["label"]).toBe("Our photos");
  });
});

describe("W-1074: a plain HTML page", () => {
  const result = ok(importHtml(fixture("plain-page.html")));
  const layout = result.layout;
  const texts = ofType(layout, "text").map((n) => props(n)["text"]);

  test("only the main content is imported, with the document's title", () => {
    expect(result.source).toBe("html");
    expect(result.title).toBe("Harbour Walks & Tours");
    expect(JSON.stringify(layout)).not.toContain("Harbour Walks</");
    expect(texts).not.toContain("© Harbour Walks");
    expect(notes(result)).toContain("Only the page's main content was imported");
    expect(validateLayout(layout).ok).toBe(true);
  });

  test("sections become boxes; headings, breaks, colour and alignment are kept", () => {
    const sections = ofType(layout, "container").filter((n) => props(n)["tag"] === "section");
    expect(sections).toHaveLength(2);
    expect(sections[0]?.htmlId).toBe("intro");
    const [h1] = ofType(layout, "heading");
    expect(h1?.style?.["textAlign"]).toBe("center");
    expect(props(h1)["marks"]).toEqual([{ start: 13, end: 20, color: "#d97706" }]);
    expect(texts).toContain("Two-hour guided walks\nevery weekend.");
    expect(props(ofType(layout, "button")[0])).toEqual({ text: "Book a walk", href: "/book" });
  });

  test("lists with implied ends, figures, decorative images and quotes", () => {
    expect(props(ofType(layout, "list")[0])["items"]).toEqual([
      "The lighthouse",
      "The fish market",
      "The old customs house",
    ]);
    const [figure, decor] = ofType(layout, "image");
    expect(props(figure)).toMatchObject({
      src: "https://harbour.example/images/lighthouse.jpg",
      width: 800,
      height: 600,
      caption: "The lighthouse",
    });
    expect(props(decor)).toMatchObject({ alt: "", decorative: true });
    expect(notes(result)).toContain("Images with addresses on the old site (/images/");
    expect(texts).toContain("— Sam, from Leeds");
  });

  test("tables, frames, details, pre, links and video", () => {
    expect(texts).toContain("Prices");
    expect(ofType(layout, "video").map((n) => props(n)["url"])).toEqual([
      "https://vimeo.com/76979871",
      "/media/harbour.mp4",
    ]);
    const [item] = ofType(layout, "accordion-item");
    expect(props(item)["summary"]).toBe("Is it accessible?");
    const pre = ofType(layout, "text").find((n) => n.style?.["whiteSpace"] === "pre-wrap");
    expect(props(pre)["text"]).toBe("Meet at:\n  Pier 3, by the clock");
    const contact = ofType(layout, "text").find((n) =>
      String(props(n)["text"]).startsWith("Email"),
    );
    const hrefs = (props(contact)["marks"] as { href?: string }[]).map((m) => m.href);
    expect(hrefs).toEqual(["mailto:hello@harbour.example", "tel:+442079460000"]);
    const report = notes(result);
    expect(report).toContain("Embedded frames other than YouTube and Vimeo videos were left out");
    expect(report).toContain("Forms and their fields were left out");
    expect(report).toContain("Inline styles were left out");
    expect(report).toContain("Left out: scripts.");
  });

  test("copied images replace the old addresses (media option)", () => {
    const copied = ok(
      importHtml(fixture("plain-page.html"), {
        media: (url) =>
          url === "https://harbour.example/images/lighthouse.jpg"
            ? { url: "/_emdash/api/media/file/l.jpg", id: "m1" }
            : undefined,
      }),
    );
    expect(props(ofType(copied.layout, "image")[0])).toMatchObject({
      src: "/_emdash/api/media/file/l.jpg",
      mediaId: "m1",
    });
  });
});

describe("W-1074: input that isn't a page", () => {
  test.each([
    ["", "Paste or choose some HTML first."],
    ['{"content": []}', "use Import from Elementor"],
    ['<?xml version="1.0"?><rss version="2.0">', "WordPress export file (WXR)"],
    ["<script>alert(1)</script><style>p{}</style>", "Nothing in this HTML could be imported"],
  ])("%p is refused with a reason", (input, reason) => {
    const result = importHtml(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(reason);
  });

  test("a file over 4 MB is refused before reading", () => {
    const result = importHtml(" ".repeat(MAX_HTML_IMPORT_CHARS + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("larger than 4 MB");
  });
});

describe("W-1074: hostile HTML imports as an inert, valid page", () => {
  const inert = (layout: Layout) => {
    expect(validateLayout(layout).ok).toBe(true);
    const { html, css } = render(layout);
    expect(html).not.toMatch(
      /<script|<iframe|<svg|<object|<embed|<img[^>]*onerror|\son[a-z]+=|javascript:|srcdoc|data:text/i,
    );
    if (css) expect(css).not.toMatch(/<\/style|javascript:|expression\(|url\(data:/i);
    expect(JSON.stringify(layout)).not.toMatch(/javascript:|vbscript:|data:|expression\(/i);
  };

  test.each(XSS_CORPUS)("%p as text, attribute and address lands as inert text", (payload) => {
    const escaped = payload.replaceAll('"', "&quot;");
    const page = [
      `<h1>${payload}</h1>`,
      `<p>${payload}</p>`,
      `<p><a href="${escaped}">${payload}</a></p>`,
      `<img src="${escaped}" alt="${escaped}">`,
      `<ul><li>${payload}</li></ul>`,
      `<table><tr><td>${payload}</td></tr></table>`,
      `<!-- wp:paragraph --><p>${payload}</p><!-- /wp:paragraph -->`,
      `<!-- wp:button --><div><a class="wp-block-button__link" href="${escaped}">x</a></div><!-- /wp:button -->`,
    ].join("\n");
    const result = importHtml(page);
    if (result.ok) inert(result.layout);
  });

  test("scripts, handlers, unsafe addresses, frames and styles are all left out", () => {
    const result = ok(
      importHtml(
        [
          "<script>alert(1)</script>",
          '<p onclick="alert(1)">Click <a href="javascript:alert(1)">me</a></p>',
          '<p><a href="JaVaScRiPt:alert(1)">mixed case</a> <a href="java\tscript:alert(1)">tab</a></p>',
          '<p><a href="&#106;avascript&#58;alert(1)">entity</a> <a href="&#106avascript&colon;alert(1)">loose</a></p>',
          '<p><a href="//evil.example/x">protocol-relative</a> <a href="/\\evil.example">backslash</a></p>',
          '<p><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">data link</a></p>',
          '<img src="x" onerror="alert(1)" alt="broken">',
          '<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+" alt="d">',
          '<img src="javascript:alert(1)" alt="j">',
          '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
          '<iframe src="javascript:alert(1)"></iframe>',
          '<svg onload="alert(1)"><script>alert(1)</script><foreignObject><p>in svg</p></foreignObject></svg>',
          "<math><mtext><style><img src=x onerror=alert(1)></style></mtext></math>",
          '<div style="width: expression(alert(1)); background: url(javascript:alert(1))">styled</div>',
          '<p style="color: expression(alert(1))">expr colour</p>',
          '<object data="x.swf"></object><embed src="x.swf"><base href="https://evil.example/">',
          '<form action="https://evil.example"><input name="pw" type="password"><button formaction="javascript:alert(1)">Go</button></form>',
          '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
          '<video src="javascript:alert(1)"></video><video><source src="data:video/mp4;base64,AAAA"></video>',
          '<!-- wp:cover {"url":"javascript:alert(1)"} --><div><p>cover</p></div><!-- /wp:cover -->',
          '<!-- wp:embed {"url":"javascript:alert(1)"} --><figure></figure><!-- /wp:embed -->',
          '<!-- wp:social-links --><ul><!-- wp:social-link {"url":"javascript:alert(1)","service":"x"} /--></ul><!-- /wp:social-links -->',
          '<!-- wp:group {"style":{"color":{"background":"red;}body{x:y"},"spacing":{"padding":{"top":"expression(1)"}}}} --><div><p>group</p></div><!-- /wp:group -->',
          "<p>safe text</p>",
        ].join("\n"),
      ),
    );
    inert(result.layout);
    const text = JSON.stringify(result.layout);
    expect(text).toContain("safe text");
    expect(text).not.toContain("evil.example");
    const report = notes(result);
    expect(report).toContain("Event handlers (onclick, onerror and the like) were left out.");
    expect(report).toContain("Links with an unsafe or unsupported address");
    expect(report).toContain("Images with an unsupported address");
    expect(report).toContain("Left out: scripts.");
  });

  test("text full of addresses that never reach /wp-content/ reads in linear time", () => {
    const started = performance.now();
    importHtml(`<p>${"http://".repeat(140_000)}</p>`);
    importHtml(`<p>${"https://a/".repeat(100_000)}</p>`);
    expect(performance.now() - started).toBeLessThan(1500);
    // The old site is still found from its uploads, after a long run of other addresses.
    const page = `<p>${"http://x/ ".repeat(5000)}</p><p><a href="https://old.example/blog/menu/">Menu</a></p><img src="https://old.example/blog/wp-content/uploads/a.jpg" alt="a">`;
    expect(JSON.stringify(ok(importHtml(page)).layout)).toContain('"href":"/menu"');
  });

  test("deep nesting stays within EmVB's depth", () => {
    const deep = `${"<div><section>".repeat(3000)}<p>deep</p>${"</section></div>".repeat(3000)}`;
    const result = ok(importHtml(deep));
    inert(result.layout);
    expect(depthOf(result.layout.root as Node)).toBeLessThanOrEqual(MAX_DEPTH);
    expect(JSON.stringify(result.layout)).toContain("deep");
    // The content is kept, flattened into the deepest box EmVB keeps, and the report says so.
    expect(notes(result)).toContain("Boxes nested deeper than EmVB allows were flattened");
    const blocks = `${'<!-- wp:group --><div class="wp-block-group">'.repeat(200)}<p>inner</p>${"</div><!-- /wp:group -->".repeat(200)}`;
    const nested = ok(importHtml(blocks));
    inert(nested.layout);
    expect(depthOf(nested.layout.root as Node)).toBeLessThanOrEqual(MAX_DEPTH);
  });

  test("huge input stays within EmVB's node and size limits", () => {
    const many = ok(importHtml("<p>A short paragraph.</p>".repeat(30_000)));
    inert(many.layout);
    expect(nodes(many.layout).length).toBeLessThanOrEqual(MAX_NODES);
    expect(notes(many)).toMatch(/left out/);
    const long = "word ".repeat(1500);
    const wordy = ok(importHtml(`<p>${long}</p>`.repeat(400)));
    inert(wordy.layout);
    expect(new TextEncoder().encode(JSON.stringify(wordy.layout)).length).toBeLessThanOrEqual(
      MAX_LAYOUT_BYTES,
    );
    expect(notes(wordy)).toContain("more text than one EmVB page holds");
  });
});
