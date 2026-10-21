import { describe, expect, test } from "bun:test";
import { FEATURE_CSS } from "./feature-css.ts";

describe("feature CSS colors (W-380)", () => {
  test("status colors are Kumo roles, not hex", () => {
    expect(/#[0-9a-fA-F]{3,8}\b/.test(FEATURE_CSS)).toBe(false);
  });
});

describe("feature CSS typography (UX-001)", () => {
  const rule = (selector: string) => {
    const start = FEATURE_CSS.indexOf(`${selector} {`);
    return start < 0 ? "" : FEATURE_CSS.slice(start, FEATURE_CSS.indexOf("}", start));
  };

  test("palette group headings are sentence case without tracking", () => {
    const css = rule(".emvb-palette-group");
    expect(css).toMatch(/font-size: 12px;/);
    expect(/text-transform|letter-spacing/.test(css)).toBe(false);
  });

  test("panel sub-titles match the 13 px semibold section labels", () => {
    expect(rule(".emvb-bind-title")).toMatch(/font-size: 13px;/);
  });
});

describe("Scales preview layout (UX-003)", () => {
  const rule = (selector: string) => {
    const start = FEATURE_CSS.indexOf(`${selector} {`);
    return start < 0 ? "" : FEATURE_CSS.slice(start, FEATURE_CSS.indexOf("}", start));
  };

  test("rows share one column grid, so names line up and never collapse", () => {
    expect(rule(".emvb-tokens-preview")).toMatch(
      /grid-template-columns: max-content minmax\(0, 1fr\) auto;/,
    );
    expect(rule(".emvb-tokens-preview > li")).toMatch(/grid-template-columns: subgrid;/);
    expect(rule(".emvb-tokens-preview > li > span:nth-child(2)")).toMatch(/white-space: nowrap;/);
  });
});

test("UX-005: a select alone in its row, like Visitors' Show to, spans the row", () => {
  expect(FEATURE_CSS).toMatch(
    /\.emvb-bind-row > \.emvb-panel-select:last-child \{ grid-column: 1 \/ -1; \}/,
  );
});

test("UX-093: the command palette is pinned near the top, so filtering doesn't move it", () => {
  expect(FEATURE_CSS).toContain(
    ".emvb-palette.emvb-palette { top: max(12vh, 32px); translate: -50% 0; }",
  );
});

test("W-810: the command palette has a fixed width, so results don't move it sideways", () => {
  expect(FEATURE_CSS).toContain(
    ".emvb-palette.emvb-palette.emvb-palette { width: min(564px, calc(100vw - 32px)); }",
  );
});

test("W-867: a Visitors row with a single text field spans the full panel width", () => {
  expect(FEATURE_CSS).toMatch(
    /\.emvb-bind-row > \.emvb-bind-label \+ \.emvb-field:last-child \{ grid-column: 1 \/ -1; \}/,
  );
});
