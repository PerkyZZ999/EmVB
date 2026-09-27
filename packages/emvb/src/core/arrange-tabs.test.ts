import { describe, expect, test } from "bun:test";
import { canDrop, REASONS } from "./arrange.ts";
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
});
