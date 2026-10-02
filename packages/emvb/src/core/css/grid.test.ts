import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { styleDeclarations } from "../sanitize/css.ts";
import { renderPage } from "../render/index.ts";

const heading = (id: string, span?: number): LayoutNode => ({
  id,
  type: "heading",
  props: { text: "Cell", level: 2 },
  ...(span ? { style: { gridColumnSpan: span } } : {}),
});

const page = (columns: number, children: LayoutNode[]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "grid0001",
        type: "grid",
        props: { columns },
        children,
      },
    ],
  },
});

describe("CSS grid", () => {
  test("a grid emits equal columns and a child can span", () => {
    const { css } = renderPage(page(3, [heading("head0001", 2)]), emptyDesign());
    expect(css).toContain("display:grid");
    expect(css).toContain("grid-template-columns:repeat(3, minmax(0, 1fr))");
    expect(css).toContain("grid-column:span 2");
  });

  test("a span outside 1–12 is dropped", () => {
    const result = styleDeclarations({ gridColumnSpan: 13 });
    expect(result.declarations).toEqual([]);
    expect(result.rejected).toContain("gridColumnSpan");
  });
});
