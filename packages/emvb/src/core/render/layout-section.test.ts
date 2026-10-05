import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateLayout, type Layout, type LayoutNode } from "../index.ts";

const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: 11,
  root: { id: "root0001", type: "container", props: {}, children },
});

const heading: LayoutNode = { id: "head0001", type: "heading", props: { text: "Hi", level: 1 } };

describe("layout Section (W-156)", () => {
  test("a full-width section holds its contents in a centred inner box, 1140 px by default", () => {
    const layout = page([
      { id: "sect0001", type: "layout-section", props: {}, children: [heading] },
    ]);
    expect(validateLayout(layout).ok).toBe(true);
    const { html, css } = renderPage(layout, emptyDesign());
    expect(html).toContain(
      '<section class="emvb-layout-section"><div class="emvb-layout-section-inner"><h1 class="emvb-heading">Hi</h1></div></section>',
    );
    expect(css).toContain(".emvb-layout-section{--emvb-content-width:1140px;");
    expect(css).toContain("max-width:var(--emvb-content-width)");
    expect(css).toContain("margin-inline:auto");
  });

  test("content width and full width set the inner box's width; a nested section resets it", () => {
    const layout = page([
      {
        id: "sect0001",
        type: "layout-section",
        props: { contentWidth: { value: 960, unit: "px" }, tag: "header" },
        children: [
          { id: "sect0002", type: "layout-section", props: { fullWidth: true }, children: [] },
        ],
      },
    ]);
    expect(validateLayout(layout).ok).toBe(true);
    const { html, css } = renderPage(layout, emptyDesign());
    expect(html).toContain('<header class="emvb-layout-section emvb-e-sect0001">');
    expect(css).toMatch(/\.emvb-e-sect0001\{[^}]*--emvb-content-width:960px/);
    expect(css).toMatch(/\.emvb-e-sect0002\{[^}]*--emvb-content-width:none/);
  });

  test("a bad tag or width is refused by the schema", () => {
    const bad = (props: Record<string, unknown>) =>
      validateLayout(
        page([{ id: "sect0001", type: "layout-section", props, children: [] } as LayoutNode]),
      ).ok;
    expect(bad({ tag: "script" })).toBe(false);
    expect(bad({ contentWidth: { value: -5, unit: "px" } })).toBe(false);
    expect(bad({ align: "center" })).toBe(false);
  });
});
