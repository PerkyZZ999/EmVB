import { describe, expect, test } from "bun:test";
import {
  collectSectionPartIds,
  emptyDesign,
  layoutHasMenuDropdown,
  validateLayout,
  renderPage,
  type Layout,
  type LayoutNode,
} from "../index.ts";

// W-1069: a menu item's dropdown panel can be a Section theme part (a mega menu).

const design = emptyDesign();

const item = (id: string, text: string, props: Record<string, unknown> = {}): LayoutNode =>
  ({ id, type: "menu-item", props: { text, ...props }, children: [] }) as LayoutNode;

const menu = (id: string, children: LayoutNode[]): LayoutNode => ({
  id,
  type: "menu",
  props: { direction: "row", label: "Primary" },
  children,
});

const page = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children },
});

const heading = (id: string, text: string): LayoutNode => ({
  id,
  type: "heading",
  props: { level: 2, text },
  children: [],
});

/** A Section part holding a heading and a column of links. */
const panelPart: Layout = page(heading("pnlh0001", "Our products"), {
  id: "pnlm0001",
  type: "menu",
  props: { direction: "column", label: "Products" },
  children: [item("pnli0001", "Boots", { href: "/boots" })],
});

describe("mega menu (W-1069)", () => {
  test("the item's panel holds the Section part's layout, in the same details disclosure", () => {
    const layout = page(
      menu("menu0001", [
        item("item0001", "Products", { panelPartId: "part-products", wide: true }),
        item("item0002", "About", { href: "/about" }),
      ]),
    );
    const out = renderPage(layout, design, {
      dynamic: { sectionTemplates: { "part-products": panelPart } },
    });
    expect(out.html).toContain("emvb-menu-item emvb-menu-item--wide emvb-menu-item--mega");
    expect(out.html).toContain(
      'class="emvb-menu-panel emvb-menu-panel--wide emvb-menu-panel--mega"',
    );
    // The text opens it (no link): a focusable summary named by the item's text.
    expect(out.html).toContain(
      '<summary class="emvb-menu-item__toggle emvb-menu-item__toggle--label">Products</summary>',
    );
    expect(out.html).toContain('name="emvb-menu-menu0001"');
    expect(out.html).toContain("Our products");
    expect(out.html).toContain('href="/boots"');
    expect(out.needsMenuRuntime).toBe(true);
    expect(out.css).toContain(".emvb-menu-panel--mega{");
    // No public script of its own: the panel is a <details>.
    expect(out.html.includes("<script")).toBe(false);
  });

  test("a linked mega item keeps its link and opens the panel from its named toggle", () => {
    const layout = page(
      menu("menu0002", [item("item0003", "Shop", { href: "/shop", panelPartId: "part-products" })]),
    );
    const html = renderPage(layout, design, {
      dynamic: { sectionTemplates: { "part-products": panelPart } },
    }).html;
    expect(html).toContain('<a class="emvb-menu-item__link" href="/shop">Shop</a>');
    expect(html).toContain('aria-label="Open Shop"');
    expect(html).toContain('class="emvb-menu-panel emvb-menu-panel--mega"');
  });

  test("the part replaces the item's own children; a missing part leaves them, or a plain link", () => {
    const withChild = {
      ...item("item0004", "Work", { panelPartId: "part-gone" }),
      children: [item("item0005", "Selected", { href: "/selected" })],
    } as LayoutNode;
    const missing = renderPage(page(menu("menu0003", [withChild])), design);
    expect(missing.html).toContain('href="/selected"');
    expect(missing.html.includes("emvb-menu-panel--mega")).toBe(false);
    expect(missing.css.includes("emvb-menu-panel--mega")).toBe(false);

    const plain = renderPage(
      page(menu("menu0004", [item("item0006", "Shop", { href: "/shop", panelPartId: "gone" })])),
      design,
    );
    expect(plain.html).toContain('<a class="emvb-menu-item__link" href="/shop">Shop</a>');
    expect(plain.html.includes("<details")).toBe(false);

    const replaced = renderPage(page(menu("menu0005", [withChild])), design, {
      dynamic: { sectionTemplates: { "part-gone": panelPart } },
    }).html;
    expect(replaced.includes('href="/selected"')).toBe(false);
    expect(replaced).toContain("Our products");
  });

  test("a part whose panel shows itself renders once, then the inner item is a plain link", () => {
    const looping: Layout = page(
      heading("loop0001", "Inside"),
      menu("loopm001", [item("loopi001", "Again", { href: "/again", panelPartId: "part-loop" })]),
    );
    const html = renderPage(
      page(menu("menu0006", [item("item0007", "Open", { panelPartId: "part-loop" })])),
      design,
      { dynamic: { sectionTemplates: { "part-loop": looping } } },
    ).html;
    expect(html.match(/Inside/g)?.length).toBe(1);
    expect(html.match(/emvb-menu-panel--mega/g)?.length).toBe(1);
    expect(html).toContain('<a class="emvb-menu-item__link" href="/again">Again</a>');
  });

  test("Mega panel width becomes the panel's width variable on the item", () => {
    const layout = page(
      menu("menu0007", [
        item("item0008", "Products", {
          panelPartId: "part-products",
          panelWidth: { value: 48, unit: "rem" },
        }),
      ]),
    );
    const css = renderPage(layout, design, {
      dynamic: { sectionTemplates: { "part-products": panelPart } },
    }).css;
    expect(css).toMatch(/\.emvb-e-item0008\{[^}]*--emvb-menu-panel-width:48rem/);
    expect(css).toContain("width:var(--emvb-menu-panel-width,max-content)");
  });

  test("on phones the panel stacks inline under its item", () => {
    const css = renderPage(
      page(menu("menu0008", [item("item0009", "Products", { panelPartId: "part-products" })])),
      design,
      { dynamic: { sectionTemplates: { "part-products": panelPart } } },
    ).css;
    expect(css).toMatch(
      /@media \(max-width: 767\.98px\)\{[^@]*\.emvb-menu \.emvb-menu-item--mega \.emvb-menu-panel--mega\{position:static/,
    );
  });

  test("hosts load the part and the menu script for a mega item", () => {
    const layout = page(menu("menu0009", [item("item0010", "Products", { panelPartId: " p1 " })]));
    expect(collectSectionPartIds(layout)).toEqual(["p1"]);
    expect(
      renderPage(layout, design, { dynamic: { sectionTemplates: { p1: panelPart } } })
        .needsMenuRuntime,
    ).toBe(true);
  });

  test("a mega item whose part is missing is a plain link and loads no menu script", () => {
    const layout = page(
      menu("menu0010", [item("item0011", "Shop", { href: "/shop", panelPartId: "gone" })]),
    );
    expect(layoutHasMenuDropdown(layout)).toBe(false);
    const out = renderPage(layout, design, { dynamic: { sectionTemplates: {} } });
    expect(out.needsMenuRuntime).toBe(false);
    expect(out.html.includes("<details")).toBe(false);
  });

  test("a part id naming an Object.prototype key renders as a missing part", () => {
    for (const id of ["constructor", "__proto__", "toString"]) {
      const layout = page(
        menu("menu0014", [item("item0016", "Shop", { href: "/shop", panelPartId: id })]),
      );
      const out = renderPage(layout, design, { dynamic: { sectionTemplates: {} } });
      expect(out.html).toContain('<a class="emvb-menu-item__link" href="/shop">Shop</a>');
      expect(out.html.includes("emvb-menu-panel--mega")).toBe(false);
    }
  });

  test("the schema takes the new keys and refuses a negative width", () => {
    const ok = page(
      menu("menu0011", [
        item("item0012", "Products", {
          panelPartId: "p1",
          panelWidth: { value: 40, unit: "rem" },
        }),
      ]),
    );
    const checked = validateLayout(ok);
    if (!checked.ok) throw new Error("the layout should validate");
    // Kept, not stripped as unknown keys.
    const menuNode = checked.layout.root.children[0] as { children: LayoutNode[] } | undefined;
    expect(menuNode?.children[0]?.props).toEqual({
      text: "Products",
      panelPartId: "p1",
      panelWidth: { value: 40, unit: "rem" },
    });
    const bad = page(
      menu("menu0012", [item("item0013", "Products", { panelWidth: { value: -1, unit: "px" } })]),
    );
    expect(validateLayout(bad).ok).toBe(false);
  });

  test("a menu without mega items renders as before: no mega rules, same markup", () => {
    const layout = page(
      menu("menu0013", [
        {
          ...item("item0014", "Work", { href: "/work" }),
          children: [item("item0015", "One", { href: "/1" })],
        } as LayoutNode,
      ]),
    );
    const out = renderPage(layout, design);
    expect(out.css.includes("menu-panel--mega")).toBe(false);
    expect(out.html.includes("--mega")).toBe(false);
    expect(out.html).toContain('<div class="emvb-menu-panel">');
  });
});
