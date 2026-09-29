import { describe, expect, test } from "bun:test";
import golden from "../../../test/fixtures/svg-golden.json";
import { sanitizeSvgMarkup } from "./svg.ts";

// Pins the tokenizer and tree builder on a corpus of accepted and refused markup, so a refactor
// can't loosen (or tighten) the allowlist unnoticed.
describe("SVG sanitizer golden corpus (W-073, W-079)", () => {
  for (const { input, output } of golden) {
    test(input.length > 60 ? `${input.slice(0, 60)}…` : input || "(empty)", () => {
      expect(sanitizeSvgMarkup(input) ?? null).toEqual(output as never);
    });
  }
});
