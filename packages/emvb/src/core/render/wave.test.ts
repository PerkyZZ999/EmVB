import { describe, expect, test } from "bun:test";
import { container } from "../../../test/fixtures/layouts.ts";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { designFromJson, designToJson } from "../design/transfer.ts";
import { canDrop } from "../arrange.ts";
import { renderPage } from "./index.ts";

const design: DesignSystem = emptyDesign();
const page = (children: LayoutNode[], root: Partial<LayoutNode> = {}): Layout => ({
  schemaVersion: 9,
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
    const result = designFromJson(JSON.stringify({ ...emptyDesign(), schemaVersion: 10 }));
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
