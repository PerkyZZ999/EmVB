import { describe, expect, test } from "bun:test";
import { container, heading } from "../../../../test/fixtures/layouts.ts";
import type { Layout } from "../../../core/index.ts";
import { dropLineBox } from "../canvas/drop-line.ts";
import { dropIndex, edgeDrop, flowDirection, type Rect } from "./drop-target.ts";

const box = (left: number, top: number, width = 100, height = 40): Rect => ({
  left,
  top,
  width,
  height,
});

describe("drops follow the layout the canvas shows (W-559)", () => {
  test("the flow comes from the computed style: classes, devices, grid, block and RTL", () => {
    const cs = (display: string, flexDirection = "row", direction = "ltr") => ({
      display,
      flexDirection,
      direction,
    });
    expect(flowDirection(cs("flex", "row"))).toBe("row");
    expect(flowDirection(cs("inline-flex", "column"))).toBe("column");
    expect(flowDirection(cs("flex", "row", "rtl"))).toBe("row-reverse");
    expect(flowDirection(cs("flex", "row-reverse", "rtl"))).toBe("row");
    expect(flowDirection(cs("flex", "column", "rtl"))).toBe("column");
    expect(flowDirection(cs("grid"))).toBe("row");
    expect(flowDirection(cs("grid", "row", "rtl"))).toBe("row-reverse");
    // A block's computed flex-direction is "row", but its children stack.
    expect(flowDirection(cs("block", "row"))).toBe("column");
  });

  test("in an RTL row the first child is on the right, so its left half drops after it", () => {
    // DOM order 0, 1, 2 laid out right to left: 220–320, 110–210, 0–100.
    const rtl = [box(220, 0), box(110, 0), box(0, 0)];
    expect(dropIndex("row-reverse", rtl, { x: 300, y: 20 })).toBe(0);
    expect(dropIndex("row-reverse", rtl, { x: 230, y: 20 })).toBe(1);
    expect(dropIndex("row-reverse", rtl, { x: 5, y: 20 })).toBe(3);
  });

  test("the drop line sits on the visual side of a reversed row", () => {
    const frame = { top: 0, left: 0, width: 320, height: 40 };
    const rtl = [box(220, 0), box(110, 0), box(0, 0)];
    // Before the first child: its right edge. After the last: the last one's left edge.
    expect(dropLineBox("row-reverse", frame, rtl, 0).left).toBe(319);
    expect(dropLineBox("row-reverse", frame, rtl, 3).left).toBe(-1);
    // Between 0 and 1: the gap 210–220.
    expect(dropLineBox("row-reverse", frame, rtl, 1).left).toBe(214);
    // An LTR row is unchanged.
    const ltr = [box(0, 0), box(110, 0), box(220, 0)];
    expect(dropLineBox("row", frame, ltr, 0).left).toBe(-1);
    expect(dropLineBox("row", frame, ltr, 1).left).toBe(104);
    expect(dropLineBox("row", frame, ltr, 3).left).toBe(319);
  });

  test("edge zones use the parent's shown direction when given", () => {
    const layout: Layout = {
      schemaVersion: 17,
      root: container("root0001", [
        container("boxa0001", [heading("head0001")]),
        container("boxb0001", [heading("head0002")]),
      ]) as Layout["root"],
    };
    const child = layout.root.children[0];
    if (!child) throw new Error("no child");
    // The root is a row through a class (its own style says nothing): the left edge of a box
    // drops before it, which RTL makes after it.
    const rect = box(220, 0, 100, 40);
    expect(edgeDrop(layout, child, rect, { x: 222, y: 20 }, undefined, "row")).toEqual({
      parentId: "root0001",
      index: 0,
    });
    expect(edgeDrop(layout, child, rect, { x: 222, y: 20 }, undefined, "row-reverse")).toEqual({
      parentId: "root0001",
      index: 1,
    });
  });
});
