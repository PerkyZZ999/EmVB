import { describe, expect, test } from "bun:test";
import { stateDeclarations, styleDeclarations } from "./css.ts";

// W-091: Stryker left every keyword in css.ts's allowlists, and the null and non-object guards,
// unchecked (css.ts 89%). The lists are written out here on purpose: a keyword dropped from
// css.ts must fail this file, not change it.

const KEYWORDS: Record<string, { css: string; values: string[] }> = {
  flexDirection: {
    css: "flex-direction",
    values: ["row", "column", "row-reverse", "column-reverse"],
  },
  flexWrap: { css: "flex-wrap", values: ["nowrap", "wrap", "wrap-reverse"] },
  justifyContent: {
    css: "justify-content",
    values: ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"],
  },
  alignItems: {
    css: "align-items",
    values: ["stretch", "flex-start", "flex-end", "center", "baseline"],
  },
  textAlign: { css: "text-align", values: ["left", "center", "right", "justify"] },
  textTransform: {
    css: "text-transform",
    values: ["none", "uppercase", "lowercase", "capitalize"],
  },
  borderStyle: { css: "border-style", values: ["none", "solid", "dashed", "dotted"] },
  overflow: { css: "overflow", values: ["visible", "hidden", "clip", "scroll", "auto"] },
  objectFit: { css: "object-fit", values: ["fill", "contain", "cover", "none", "scale-down"] },
  position: { css: "position", values: ["static", "relative", "absolute", "fixed", "sticky"] },
  cursor: {
    css: "cursor",
    values: [
      "default",
      "pointer",
      "text",
      "move",
      "grab",
      "not-allowed",
      "help",
      "crosshair",
      "zoom-in",
    ],
  },
  fontWeight: { css: "font-weight", values: ["normal", "bold", "400", "500", "600", "700"] },
};

const cases = Object.entries(KEYWORDS).flatMap(([key, { css, values }]) =>
  values.map((value) => [key, css, value] as const),
);

describe("keyword allowlists (W-091)", () => {
  test.each(cases)("%s (%s) accepts %s", (key, css, value) => {
    expect(styleDeclarations({ [key]: value })).toEqual({
      declarations: [
        {
          property: css,
          value:
            key === "textAlign"
              ? value === "left"
                ? "start"
                : value === "right"
                  ? "end"
                  : value
              : value,
        },
      ],
      rejected: [],
    });
  });

  test.each(["px", "rem", "em", "%", "vw", "vh"])("lengths accept the %s unit", (unit) => {
    expect(styleDeclarations({ gap: { value: 2, unit } }).declarations).toEqual([
      { property: "gap", value: `2${unit}` },
    ]);
  });

  test("a colour reference may say from: color, and a malformed variable id is refused", () => {
    expect(styleDeclarations({ color: { var: "brand", from: "color" } }).declarations).toEqual([
      { property: "color", value: "var(--emvb-c-brand)" },
    ]);
    expect(styleDeclarations({ color: { var: "Brand Blue" } })).toEqual({
      declarations: [],
      rejected: ["color"],
    });
  });
});

describe("values of the wrong shape are refused, never thrown on (W-091)", () => {
  test.each([
    ["color", 5],
    ["fontFamily", 5],
    ["boxShadow", null],
    ["filter", null],
    ["transition", null],
  ] as const)("%s: %p", (key, value) => {
    expect(styleDeclarations({ [key]: value })).toEqual({ declarations: [], rejected: [key] });
  });

  test("a null style is empty", () => {
    expect(styleDeclarations(null)).toEqual({ declarations: [], rejected: [] });
  });
});

describe("state declarations edges (W-091)", () => {
  test("null states, and a state that is null or a string, give nothing and don't throw", () => {
    expect(stateDeclarations(null)).toEqual({ states: {}, rejected: [] });
    expect(stateDeclarations({ hover: null, focus: "red" })).toEqual({ states: {}, rejected: [] });
  });

  test("a valid state reports nothing, and a state with only bad values gets no rule", () => {
    expect(stateDeclarations({ hover: { color: "#ffffff" } })).toEqual({
      states: { hover: [{ property: "color", value: "#ffffff" }] },
      rejected: [],
    });
    expect(stateDeclarations({ active: { color: "blue" } })).toEqual({
      states: {},
      rejected: ["active.color"],
    });
  });
});
