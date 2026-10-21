import { describe, expect, test } from "bun:test";
import { emptyDesign, type DesignSystem } from "./schema/design.ts";
import { designChanges } from "./design/diff.ts";
import { mergeDesign } from "./design/merge.ts";
import { printCss } from "./css/print.ts";
import { renderPage } from "./render/index.ts";
import { wrapNode } from "./arrange.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "./schema/layout.ts";

const page = (children: Layout["root"]["children"]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});

describe("print, scope, styles merge and page features", () => {
  test("print CSS hides header, footer, floats and popups", () => {
    const css = printCss();
    expect(css).toContain("@media print");
    expect(css).toContain(".emvb-theme-header");
    expect(css).toContain(".emvb-float");
    expect(css).toContain(".emvb-popup");
    expect(renderPage(page([]), emptyDesign()).css).toContain("@media print");
  });

  test("W-845: print shows every tab panel and every accordion panel", () => {
    const css = printCss();
    const print = css.slice(css.indexOf("@media print{"));
    expect(print).toContain(
      ".emvb-tabs:has(> .emvb-tab-input:nth-of-type(n):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(n){display:block!important}",
    );
    expect(print).toContain(
      ".emvb-accordion-item::details-content{content-visibility:visible;display:block}",
    );
  });

  test("a scoped render wraps the vnode the editor paints", () => {
    const rendered = renderPage(page([]), emptyDesign(), { scope: "page1", mode: "editor" });
    expect(rendered.vnode.attrs.class).toContain("emvb-scope");
    expect(rendered.vnode.attrs.class).toContain("emvb-s-page1");
    expect(rendered.html.startsWith('<div class="emvb-scope emvb-s-page1">')).toBe(true);
    expect(rendered.css).toContain(":where(.emvb-s-page1)");
  });

  test("a style edit replays onto another tab when that tab did not change the same item", () => {
    const base = emptyDesign();
    const ours: DesignSystem = {
      ...base,
      classes: [{ id: "card", name: "Card", style: { opacity: 0.5 } }],
    };
    const theirs: DesignSystem = {
      ...base,
      variables: { ...base.variables, colors: [{ id: "ink", name: "Ink", value: "#112233" }] },
    };
    const merged = mergeDesign(base, ours, theirs);
    expect(merged.conflicts).toEqual([]);
    expect(merged.design.classes?.[0]?.id).toBe("card");
    expect(merged.design.variables.colors[0]?.id).toBe("ink");
  });

  test("the same class changed in both tabs is a conflict and the server copy stays", () => {
    const base = emptyDesign();
    const ours: DesignSystem = {
      ...base,
      classes: [{ id: "card", name: "Card", style: { opacity: 0.2 } }],
    };
    const theirs: DesignSystem = {
      ...base,
      classes: [{ id: "card", name: "Card", style: { opacity: 0.9 } }],
    };
    const merged = mergeDesign(base, ours, theirs);
    expect(merged.conflicts.map((item) => item.name)).toEqual(["Card"]);
    expect(merged.design.classes?.[0]?.style).toEqual({ opacity: 0.9 });
  });

  test("publish diff names added and changed classes", () => {
    const published = emptyDesign();
    const draft: DesignSystem = {
      ...published,
      classes: [{ id: "card", name: "Card", style: {} }],
    };
    expect(designChanges(published, draft).map((item) => item.name)).toEqual(["Card"]);
  });

  test("wrap puts the element inside a new box in one step", () => {
    const layout = page([{ id: "head0001", type: "heading", props: { text: "Hi", level: 2 } }]);
    const wrapped = wrapNode(layout, "head0001", "flexbox", () => 0.1);
    expect(wrapped.ok).toBe(true);
    if (!wrapped.ok) return;
    const box = wrapped.layout.root.children[0];
    expect(box?.type).toBe("flexbox");
    const inner = box && "children" in box ? box.children : undefined;
    expect(inner?.[0]?.id).toBe("head0001");
    expect(wrapNode(layout, "root0001", "div-block").ok).toBe(false);
  });

  test("an image link and caption keep size styles on the image", () => {
    const layout = page([
      {
        id: "img00001",
        type: "image",
        props: {
          src: "https://example.com/a.jpg",
          alt: "A",
          href: "/pricing",
          caption: "The shop",
          focalX: 20,
          focalY: 80,
          sources: [{ src: "https://example.com/a-800.jpg", width: 800 }],
        },
        style: { width: { value: 240, unit: "px" } },
      },
    ]);
    const html = renderPage(layout, emptyDesign()).html;
    expect(html).toContain("<figure");
    expect(html).toContain('class="emvb-figcaption"');
    expect(html).toContain('href="/pricing"');
    expect(html.indexOf("emvb-e-img00001")).toBeLessThan(html.indexOf("emvb-figcaption"));
    expect(html).toContain('srcset="https://example.com/a-800.jpg 800w"');
    expect(renderPage(layout, emptyDesign()).css).toContain("object-position:20% 80%");
  });

  test("a srcset URL cannot hide a second image", () => {
    const layout = page([
      {
        id: "img00001",
        type: "image",
        props: {
          src: "https://example.com/a.jpg",
          alt: "A",
          sources: [
            { src: "https://example.com/a.png?q=1,https://evil.example/x.png", width: 800 },
            { src: "https://example.com/a.png 1w, https://evil.example/x.png", width: 400 },
          ],
          focalX: "20%;}body{background:url(https://evil.example/x)}" as unknown as number,
        },
      },
    ]);
    const html = renderPage(layout, emptyDesign()).html;
    const css = renderPage(layout, emptyDesign()).css;
    expect(html.includes("srcset=")).toBe(false);
    expect(html.includes("evil.example")).toBe(false);
    expect(css.includes("evil.example")).toBe(false);
    expect(css.includes("object-position")).toBe(false);
  });

  test("a button can show an icon before the label", () => {
    const layout = page([
      {
        id: "butn0001",
        type: "button",
        props: { text: "Go", iconId: "star", iconPosition: "before", iconSize: "sm" },
      },
    ]);
    const html = renderPage(layout, emptyDesign()).html;
    expect(html.indexOf("emvb-button-icon--sm")).toBeLessThan(html.indexOf("Go"));
    expect(html).toContain("<svg");
  });

  test("one element can set its own direction", () => {
    const layout = page([{ id: "text0001", type: "text", props: { text: "مرحبا" }, dir: "rtl" }]);
    expect(renderPage(layout, emptyDesign()).html).toContain('dir="rtl"');
  });

  test("a table of contents links to headings with no script", () => {
    const layout = page([
      { id: "head0001", type: "heading", props: { text: "Hello", level: 2 } },
      { id: "toc00001", type: "toc", props: { title: "On this page" } },
    ]);
    const html = renderPage(layout, emptyDesign()).html;
    expect(html).toContain('id="emvb-h-head0001"');
    expect(html).toContain('href="#emvb-h-head0001"');
    expect(html).toContain("On this page");
    expect(html).not.toContain("<script");
  });

  test("a container query is @container, not a viewport query", () => {
    const layout = page([
      {
        id: "box00001",
        type: "div-block",
        props: {},
        container: true,
        children: [
          {
            id: "text0001",
            type: "text",
            props: { text: "Hi" },
            query: { min: 400, style: { fontSize: { value: 20, unit: "px" } } },
          },
        ],
      },
    ]);
    const css = renderPage(layout, emptyDesign()).css;
    expect(css).toContain("container-type:inline-size");
    expect(css).toContain("@container (min-width:400px)");
    expect(css).not.toContain("@media (min-width:400px)");
  });

  test("a container width that is not a whole number is not written into CSS", () => {
    const layout = page([
      {
        id: "text0001",
        type: "text",
        props: { text: "Hi" },
        query: { min: "1px);}body{color:red" as unknown as number, style: { color: "#112233" } },
      },
    ]);
    const css = renderPage(layout, emptyDesign()).css;
    expect(css.includes("@container")).toBe(false);
    expect(css.includes("color:red")).toBe(false);
  });

  test("text direction only accepts ltr, rtl or auto", () => {
    const layout = page([
      {
        id: "text0001",
        type: "text",
        props: { text: "Hi" },
        dir: 'ltr" onload="alert(1)' as "ltr",
      },
    ]);
    const html = renderPage(layout, emptyDesign()).html;
    expect(html.includes("onload")).toBe(false);
    expect(html.includes('dir="')).toBe(false);
  });
});

describe("Style comparisons ignore key order (W-519)", () => {
  const saved: DesignSystem = {
    ...emptyDesign(),
    classes: [{ id: "card", name: "Card", style: { opacity: 0.5, color: "#112233" } }],
  };
  const reordered: DesignSystem = {
    ...emptyDesign(),
    classes: [{ style: { color: "#112233", opacity: 0.5 }, name: "Card", id: "card" }],
  };

  test("Publish styles lists no change for the same class in another key order", () => {
    expect(designChanges(saved, reordered)).toEqual([]);
  });

  test("a merge doesn't report a clash for a class this tab only reordered", () => {
    const theirs: DesignSystem = {
      ...saved,
      classes: [{ id: "card", name: "Card", style: { opacity: 0.9, color: "#112233" } }],
    };
    expect(mergeDesign(saved, reordered, theirs).conflicts).toEqual([]);
  });
});

describe("A query container keeps its width (W-523)", () => {
  const box = (extra: Record<string, unknown>) =>
    renderPage(
      page([
        {
          id: "cq000001",
          type: "container",
          props: {},
          container: true,
          children: [],
          ...extra,
        } as never,
      ]),
      emptyDesign(),
    ).css;

  test("a query container without a width is full width, so it can't collapse in a row", () => {
    expect(box({})).toMatch(/\.emvb-e-cq000001\{[^}]*container-type:inline-size;width:100%/);
  });

  test("a width set on the box (or by a class) wins", () => {
    expect(box({ style: { width: { value: 300, unit: "px" } } })).toContain("width:300px");
    expect(box({ style: { width: { value: 300, unit: "px" } } })).not.toContain("width:100%");
    expect(box({ classes: ["card"] })).not.toContain("width:100%");
  });
});
