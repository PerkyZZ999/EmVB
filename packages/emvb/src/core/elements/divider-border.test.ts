import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";

const design = emptyDesign();
const page = (child: LayoutNode): Layout => ({
  schemaVersion: 14,
  root: { id: "root0001", type: "container", props: {}, children: [child] },
});

describe("W-270 a divider's border style draws a line, not a box", () => {
  test("the other sides' border style is none, from a rule that outranks the element's class", () => {
    const divider = {
      id: "div00001",
      type: "divider",
      props: {},
      style: {
        borderWidth: { value: 4, unit: "px" },
        borderStyle: "dashed",
        borderColor: "#ff0000",
      },
    } as LayoutNode;
    const { css, html } = renderPage(page(divider), design);
    expect(html).toMatch(/<hr class="emvb-divider[^"]*"/);
    expect(css).toContain(
      "hr.emvb-divider{border-right-style:none;border-bottom-style:none;border-left-style:none}",
    );
    // The element's own rule is a single class (0,1,0), below hr.emvb-divider (0,1,1).
    expect(css).toMatch(/\.emvb-e-div00001\{[^}]*border-style:dashed/);
  });
});
