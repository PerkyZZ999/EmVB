import { describe, expect, test } from "bun:test";
import { container } from "../../../test/fixtures/layouts.ts";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { designFromJson, designToJson } from "../design/transfer.ts";
import { canDrop } from "../arrange.ts";
import { renderPage } from "./index.ts";

const design: DesignSystem = emptyDesign();
const page = (children: LayoutNode[], root: Partial<LayoutNode> = {}): Layout => ({
  schemaVersion: 13,
  root: { ...container("root0001", children), ...root } as Layout["root"],
});

describe("design transfer (W-103)", () => {
  test("export then import keeps variables and classes", () => {
    const source: DesignSystem = {
      ...emptyDesign(),
      variables: { colors: [{ id: "ink", name: "Ink", value: "#112233" }] },
      classes: [{ id: "card", name: "Card", style: { color: { var: "ink" } } }],
    };
    const back = designFromJson(designToJson(source));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.design.variables.colors[0]?.value).toBe("#112233");
  });

  test("a newer design file is refused", () => {
    const result = designFromJson(JSON.stringify({ ...emptyDesign(), schemaVersion: 14 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("That design was saved by a newer EmVB.");
  });
});

describe("tag defaults (W-104)", () => {
  test("a heading default is a tag rule that a class still outranks", () => {
    const styled: DesignSystem = {
      ...emptyDesign(),
      defaults: { h1: { color: "#111111" } },
      classes: [{ id: "card", name: "Card", style: { color: "#222222" } }],
    };
    const css = renderPage(page([]), styled).css;
    expect(css).toContain(":where(.emvb-root) h1{color:#111111}");
    expect(css.indexOf(":where(.emvb-root) h1")).toBeLessThan(css.indexOf(".emvb-k-card"));
  });
});

describe("custom attributes (W-105)", () => {
  test("data and aria attributes are escaped and event names are dropped", () => {
    const layout = page([
      {
        id: "head0001",
        type: "heading",
        props: { text: "Hi", level: 2 },
        attributes: [
          { name: "data-track", value: 'a"b' },
          { name: "aria-label", value: "Title" },
          { name: "onclick", value: "alert(1)" },
        ],
      },
    ]);
    const html = renderPage(layout, design).html;
    expect(html).toContain('data-track="a&quot;b"');
    expect(html).toContain('aria-label="Title"');
    expect(html).not.toContain("onclick");
  });
});

describe("accordion (W-106)", () => {
  test("an item is a details element and only fits inside an accordion", () => {
    const item: LayoutNode = {
      id: "item0001",
      type: "accordion-item",
      props: { summary: "More" },
      children: [{ id: "text0001", type: "text", props: { text: "Body" } }],
    };
    const layout = page([{ id: "acco0001", type: "accordion", props: {}, children: [item] }]);
    const html = renderPage(layout, design).html;
    expect(html).toContain("<details");
    expect(html).toContain("<summary>More</summary>");
    expect(canDrop(layout, { kind: "existing", id: "item0001" }, "root0001").ok).toBe(false);
  });
});

describe("entrance motion (W-107)", () => {
  test("slide, delay, and scroll into view stay in the sanitizer", () => {
    const layout = page([
      {
        id: "head0001",
        type: "heading",
        props: { text: "Hi", level: 1 },
        style: { entrance: { type: "slide-up", duration: 500, delay: 120, trigger: "view" } },
      },
    ]);
    const css = renderPage(layout, design).css;
    expect(css).toContain("animation:emvb-slide-up 500ms ease-out 120ms both");
    expect(css).toContain("animation-timeline:view()");
    expect(css).toContain("@keyframes emvb-scale");
  });
});

describe("post date and author (W-108)", () => {
  test("the public page shows the date and the author", () => {
    const layout = page([
      { id: "date0001", type: "post-date", props: {} },
      { id: "auth0001", type: "post-author", props: {} },
    ]);
    const html = renderPage(layout, design, {
      dynamic: {
        post: {
          id: "p",
          slug: "p",
          title: "Hello",
          excerpt: "",
          content: "",
          permalink: "/posts/p",
          publishedAt: "2026-10-02T12:00:00.000Z",
          authorName: "Ada",
        },
      },
    }).html;
    expect(html).toContain(">Oct 2, 2026<");
    expect(html).toContain(">Ada<");
  });
});

describe("logical properties (W-109)", () => {
  test("left and right padding and alignment follow the writing direction", () => {
    const layout = page([
      {
        id: "text0001",
        type: "text",
        props: { text: "Hi" },
        style: {
          paddingLeft: { value: 8, unit: "px" },
          paddingRight: { value: 4, unit: "px" },
          textAlign: "right",
        },
      },
    ]);
    const css = renderPage(layout, design).css;
    expect(css).toContain("padding-inline-start:8px");
    expect(css).toContain("padding-inline-end:4px");
    expect(css).toContain("text-align:end");
  });
});

describe("background video (W-110)", () => {
  test("an allowed video sits behind the element and a script URL does not", () => {
    const layout = page([
      {
        id: "box00001",
        type: "container",
        props: {},
        style: { backgroundVideo: "https://cdn.example/clip.mp4" },
        children: [],
      },
    ]);
    const html = renderPage(layout, design).html;
    expect(html).toContain('class="emvb-bg-video"');
    expect(html).toContain('src="https://cdn.example/clip.mp4"');
    const blocked = page([
      {
        id: "box00002",
        type: "container",
        props: {},
        style: { backgroundVideo: "javascript:alert(1)" },
        children: [],
      },
    ]);
    expect(renderPage(blocked, design).html).not.toContain("emvb-bg-video");
  });
});

describe("link on a container (W-111)", () => {
  test("a box becomes the link, and a link inside the box blocks it", () => {
    const open = page([
      {
        id: "box00001",
        type: "container",
        props: { href: "https://example.com/a" },
        children: [{ id: "text0001", type: "text", props: { text: "Go" } }],
      },
    ]);
    expect(renderPage(open, design).html).toContain(
      '<a class="emvb-container" href="https://example.com/a">',
    );
    const nested = page([
      {
        id: "box00001",
        type: "container",
        props: { href: "https://example.com/a" },
        children: [
          { id: "link0001", type: "link", props: { text: "Inner", href: "https://example.com/b" } },
        ],
      },
    ]);
    const html = renderPage(nested, design).html;
    expect(
      html.startsWith('<div class="emvb-root emvb-container"><div class="emvb-container">'),
    ).toBe(true);
    expect(html).toContain('href="https://example.com/b"');
    expect(html.match(/<a /g)?.length).toBe(1);
  });
});
