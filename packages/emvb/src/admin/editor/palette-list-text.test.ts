import { describe, expect, test } from "bun:test";
import { emptyDesign, type Layout } from "../../core/index.ts";
import { filterPalette } from "./palette.ts";
import { paletteItems } from "./palette-items.ts";

// W-618: a List keeps its items as plain strings, so Find text couldn't find them.
const layout: Layout = {
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "list0001", type: "list", props: { items: ["Free shipping", "Lifetime warranty"] } },
    ],
  },
};

describe("palette Find text on a List (W-618)", () => {
  test("finds a word from a list item", () => {
    const items = paletteItems({
      layout,
      design: emptyDesign(),
      selected: null,
      formsAvailable: false,
      insert: () => {},
      select: () => {},
      applyClass: () => {},
      actions: [],
    });
    const found = filterPalette(items, "/warranty");
    expect(found.map((item) => item.id)).toContain("find:list0001");
  });
});
