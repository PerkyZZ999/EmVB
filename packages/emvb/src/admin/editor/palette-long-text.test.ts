import { describe, expect, test } from "bun:test";
import { emptyDesign, type Layout } from "../../core/index.ts";
import { filterPalette } from "./palette.ts";
import { paletteItems } from "./palette-items.ts";

const long = `${"Lorem ipsum dolor sit amet. ".repeat(20)}The secret word is zanzibar.`;
const emoji = `${"a".repeat(76)}😀 and more text after the emoji to pass eighty`;
const layout: Layout = {
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "text0001", type: "text", props: { text: long } },
      { id: "text0002", type: "text", props: { text: emoji } },
      { id: "head0001", type: "heading", props: { text: `${"b".repeat(39)}😀 tail`, level: 2 } },
    ],
  },
};

const items = () =>
  paletteItems({
    layout,
    design: emptyDesign(),
    selected: null,
    formsAvailable: false,
    insert: () => {},
    select: () => {},
    applyClass: () => {},
    actions: [],
  } as unknown as Parameters<typeof paletteItems>[0]);

const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("palette with long and astral text (W-556)", () => {
  test("Find text finds a word past the first 240 characters", () => {
    const found = filterPalette(items(), "/zanzibar").map((item) => item.id);
    expect(found).toContain("find:text0001");
  });
  test("cut labels and hints never end in half an emoji", () => {
    for (const item of items()) {
      expect(lone.test(item.label)).toBe(false);
      expect(lone.test(item.hint ?? "")).toBe(false);
    }
  });
});
