import { describe, expect, test } from "bun:test";
import { layoutFromPageTemplate } from "../arrange.ts";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { collectSectionPartIds } from "../theme/dynamic.ts";
import { renderPage } from "./index.ts";

const heading = (id: string, text: string): LayoutNode => ({
  id,
  type: "heading",
  props: { text, level: 2 },
});

const layout = (children: LayoutNode[]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children,
  },
});

const sectionPart = (text: string): Layout => layout([heading("parthead", text)]);

describe("synced sections", () => {
  test("a synced section renders the part, not the local heading", () => {
    const page = layout([
      {
        id: "sec00001",
        type: "section",
        props: { partId: "part-1" },
        children: [heading("local01", "Local only")],
      },
    ]);
    const { html } = renderPage(page, emptyDesign(), {
      dynamic: { sectionTemplates: { "part-1": sectionPart("From the section") } },
    });
    expect(html).toContain("From the section");
    expect(html.includes("Local only")).toBe(false);
  });

  test("a missing part does not fall back to local children", () => {
    const page = layout([
      {
        id: "sec00001",
        type: "section",
        props: { partId: "missing" },
        children: [heading("local01", "Local only")],
      },
    ]);
    const { html } = renderPage(page, emptyDesign(), {
      dynamic: { sectionTemplates: {} },
    });
    expect(html.includes("Local only")).toBe(false);
    expect(html).toContain("emvb-section");
  });

  test("collectSectionPartIds reads nested section part ids", () => {
    const page = layout([
      {
        id: "sec00001",
        type: "section",
        props: { partId: "part-1" },
        children: [
          {
            id: "sec00002",
            type: "section",
            props: { partId: "part-2" },
            children: [],
          },
        ],
      },
    ]);
    expect(collectSectionPartIds(page)).toEqual(["part-1", "part-2"]);
  });

  test("a page template copy gets fresh ids and the current schema version", () => {
    const source = sectionPart("Template heading");
    let n = 0;
    const copy = layoutFromPageTemplate(source, () => {
      n += 1;
      return n / 100;
    });
    expect(copy.schemaVersion).toBe(LAYOUT_SCHEMA_VERSION);
    expect(copy.root.id).not.toBe(source.root.id);
    expect(copy.root.children[0]?.id).not.toBe("parthead");
    expect(copy.root.children[0]?.type).toBe("heading");
  });
});

describe("an id reused by another layout keeps its own styles (W-250)", () => {
  const styled = (id: string, text: string, color: string): LayoutNode => ({
    id,
    type: "heading",
    props: { text, level: 2 },
    style: { color },
  });
  const sectionNode = (id: string, partId: string): LayoutNode => ({
    id,
    type: "section",
    props: { partId },
    children: [],
  });
  const colorOf = (html: string, css: string, text: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    const el = [...host.querySelectorAll("h2")].find((h) => h.textContent === text);
    const cls = [...(el?.classList ?? [])].find((c) => c.startsWith("emvb-e-"));
    return new RegExp(`\\.${cls}\\{color:([^;}]+)`).exec(css)?.[1];
  };

  test("a page heading and a synced section heading with one id each keep their colour", () => {
    const { html, css } = renderPage(
      layout([styled("sameid01", "Page", "#2563eb"), sectionNode("sec00001", "p1")]),
      emptyDesign(),
      { dynamic: { sectionTemplates: { p1: layout([styled("sameid01", "Part", "#dc2626")]) } } },
    );
    expect(colorOf(html, css, "Page")).toBe("#2563eb");
    expect(colorOf(html, css, "Part")).toBe("#dc2626");
    // The page's own element keeps its plain class.
    expect(html).toContain('class="emvb-heading emvb-e-sameid01"');
  });

  test("the section first, then the page: still each its own colour", () => {
    const { html, css } = renderPage(
      layout([sectionNode("sec00001", "p1"), styled("sameid01", "Page", "#2563eb")]),
      emptyDesign(),
      { dynamic: { sectionTemplates: { p1: layout([styled("sameid01", "Part", "#dc2626")]) } } },
    );
    expect(colorOf(html, css, "Page")).toBe("#2563eb");
    expect(colorOf(html, css, "Part")).toBe("#dc2626");
  });

  test("the same section placed twice shares one class and rule", () => {
    const { html } = renderPage(
      layout([sectionNode("sec00001", "p1"), sectionNode("sec00002", "p1")]),
      emptyDesign(),
      { dynamic: { sectionTemplates: { p1: layout([styled("parthead", "Part", "#dc2626")]) } } },
    );
    expect(html.match(/emvb-e-parthead"/g)?.length).toBe(2);
  });

  test("a loop item part reusing a page id keeps its own colour", () => {
    const loop: LayoutNode = {
      id: "loop0001",
      type: "loop",
      props: { itemPartId: "item" },
      children: [],
    };
    const { html, css } = renderPage(
      layout([styled("sameid01", "Page", "#2563eb"), loop]),
      emptyDesign(),
      {
        dynamic: {
          posts: [{ id: "a", title: "A", slug: "a", url: "/posts/a" } as never],
          loopTemplates: { item: layout([styled("sameid01", "Item", "#16a34a")]) },
        },
      },
    );
    expect(colorOf(html, css, "Page")).toBe("#2563eb");
    expect(colorOf(html, css, "Item")).toBe("#16a34a");
  });
});

describe("runtimes follow synced section and loop item contents (W-253)", () => {
  const sectionNode: LayoutNode = {
    id: "sec00001",
    type: "section",
    props: { partId: "p1" },
    children: [],
  };
  const withPart = (part: LayoutNode[]) =>
    renderPage(layout([sectionNode]), emptyDesign(), {
      dynamic: { sectionTemplates: { p1: layout(part) } },
    });

  test("a bound form inside a synced section loads the forms runtime", () => {
    const form = {
      id: "form0001",
      type: "form",
      props: { formId: "f1" },
      children: [{ id: "fld00001", type: "text-input", props: { field: "email", label: "Email" } }],
    } as LayoutNode;
    expect(withPart([form]).needsFormsRuntime).toBe(true);
    expect(withPart([heading("h0000001", "No form")]).needsFormsRuntime).toBe(false);
  });

  test("Tabs and a menu dropdown inside a synced section load their runtimes", () => {
    const tabs = {
      id: "tabs0001",
      type: "tabs",
      props: {},
      children: [{ id: "tabp0001", type: "tab-panel", props: { label: "One" }, children: [] }],
    } as LayoutNode;
    expect(withPart([tabs]).needsTabsRuntime).toBe(true);
    const menu = {
      id: "menu0001",
      type: "menu",
      props: {},
      children: [
        {
          id: "mitm0001",
          type: "menu-item",
          props: { text: "Shop", href: "/shop" },
          children: [
            {
              id: "mitm0002",
              type: "menu-item",
              props: { text: "Hats", href: "/hats" },
              children: [],
            },
          ],
        },
      ],
    } as LayoutNode;
    expect(withPart([menu]).needsMenuRuntime).toBe(true);
  });

  test("a menu item without sub-items in a synced section doesn't load the menu runtime", () => {
    const item = {
      id: "mitm0003",
      type: "menu-item",
      props: { text: "Plain", href: "/" },
      children: [],
    } as unknown as LayoutNode;
    expect(withPart([item]).needsMenuRuntime).toBe(false);
  });

  test("Tabs in a loop item part load the tabs runtime", () => {
    const tabs = {
      id: "tabs0001",
      type: "tabs",
      props: {},
      children: [{ id: "tabp0001", type: "tab-panel", props: { label: "One" }, children: [] }],
    } as LayoutNode;
    const loop: LayoutNode = {
      id: "loop0001",
      type: "loop",
      props: { itemPartId: "item" },
      children: [],
    };
    const result = renderPage(layout([loop]), emptyDesign(), {
      dynamic: {
        posts: [{ id: "a", title: "A", slug: "a", url: "/posts/a" } as never],
        loopTemplates: { item: layout([tabs]) },
      },
    });
    expect(result.needsTabsRuntime).toBe(true);
  });
});
