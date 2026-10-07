import { describe, expect, test } from "bun:test";
import type { Layout, LayoutNode } from "./index.ts";
import { firstChild, moveIn } from "./arrange.ts";

const heading: LayoutNode = { id: "head0001", type: "heading", props: { text: "H", level: 2 } };
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 12,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const block = (type: string, id: string, children: LayoutNode[] = [], props = {}): LayoutNode =>
  ({ id, type, props, children }) as unknown as LayoutNode;

describe("Alt+→ and Enter reach every element that holds children (W-211)", () => {
  test("Alt+→ moves into a Flexbox or a Form above, not only a Container", () => {
    for (const above of [
      block("flexbox", "flex0001"),
      block("form", "form0001", [], { formId: "f" }),
    ]) {
      const result = moveIn(page(above, heading), "head0001");
      expect(result.ok).toBe(true);
      if (result.ok) {
        const moved = result.layout.root.children[0] as { children: LayoutNode[] };
        expect(moved.children.map((c) => c.id)).toEqual(["head0001"]);
      }
    }
  });

  test("where it can't go, Alt+→ says why", () => {
    const tabs = block("tabs", "tabs0001", [block("tab-panel", "tabp0001", [], { label: "A" })]);
    const result = moveIn(page(tabs, heading), "head0001");
    expect(result.ok ? "" : result.reason).toBe("Tabs can only hold tab panels.");
    const menuItem = block("menu-item", "mitm0001", [], { label: "x", href: "/" });
    const intoMenu = moveIn(page(block("menu", "menu0001"), menuItem), "mitm0001");
    expect(intoMenu.ok).toBe(true);
    expect(moveIn(page(heading, block("text", "txt00001", [])), "txt00001").ok).toBe(false);
  });

  test("Enter goes to the first child of a Flexbox", () => {
    expect(firstChild(page(block("flexbox", "flex0001", [heading])), "flex0001")).toBe("head0001");
    expect(firstChild(page(heading), "head0001")).toBeUndefined();
  });
});
