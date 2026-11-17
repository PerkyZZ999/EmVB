import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";
import { canDrop, REASONS } from "../arrange.ts";
import { heading } from "../../../test/fixtures/layouts.ts";

const design = emptyDesign();

const item = (
  id: string,
  text: string,
  extra: { href?: string; wide?: boolean; children?: LayoutNode[] } = {},
): LayoutNode => ({
  id,
  type: "menu-item",
  props: {
    text,
    ...(extra.href !== undefined ? { href: extra.href } : {}),
    ...(extra.wide ? { wide: true } : {}),
  },
  children: extra.children ?? [],
});

const page = (child: LayoutNode): Layout => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children: [child] },
});

describe("menu", () => {
  test("a menu item with children opens a panel, and a plain item is only a link", () => {
    const menu: LayoutNode = {
      id: "menu0001",
      type: "menu",
      props: { direction: "row", label: "Primary" },
      children: [
        item("item0001", "Home", { href: "/" }),
        item("item0002", "Work", {
          href: "/work",
          children: [
            item("item0003", "Selected", {
              href: "/work/selected",
              children: [item("item0006", "2024", { href: "/work/selected/2024" })],
            }),
          ],
        }),
      ],
    };
    const html = renderPage(page(menu), design).html;
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('class="emvb-menu-item__link" href="/"');
    expect(html).toContain('class="emvb-menu-panel"');
    expect(html).toContain('aria-label="Open Work"');
    expect(html).toContain('name="emvb-menu-menu0001"');
    expect(html).toContain('name="emvb-menu-item0002"');
    expect(html.includes("emvb-menu-item__disclosure")).toBe(true);
    expect(html.match(/emvb-menu-item__disclosure/g)?.length).toBe(2);
  });

  test("a refused link stays text, and a wide vertical menu marks its panel", () => {
    const menu: LayoutNode = {
      id: "menu0002",
      type: "menu",
      props: { direction: "column" },
      children: [
        item("item0004", "More", {
          href: "javascript:alert(1)",
          wide: true,
          children: [item("item0005", "Inside", { href: "/in" })],
        }),
      ],
    };
    const { html, css } = renderPage(page(menu), design);
    expect(html).toContain("emvb-menu--column");
    expect(html).toContain("emvb-menu-item--wide");
    expect(html).toContain("emvb-menu-panel--wide");
    // W-614: with no usable link, the item's own text is the dropdown toggle.
    expect(html).toContain(
      '<summary class="emvb-menu-item__toggle emvb-menu-item__toggle--label">More</summary>',
    );
    expect(html.includes("javascript:")).toBe(false);
    expect(html).toContain('aria-label="Menu"');
    expect(css).toContain(".emvb-menu-panel{");
    expect(css).toContain("flex-direction:inherit");
  });

  test("a label-only item with a dropdown opens it from its text; a plain label stays a span (W-614)", () => {
    const menu: LayoutNode = {
      id: "menu0001",
      type: "menu",
      props: { direction: "row" },
      children: [
        item("item0001", "Shop", { children: [item("item0002", "Hats", { href: "/hats" })] }),
        item("item0003", "Note"),
      ],
    };
    const { html, css } = renderPage(page(menu), design);
    expect(html).toContain(
      '<summary class="emvb-menu-item__toggle emvb-menu-item__toggle--label">Shop</summary>',
    );
    expect(html).not.toContain('aria-label="Open Shop"');
    expect(html).not.toContain('<span class="emvb-menu-item__label">Shop</span>');
    expect(html).toContain('<span class="emvb-menu-item__label">Note</span>');
    expect(css).toContain(".emvb-menu-item__toggle--label{");
  });

  test("a menu item only drops inside a menu", () => {
    const menu: LayoutNode = {
      id: "menu0001",
      type: "menu",
      props: { direction: "row" },
      children: [],
    };
    const layout = page(menu);
    const fresh = item("item0001", "Home", { href: "/" });
    expect(canDrop(layout, { kind: "new", node: fresh }, "root0001")).toEqual({
      ok: false,
      reason: REASONS.itemOutsideMenu,
    });
    expect(canDrop(layout, { kind: "new", node: heading("head0009") }, "menu0001")).toEqual({
      ok: false,
      reason: REASONS.onlyMenuItems,
    });
    expect(canDrop(layout, { kind: "new", node: fresh }, "menu0001")).toEqual({ ok: true });
    const withItem = page({ ...menu, children: [fresh] });
    expect(canDrop(withItem, { kind: "new", node: heading("head0009") }, "item0001")).toEqual({
      ok: true,
    });
  });
});

test("W-601 a non-item straight in a Menu (import, MCP) sits beside the list, not inside the ul", () => {
  const menu: LayoutNode = {
    id: "menu0001",
    type: "menu",
    props: { direction: "row" },
    children: [
      item("item0001", "Home", { href: "/" }),
      heading("head0001", "Hi", 2),
      item("item0002", "Blog", { href: "/blog" }),
    ],
  };
  const html = renderPage(page(menu), design).html;
  expect(html).not.toMatch(/<ul[^>]*>(?:(?!<\/ul>).)*<h2/s);
  expect(html).toContain('<h2 class="emvb-heading">Hi</h2>');
  expect(html.match(/<ul class="emvb-menu__list">/g)?.length).toBe(2);
});

test("the same menu in a header and a footer opens its dropdowns separately (W-1078)", () => {
  const menu: LayoutNode = {
    id: "menu0009",
    type: "menu",
    props: { label: "Primary" },
    children: [item("item0091", "Work", { children: [item("item0092", "One", { href: "/1" })] })],
  };
  const names = (html: string) => [...html.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
  // A page keeps the plain name; each theme part's copy gets its own.
  expect(names(renderPage(page(menu), design).html)).toEqual(["emvb-menu-menu0009"]);
  const header = names(renderPage(page(menu), design, { scope: "head", partIds: true }).html);
  const footer = names(renderPage(page(menu), design, { scope: "foot", partIds: true }).html);
  expect(header[0]?.startsWith("emvb-menu-menu0009-t")).toBe(true);
  expect(footer[0]?.startsWith("emvb-menu-menu0009-t")).toBe(true);
  expect(header[0] === footer[0]).toBe(false);
});
