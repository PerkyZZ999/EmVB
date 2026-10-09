import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

const page = (menus: unknown[]) =>
  ({
    schemaVersion: 13,
    root: { id: "root0001", type: "container", props: {}, children: menus },
  }) as unknown as Layout;
const item = {
  id: "item0001",
  type: "menu-item",
  props: { text: "Home", href: "/" },
  children: [],
};

describe("empty Menu (W-198)", () => {
  test("a Menu with no items is a plain box, not a navigation landmark", () => {
    const { html } = renderPage(
      page([{ id: "menu0001", type: "menu", props: { direction: "row" }, children: [] }]),
      emptyDesign(),
    );
    expect(html).not.toContain("<nav");
    expect(html).toContain("data-emvb-menu-empty");
  });
  test("a Menu with items keeps its nav and its own name", () => {
    const { html } = renderPage(
      page([{ id: "menu0002", type: "menu", props: { label: "Footer" }, children: [item] }]),
      emptyDesign(),
    );
    expect(html).toContain('<nav class="emvb-menu" aria-label="Footer">');
  });
});
