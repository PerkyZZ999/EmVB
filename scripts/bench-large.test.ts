import { expect, test } from "bun:test";
import { renderPage, validateLayout } from "../packages/emvb/src/core/index.ts";
import { countNodes, largeLayout } from "./bench-large.ts";

test("W-979: the large test pages are valid layouts of about 200, 1,000 and 1,900 elements", () => {
  expect([7, 33, 66].map((n) => countNodes(largeLayout(n)))).toEqual([204, 958, 1915]);
  for (const n of [7, 66]) expect(validateLayout(largeLayout(n)).ok).toBe(true);
});

test("W-979: the largest page renders well within budget, with compact CSS", () => {
  const layout = largeLayout(66);
  renderPage(layout, { schemaVersion: 17, variables: { colors: [] } });
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    renderPage(layout, { schemaVersion: 17, variables: { colors: [] } });
    times.push(performance.now() - start);
  }
  // Measured 17 to 19 ms; the budget leaves room for slower CI machines.
  expect(times.toSorted((a, b) => a - b)[2]).toBeLessThan(150);
  const { css, html } = renderPage(layout, { schemaVersion: 17, variables: { colors: [] } });
  expect(css.length).toBeLessThan(160_000);
  expect(html.length).toBeLessThan(200_000);
});
