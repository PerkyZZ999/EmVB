import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";

const design = emptyDesign();
const page = (child: LayoutNode): Layout => ({
  schemaVersion: 14,
  root: { id: "root0001", type: "container", props: {}, children: [child] },
});

describe("W-275 empty Tabs and blank list items", () => {
  test("Tabs without panels has no tablist role (a tablist must hold tabs)", () => {
    const tabs = { id: "tabs0001", type: "tabs", props: {}, children: [] } as LayoutNode;
    const { html } = renderPage(page(tabs), design);
    expect(html).toContain('<div class="emvb-tab-list"></div>');
    expect(html).not.toContain('role="tablist"');
  });

  test("Tabs with a panel keep the tablist", () => {
    const tabs = {
      id: "tabs0002",
      type: "tabs",
      props: {},
      children: [{ id: "tabp0001", type: "tab-panel", props: { label: "One" }, children: [] }],
    } as LayoutNode;
    expect(renderPage(page(tabs), design).html).toContain('role="tablist"');
  });

  test("blank and whitespace-only list items render no bullets", () => {
    const list = {
      id: "list0001",
      type: "list",
      props: { items: ["", "  ", "Real", "Also"] },
    } as LayoutNode;
    expect(renderPage(page(list), design).html).toContain(
      '<ul class="emvb-list"><li>Real</li><li>Also</li></ul>',
    );
    const blank = { id: "list0002", type: "list", props: { items: [""] } } as LayoutNode;
    expect(renderPage(page(blank), design).html).toContain('<ul class="emvb-list"></ul>');
  });
});
