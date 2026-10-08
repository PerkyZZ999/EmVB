import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";

const design = emptyDesign();
const page = (child: LayoutNode): Layout => ({
  schemaVersion: 12,
  root: { id: "root0001", type: "container", props: {}, children: [child] },
});
const link = (href: string) =>
  ({ id: "link0001", type: "link", props: { text: "Docs", href, newTab: true } }) as LayoutNode;

describe("W-276 a link without a URL doesn't open a new tab", () => {
  test("an empty URL renders # without target or rel", () => {
    const { html } = renderPage(page(link("")), design);
    expect(html).toContain('<a class="emvb-link" href="#">Docs</a>');
  });
  test("a refused URL too", () => {
    expect(renderPage(page(link("javascript:alert(1)")), design).html).not.toContain("_blank");
  });
  test("a real URL still opens in a new tab", () => {
    const { html } = renderPage(page(link("https://example.com")), design);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
