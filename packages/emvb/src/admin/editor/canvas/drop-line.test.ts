import { describe, expect, test } from "bun:test";
import { dropLineBox } from "./CanvasFrame.tsx";
import { dropLabelAt } from "./SelectionOverlay.tsx";

describe("dropLineBox", () => {
  const container = { top: 10, left: 20, width: 200, height: 100 };
  const children = [
    { top: 10, left: 20, width: 200, height: 20 },
    { top: 40, left: 20, width: 200, height: 20 },
  ];

  test("column: before, between and after", () => {
    expect(dropLineBox("column", container, children, 0)).toEqual({
      top: 9,
      left: 20,
      width: 200,
      height: 2,
    });
    expect(dropLineBox("column", container, children, 1).top).toBe(34);
    expect(dropLineBox("column", container, children, 2).top).toBe(59);
  });

  test("row: before, between and after", () => {
    const rowKids = [
      { top: 10, left: 20, width: 40, height: 80 },
      { top: 10, left: 80, width: 40, height: 80 },
    ];
    expect(dropLineBox("row", container, rowKids, 0).left).toBe(19);
    expect(dropLineBox("row", container, rowKids, 1).left).toBe(69);
    expect(dropLineBox("row", container, rowKids, 2).left).toBe(119);
  });

  test("empty container uses the container edge", () => {
    expect(dropLineBox("column", container, [], 0)).toEqual({
      top: 9,
      left: 20,
      width: 200,
      height: 2,
    });
  });
});

describe("the Inside label sits in the target's corner (W-129)", () => {
  test("a target tall enough holds the label inside its top-left corner", () => {
    expect(dropLabelAt({ top: 100, left: 20, width: 400, height: 48 })).toEqual({
      top: 104,
      left: 24,
    });
  });

  test("a short target puts the label above it, never off the top of the canvas", () => {
    expect(dropLabelAt({ top: 100, left: 20, width: 400, height: 18 })).toEqual({
      top: 74,
      left: 20,
    });
    expect(dropLabelAt({ top: 10, left: 0, width: 400, height: 18 })).toEqual({ top: 0, left: 0 });
  });
});
