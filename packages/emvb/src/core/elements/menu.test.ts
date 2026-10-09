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
  schemaVersion: 13,
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
    expect(html).toContain('class="emvb-menu-item__label"');
    expect(html.includes("javascript:")).toBe(false);
    expect(html).toContain('aria-label="Menu"');
    expect(css).toContain(".emvb-menu-panel{");
    expect(css).toContain("flex-direction:inherit");
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
