import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { styleDeclarations } from "../sanitize/css.ts";
import { renderPage } from "../render/index.ts";
import { validateLayout } from "../validate.ts";

const heading = (id: string, span?: number): LayoutNode => ({
  id,
  type: "heading",
  props: { text: "Cell", level: 2 },
  ...(span ? { style: { gridColumnSpan: span } } : {}),
});

const page = (
  columns: number,
  children: LayoutNode[],
  devices: { columnsTablet?: number; columnsMobile?: number } = {},
): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "grid0001",
        type: "grid",
        props: { columns, ...devices },
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

  test("tablet and mobile columns go in their media queries; unset follows the wider device (W-139)", () => {
    const both = renderPage(page(3, [], { columnsTablet: 2, columnsMobile: 1 }), emptyDesign()).css;
    expect(both).toMatch(
      /@media[^{]*max-width: ?1024px[^{]*\{\.emvb-e-grid0001\{grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)\}/,
    );
    expect(both).toMatch(
      /@media[^{]*max-width: ?767px[^{]*\{\.emvb-e-grid0001\{grid-template-columns:repeat\(1, minmax\(0, 1fr\)\)\}/,
    );
    const tabletOnly = renderPage(page(4, [], { columnsTablet: 2 }), emptyDesign()).css;
    expect(tabletOnly).toContain("repeat(2, minmax(0, 1fr))");
    expect(tabletOnly).not.toMatch(/max-width: ?767px[^{]*\{\.emvb-e-grid0001/);
    const none = renderPage(page(4, []), emptyDesign()).css;
    expect(none).not.toMatch(/@media[^{]*\{\.emvb-e-grid0001/);
  });

  test("a device column count outside 1–12 is refused by the schema and dropped by the renderer (W-139)", () => {
    expect(validateLayout(page(3, [], { columnsTablet: 13 })).ok).toBe(false);
    expect(validateLayout(page(3, [], { columnsMobile: 0 })).ok).toBe(false);
    expect(validateLayout(page(3, [], { columnsTablet: 2, columnsMobile: 1 })).ok).toBe(true);
    const css = renderPage(page(3, [], { columnsTablet: 2.5 }), emptyDesign()).css;
    expect(css).not.toContain("repeat(2.5");
  });
});
