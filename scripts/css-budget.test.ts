import { describe, expect, test } from "bun:test";
import { CSS_GZIP_BUDGET, cssGzipBytes, densePageCss, successPageCss } from "./css-budget.ts";
import { BUDGET_MS, benchRenderMedian } from "./bench-render.ts";

describe("N-002 performance budgets (W-040)", () => {
  test("success and 300-node CSS stay under 15 KB gzipped", () => {
    expect(cssGzipBytes(successPageCss())).toBeLessThanOrEqual(CSS_GZIP_BUDGET);
    expect(cssGzipBytes(densePageCss())).toBeLessThanOrEqual(CSS_GZIP_BUDGET);
  });

  test("renderPage median for 300 nodes stays under 20 ms", () => {
    expect(benchRenderMedian()).toBeLessThanOrEqual(BUDGET_MS);
  });
});
