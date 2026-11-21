import { expect, test } from "bun:test";
import { ELEMENTS } from "./index.ts";
import { elementCount, elementNoun, elementPlural } from "./element-nouns.ts";

test("W-1091 (#39): element types read as their names, with English plurals", () => {
  expect(elementCount("icon-box", 12)).toBe("12 icon boxes");
  expect(elementCount("price-table", 6)).toBe("6 price tables");
  expect(elementCount("testimonial", 2)).toBe("2 testimonials");
  expect(elementCount("form", 1)).toBe("form");
  expect(elementCount("gallery", 3)).toBe("3 galleries");
  expect(elementCount("svg", 2)).toBe("2 SVGs");
  expect(elementCount("cta", 2)).toBe("2 calls to action");
  expect(elementCount("tabs", 2)).toBe("2 tab sets");
  expect(elementNoun("carousel-slide")).toBe("slide");
  // A type EmVB doesn't know (an extension's) still reads as words.
  expect(elementCount("acme-quote_box", 2)).toBe("2 acme quote boxes");
});

test("W-1091 (#39): no element's plural is a broken one (boxs, ys, ss)", () => {
  const bad = Object.keys(ELEMENTS)
    .map(elementPlural)
    .filter((p) => /(?:xs|ys|ss|chs|shs)$/.test(p) || /-/.test(p));
  expect(bad).toEqual([]);
});
