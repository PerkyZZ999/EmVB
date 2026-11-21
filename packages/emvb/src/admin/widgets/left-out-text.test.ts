import { expect, test } from "bun:test";
import { leftOutText } from "./ConvertToRichText.tsx";

test("W-1091 (#39): the rich-text left-out list names elements with proper plurals", () => {
  expect(leftOutText({ "icon-box": 12, testimonial: 2, "price-table": 6, form: 1 })).toBe(
    "12 icon boxes, 2 testimonials, 6 price tables, form",
  );
});
