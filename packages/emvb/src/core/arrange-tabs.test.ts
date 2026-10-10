import { describe, expect, test } from "bun:test";
import { canDrop, duplicateNode, moveNode, REASONS } from "./arrange.ts";
import { MAX_TABS } from "./limits.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { defaultElement, starterLayout } from "./index.ts";

describe("tabs arrange rules (W-074)", () => {
  test("tab-panel only drops into tabs; tabs only accept tab-panel", () => {
    const layout = starterLayout("Tabs");
    const tabs = defaultElement("tabs", "tabs0001");
    const withTabs = {
      ...layout,
      root: { ...layout.root, children: [tabs] },
    };
    const panel = defaultElement("tab-panel", "tabp0001");
    const heading = defaultElement("heading", "head0001");

    expect(canDrop(withTabs, { kind: "new", node: panel }, "tabs0001").ok).toBe(true);
    expect(canDrop(withTabs, { kind: "new", node: heading }, "tabs0001")).toEqual({
      ok: false,
      reason: REASONS.onlyTabPanels,
    });
    expect(canDrop(withTabs, { kind: "new", node: panel }, layout.root.id)).toEqual({
      ok: false,
      reason: REASONS.tabOutsideTabs,
    });
  });

  test("a full Tabs refuses a 13th panel by drop, move or duplicate, but its own panels still reorder (W-188)", () => {
    const panels = (prefix: string, n: number): LayoutNode[] =>
      Array.from({ length: n }, (_, i) =>
        defaultElement("tab-panel", `${prefix}${String(i).padStart(4, "0")}`),
      );
    const layout: Layout = {
      schemaVersion: 14,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { ...defaultElement("tabs", "full0001"), children: panels("fp", MAX_TABS) },
          { ...defaultElement("tabs", "half0001"), children: panels("hp", 2) },
        ],
      } as LayoutNode,
    } as Layout;
    const refused = { ok: false as const, reason: REASONS.tooManyTabs };
    const extra = defaultElement("tab-panel", "new00001");
    expect(canDrop(layout, { kind: "new", node: extra }, "full0001")).toEqual(refused);
    expect(moveNode(layout, "hp0000", "full0001", 0)).toEqual(refused as never);
    expect(duplicateNode(layout, "fp0003")).toEqual(refused as never);
    expect(moveNode(layout, "fp0000", "full0001", MAX_TABS).ok).toBe(true);
    expect(duplicateNode(layout, "hp0001").ok).toBe(true);
    expect(canDrop(layout, { kind: "new", node: extra }, "half0001").ok).toBe(true);
  });
});
