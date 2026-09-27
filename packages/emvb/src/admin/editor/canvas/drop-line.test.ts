import { describe, expect, test } from "bun:test";
import { dropLineBox } from "./CanvasFrame.tsx";

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
