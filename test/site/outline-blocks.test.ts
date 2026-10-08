import { describe, expect, test } from "bun:test";

import { BLOCK_SELECTOR, blockLabel } from "../../site/src/scripts/outline-blocks.ts";

const block = (tagName: string, el?: string, classes: string[] = []) => ({
  tagName,
  dataset: el === undefined ? {} : { el },
  classList: { contains: (token: string) => classes.includes(token) },
});

describe("home page Outline view labels (W-301)", () => {
  test("names tags after the EmVB element that builds them", () => {
    expect(blockLabel(block("SECTION"))).toBe("Section");
    expect(blockLabel(block("H2"))).toBe("Heading");
    expect(blockLabel(block("P"))).toBe("Text");
    expect(blockLabel(block("IMG"))).toBe("Image");
    expect(blockLabel(block("NAV"))).toBe("Menu");
    expect(blockLabel(block("DETAILS"))).toBe("Accordion item");
  });

  test("an explicit data-el wins over the tag", () => {
    expect(blockLabel(block("DIV", "Div Block"))).toBe("Div Block");
    expect(blockLabel(block("SECTION", "Accordion"))).toBe("Accordion");
  });

  test("only button links are blocks; plain links and unknown tags are not", () => {
    expect(blockLabel(block("A", undefined, ["button"]))).toBe("Button");
    expect(blockLabel(block("A"))).toBeUndefined();
    expect(blockLabel(block("SPAN"))).toBeUndefined();
  });

  test("the selector picks up data-el blocks and button links", () => {
    const parts = BLOCK_SELECTOR.split(",").map((part) => part.trim());
    expect(parts).toContain("[data-el]");
    expect(parts).toContain("a.button");
  });
});
