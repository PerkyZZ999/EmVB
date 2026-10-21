import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// W-807: the accent is used as link and label text on every surface, including the sunk bands and
// inline code. axe found #2563eb at 4.15:1 on --paper-sunk; text needs 4.5:1 (WCAG 1.4.3).
const css = readFileSync(new URL("../../site/src/styles/tokens.css", import.meta.url), "utf8");
const dark = css.indexOf("@media (prefers-color-scheme: dark)");
const tokens = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
  );
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].toSorted((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe("emvb.dev accent text contrast (W-807)", () => {
  for (const [scheme, block] of [
    ["light", css.slice(0, dark)],
    ["dark", css.slice(dark)],
  ] as const) {
    test(`${scheme}: the accent meets 4.5:1 on every paper surface`, () => {
      const t = tokens(block);
      for (const surface of ["paper", "paper-raised", "paper-sunk"]) {
        expect(t["accent"]).toBeDefined();
        expect(ratio(t["accent"] ?? "", t[surface] ?? "")).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
