import { expect, test } from "bun:test";
import { ELEMENTS } from "./index.ts";

/**
 * W-866: element names are sentence case ("Div block", "Post title"), approved by Charles on
 * 2026-10-21. Only the first word is capitalised; acronyms (SVG, HTML) and brand names keep theirs.
 */
const KEEP = /^([A-Z0-9]{2,}s?|YouTube|Vimeo|Lottie|Markdown|Google|OpenStreetMap)$/;

test("W-866: every element name is sentence case", () => {
  const off: string[] = [];
  const names = Object.values(ELEMENTS).map((def) => def.descriptor.name);
  expect(names).toContain("Div block");
  for (const name of names) {
    const rest = name.split(/\s+/).slice(1);
    if (rest.some((word) => /^[A-Z]/.test(word) && !KEEP.test(word))) off.push(name);
  }
  expect(off).toEqual([]);
});
