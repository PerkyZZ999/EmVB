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
