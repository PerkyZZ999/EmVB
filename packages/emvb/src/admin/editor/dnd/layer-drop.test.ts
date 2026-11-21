import { describe, expect, test } from "bun:test";
import { REASONS, type Layout, type LayoutNode } from "../../../core/index.ts";
import {
  autoScrollStep,
  depthAtX,
  layerPlace,
  layerZone,
  resolveLayerDrop,
  type LayerRowView,
} from "./layer-drop.ts";

const heading = (id: string): LayoutNode => ({
  id,
  type: "heading",
  props: { text: id, level: 2 },
});

// root
//   head0001
//   box00001
//     head0002
//     box00002
//       head0003
//   head0004
const layout: Layout = {
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      heading("head0001"),
      {
        id: "box00001",
        type: "container",
        props: {},
        children: [
          heading("head0002"),
          { id: "box00002", type: "container", props: {}, children: [heading("head0003")] },
        ],
      },
      heading("head0004"),
    ],
  },
};

const row = (id: string, depth: number, open = false): LayerRowView => ({ id, depth, open });
const indent = (depth: number) => 8 + 12 * depth;

describe("Layers drop zones (W-1080)", () => {
  test("a container row splits in quarters, a leaf row in halves, the page row is inside", () => {
    expect(layerZone(5, 28, true, false)).toBe("before");
    expect(layerZone(14, 28, true, false)).toBe("inside");
    expect(layerZone(24, 28, true, false)).toBe("after");
    expect(layerZone(13, 28, false, false)).toBe("before");
    expect(layerZone(15, 28, false, false)).toBe("after");
    expect(layerZone(1, 28, true, true)).toBe("inside");
  });

  test("the pointer's x picks how deep the drop may climb out", () => {
    expect(depthAtX(0, indent, 3)).toBe(0);
    expect(depthAtX(21, indent, 3)).toBe(1);
    expect(depthAtX(33, indent, 3)).toBe(2);
    expect(depthAtX(500, indent, 3)).toBe(3);
    // Exactly on an indent counts as past it.
    expect(depthAtX(indent(2), indent, 3)).toBe(2);
  });
});

describe("Layers drop places (W-1080)", () => {
  test("before and after a row go into its parent around it", () => {
    expect(layerPlace(layout, row("head0002", 2), "before")).toEqual({
      parentId: "box00001",
      index: 0,
      depth: 2,
      edge: "top",
    });
    expect(layerPlace(layout, row("head0001", 1), "after")).toEqual({
      parentId: "root0001",
      index: 1,
      depth: 1,
      edge: "bottom",
    });
  });

  test("inside a container appends; the page row takes drops inside", () => {
    expect(layerPlace(layout, row("box00002", 2), "inside")).toEqual({
      parentId: "box00002",
      index: 1,
      depth: 3,
      edge: null,
    });
    expect(layerPlace(layout, row("root0001", 0), "before")?.parentId).toBe("root0001");
  });

  test("after an open container goes first inside it", () => {
    expect(layerPlace(layout, row("box00001", 1, true), "after")).toEqual({
      parentId: "box00001",
      index: 0,
      depth: 2,
      edge: "bottom",
    });
    // Collapsed, it goes after the container.
    expect(layerPlace(layout, row("box00001", 1, false), "after")?.parentId).toBe("root0001");
  });

  test("after a last child, moving left climbs out one level at a time", () => {
    expect(layerPlace(layout, row("head0003", 3), "after", 0)?.parentId).toBe("box00002");
    expect(layerPlace(layout, row("head0003", 3), "after", 1)).toEqual({
      parentId: "box00001",
      index: 2,
      depth: 2,
      edge: "bottom",
    });
    expect(layerPlace(layout, row("head0003", 3), "after", 2)).toEqual({
      parentId: "root0001",
      index: 2,
      depth: 1,
      edge: "bottom",
    });
    // Never out of the page, and never from a row that isn't last.
    expect(layerPlace(layout, row("head0003", 3), "after", 9)?.parentId).toBe("root0001");
    expect(layerPlace(layout, row("head0002", 2), "after", 2)?.parentId).toBe("box00001");
  });
});

describe("Layers drop validity (W-1080)", () => {
  test("a container can't go into itself or its descendants", () => {
    const source = { kind: "existing", id: "box00001" } as const;
    const self = resolveLayerDrop(layout, row("box00001", 1), "inside", source);
    expect(self?.ok).toBe(false);
    expect(self && !self.ok ? self.reason : "").toBe(REASONS.intoItself);
    const child = resolveLayerDrop(layout, row("head0003", 3), "before", source);
    expect(child && !child.ok ? child.reason : "allowed").toBe(REASONS.intoItself);
    const beside = resolveLayerDrop(layout, row("head0004", 1), "after", source);
    expect(beside?.ok).toBe(true);
  });

  test("a parent that refuses the child refuses the drop, with the canvas's reason", () => {
    const item: LayoutNode = { id: "item0001", type: "accordion-item", props: { summary: "Q" } };
    const refused = resolveLayerDrop(layout, row("box00002", 2), "inside", {
      kind: "new",
      node: item,
    });
    expect(refused && !refused.ok ? refused.reason : "allowed").toBe(REASONS.itemOutsideAccordion);
    const allowed = resolveLayerDrop(layout, row("box00002", 2), "inside", {
      kind: "new",
      node: heading("head0009"),
    });
    expect(allowed?.ok).toBe(true);
  });

  test("an unknown source is allowed until the drop checks again", () => {
    expect(resolveLayerDrop(layout, row("head0001", 1), "before", null)?.ok).toBe(true);
    expect(resolveLayerDrop(layout, row("gone0001", 1), "before", null)).toBeNull();
  });
});

describe("Layers auto-scroll (W-1080)", () => {
  test("scrolls up near the top, down near the bottom, faster closer to the edge", () => {
    expect(autoScrollStep(300, 0, 600)).toBe(0);
    expect(autoScrollStep(30, 0, 600)).toBeLessThan(0);
    expect(autoScrollStep(0, 0, 600)).toBe(-14);
    expect(autoScrollStep(-50, 0, 600)).toBe(-14);
    expect(autoScrollStep(590, 0, 600)).toBeGreaterThan(autoScrollStep(575, 0, 600));
    expect(autoScrollStep(20, 0, 60)).toBe(0);
  });
});
