import { describe, expect, test } from "bun:test";
import { isSafeCssValue, isSafeFontStack, STYLE_PROPERTY_MAP, styleClassName } from "./css.ts";

type Key = keyof typeof STYLE_PROPERTY_MAP;
const value = (key: Key, input: unknown) => STYLE_PROPERTY_MAP[key].toValue(input);
const px = (n: unknown, unit: unknown = "px") => ({ value: n, unit });

/** W-091: the boundaries and refusals of each typed CSS value, one row per edge. */
describe("CSS value edges (W-091, R-012, R-032)", () => {
  test.each<[Key, unknown, string | undefined]>([
    ["color", "#fff", "#fff"],
    ["color", "#FFFF", "#ffff"],
    ["color", "#112233", "#112233"],
    ["color", "#11223344", "#11223344"],
    ["color", "#f", undefined],
    ["color", "#12345", undefined],
    ["color", "red#fff", undefined],
    ["color", "#ggg", undefined],
    ["color", { var: "brand" }, "var(--emvb-c-brand)"],
    ["color", { var: "brand", from: "font" }, undefined],
    ["color", { var: "brand", from: "bogus" }, undefined],
    ["color", { var: 7 }, undefined],
    ["color", null, undefined],
    ["aspectRatio", "16/10", "16 / 10"],
    ["aspectRatio", "x16/9", undefined],
    ["fontFamily", "#fff", undefined],
    ["fontFamily", "Arial,\nserif", undefined],
    ["fontFamily", { var: "body", from: "font" }, "var(--emvb-f-body)"],
    ["fontFamily", { var: "body", from: "color" }, undefined],
    ["fontFamily", null, undefined],
    ["gap", px(0), "0px"],
    ["gap", px(10_000), "10000px"],
    ["gap", px(10_001), undefined],
    ["gap", px(-1), undefined],
    ["gap", px("8"), undefined],
    ["gap", px(8, 1), undefined],
    ["gap", { var: "m", from: "spacing" }, "var(--emvb-s-m)"],
    ["gap", { var: "m", from: "color" }, undefined],
    ["gap", null, undefined],
    ["top", px(-10_000), "-10000px"],
    ["top", px(10_000), "10000px"],
    ["top", px(10_001), undefined],
    ["top", px("1"), undefined],
    ["top", px(Number.NaN), undefined],
    ["top", px(1, 2), undefined],
    ["top", null, undefined],
    ["zIndex", 9999, "9999"],
    ["zIndex", -9999, "-9999"],
    ["zIndex", 10_000, undefined],
    ["zIndex", -10_000, undefined],
    ["opacity", 0.5, "0.5"],
    ["opacity", "0.5", undefined],
    ["fontWeight", 700, "700"],
    ["fontWeight", "bold", "bold"],
    ["fontWeight", 800, "800"],
    ["fontWeight", "800", "800"],
    ["fontWeight", 850, undefined],
    ["fontWeight", "1000", undefined],
    ["boxShadow", null, undefined],
    ["boxShadow", { x: 1, y: 2, blur: 3, spread: 0 }, "1px 2px 3px 0px"],
    ["filter", {}, undefined],
    ["filter", null, undefined],
    ["transition", null, undefined],
    ["transition", { duration: 200, easing: 5, property: "all" }, undefined],
    ["transition", { duration: 200, easing: "ease", property: 5 }, undefined],
  ])("%s %p gives %p", (key, input, expected) => {
    expect(value(key, input)).toBe(expected);
  });

  test("a CSS value is 1 to 200 characters on one line", () => {
    expect([
      isSafeCssValue(""),
      isSafeCssValue("a".repeat(200)),
      isSafeCssValue("a".repeat(201)),
      isSafeCssValue("a\nb"),
    ]).toEqual([false, true, false, false]);
  });

  test("a quoted font stack is at most 200 characters on one line", () => {
    const stack = (n: number) => `'${"a".repeat(n - 2)}'`;
    expect([
      isSafeFontStack(stack(200)),
      isSafeFontStack(stack(201)),
      isSafeFontStack("'Inter',\n'Arial'"),
    ]).toEqual([true, false, false]);
  });

  test("a class name is 1 to 40 lowercase letters, digits or hyphens", () => {
    expect([
      styleClassName("card-2"),
      styleClassName("a".repeat(40)),
      styleClassName("a".repeat(41)),
      styleClassName("card x"),
      styleClassName("x card"),
      styleClassName(""),
    ]).toEqual([
      "emvb-k-card-2",
      `emvb-k-${"a".repeat(40)}`,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
