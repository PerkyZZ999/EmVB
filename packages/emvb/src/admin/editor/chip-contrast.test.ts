import { expect, test } from "bun:test";
import { EDITOR_CSS } from "./editor-css.ts";

test("W-976: the active style-source chip is darker than the plain brand blue", () => {
  const rule = /\.emvb-chip\[data-active="true"\] \{([^}]*)\}/.exec(EDITOR_CSS)?.[1] ?? "";
  // White on the plain brand blue (#076eff) measured 4.48:1, under WCAG AA's 4.5:1.
  expect(rule).toContain("color: #fff");
  expect(rule).toMatch(
    /background: color-mix\(in oklch, var\(--color-kumo-brand\), black (\d+)%\)/,
  );
  const black = Number(/black (\d+)%/.exec(rule)?.[1]);
  expect(black).toBeGreaterThanOrEqual(10);
});
