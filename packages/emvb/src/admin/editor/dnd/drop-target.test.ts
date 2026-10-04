import { describe, expect, test } from "bun:test";
import { container, heading, s1Page } from "../../../../test/fixtures/layouts.ts";
import type { Layout } from "../../../core/index.ts";
import { dropContainer, dropIndex, edgeDrop, type Rect } from "./drop-target.ts";

const box = (left: number, top: number, width = 100, height = 40): Rect => ({
  left,
  top,
  width,
  height,
});

/** Three children stacked from y=0: 0–40, 50–90, 100–140. */
const column = [box(0, 0), box(0, 50), box(0, 100)];
/** Three children side by side from x=0: 0–100, 110–210, 220–320. */
const row = [box(0, 0), box(110, 0), box(220, 0)];

describe("dropIndex (K16 drop-target maths)", () => {
  test("column containers: before the first, between, after the last", () => {
    expect(dropIndex("column", column, { x: 50, y: 5 })).toBe(0);
    expect(dropIndex("column", column, { x: 50, y: 30 })).toBe(1);
    expect(dropIndex("column", column, { x: 50, y: 45 })).toBe(1);
    expect(dropIndex("column", column, { x: 50, y: 75 })).toBe(2);
    expect(dropIndex("column", column, { x: 50, y: 139 })).toBe(3);
    expect(dropIndex("column", column, { x: 50, y: 500 })).toBe(3);
    expect(dropIndex("column", column, { x: 50, y: -20 })).toBe(0);
  });

  test("row containers use the horizontal position", () => {
    expect(dropIndex("row", row, { x: 10, y: 20 })).toBe(0);
    expect(dropIndex("row", row, { x: 60, y: 20 })).toBe(1);
    expect(dropIndex("row", row, { x: 105, y: 20 })).toBe(1);
    expect(dropIndex("row", row, { x: 200, y: 20 })).toBe(2);
    expect(dropIndex("row", row, { x: 300, y: 20 })).toBe(3);
    expect(dropIndex("row", row, { x: 60, y: 900 })).toBe(1);
  });

  test("an empty container takes the drop at index 0", () => {
    expect(dropIndex("column", [], { x: 1, y: 1 })).toBe(0);
    expect(dropIndex("row", [], { x: 1, y: 1 })).toBe(0);
  });

  test("reversed containers count from the other end", () => {
    const reversedColumn = [box(0, 100), box(0, 50), box(0, 0)];
    expect(dropIndex("column-reverse", reversedColumn, { x: 50, y: 130 })).toBe(0);
    expect(dropIndex("column-reverse", reversedColumn, { x: 50, y: 75 })).toBe(1);
    expect(dropIndex("column-reverse", reversedColumn, { x: 50, y: 60 })).toBe(2);
    expect(dropIndex("column-reverse", reversedColumn, { x: 50, y: 5 })).toBe(3);
    const reversedRow = [box(220, 0), box(110, 0), box(0, 0)];
    expect(dropIndex("row-reverse", reversedRow, { x: 300, y: 20 })).toBe(0);
    expect(dropIndex("row-reverse", reversedRow, { x: 10, y: 20 })).toBe(3);
  });

  test("wrapped rows pick the line under the pointer first", () => {
    const wrapped = [box(0, 0), box(110, 0), box(0, 50), box(110, 50)];
    expect(dropIndex("row", wrapped, { x: 10, y: 20 })).toBe(0);
    expect(dropIndex("row", wrapped, { x: 200, y: 20 })).toBe(2);
    expect(dropIndex("row", wrapped, { x: 10, y: 70 })).toBe(2);
    expect(dropIndex("row", wrapped, { x: 200, y: 70 })).toBe(4);
    expect(dropIndex("row", wrapped, { x: 200, y: 45 })).toBe(2);
  });
});

describe("dropContainer", () => {
  const layout: Layout = {
    schemaVersion: 10,
    root: container("root0001", [
      heading("head0001"),
      container("box00001", [heading("head0002")]),
    ]) as Layout["root"],
  };

  test("a container takes the drop itself; any other element hands it to its parent", () => {
    expect(dropContainer(layout, "box00001").id).toBe("box00001");
    expect(dropContainer(layout, "head0002").id).toBe("box00001");
    expect(dropContainer(layout, "head0001").id).toBe("root0001");
  });

  test("nothing under the pointer, or an unknown id, means the page's root", () => {
    expect(dropContainer(layout, null).id).toBe("root0001");
    expect(dropContainer(s1Page(), "nope0000").id).toBe("root0001");
  });
});

describe("drop targets nest reliably (W-128)", () => {
  const grid = {
    id: "grid0001",
    type: "grid",
    props: { columns: 2 },
    children: [heading("head0003")],
  };
  const tabs = {
    id: "tabs0001",
    type: "tabs",
    props: {},
    children: [
      { id: "tabp0001", type: "tab-panel", props: { label: "One" }, children: [] },
      { id: "tabp0002", type: "tab-panel", props: { label: "Two" }, children: [] },
    ],
  };
  const layout = {
    schemaVersion: 10,
    root: container("root0001", [
      container("card0001", [
        heading("head0001"),
        { id: "gin00001", type: "grid", props: { columns: 2 }, children: [heading("head0004")] },
      ]),
      grid,
      tabs,
    ]),
  } as unknown as Layout;
  const notTabs = (parent: { type: string }) => parent.type !== "tabs";

  test("a Grid, and anything inside it, takes the drop instead of its parent", () => {
    expect(dropContainer(layout, "grid0001").id).toBe("grid0001");
    expect(dropContainer(layout, "head0003").id).toBe("grid0001");
  });

  test("an element that refuses the drop hands it to the nearest ancestor that takes it", () => {
    const onlyCard = (parent: { id: string }) => parent.id === "card0001";
    expect(dropContainer(layout, "head0004", onlyCard).id).toBe("card0001");
    const onlyRoot = (parent: { id: string }) => parent.id === "root0001";
    expect(dropContainer(layout, "head0001", onlyRoot).id).toBe("root0001");
  });

  test("a non-panel dropped on Tabs goes into the active panel, else the first", () => {
    expect(dropContainer(layout, "tabs0001", notTabs, () => "tabp0002").id).toBe("tabp0002");
    expect(dropContainer(layout, "tabs0001", notTabs).id).toBe("tabp0001");
  });

  test("near a container's top or bottom edge the drop goes before or after it", () => {
    const card = layout.root.children[0] as Layout["root"];
    const rect = box(0, 100, 400, 80);
    expect(edgeDrop(layout, card, rect, { x: 200, y: 104 })).toEqual({
      parentId: "root0001",
      index: 0,
    });
    expect(edgeDrop(layout, card, rect, { x: 200, y: 176 })).toEqual({
      parentId: "root0001",
      index: 1,
    });
    expect(edgeDrop(layout, card, rect, { x: 200, y: 140 })).toBeNull();
    expect(edgeDrop(layout, layout.root, rect, { x: 200, y: 104 })).toBeNull();
  });

  test("the edge zone is at most a quarter of a small container", () => {
    const card = layout.root.children[0] as Layout["root"];
    const small = box(0, 0, 400, 20);
    expect(edgeDrop(layout, card, small, { x: 10, y: 6 })).toBeNull();
    expect(edgeDrop(layout, card, small, { x: 10, y: 4 })?.index).toBe(0);
  });
});
