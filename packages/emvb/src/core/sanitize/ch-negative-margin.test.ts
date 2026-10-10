import { describe, expect, test } from "bun:test";
import { StyleProps } from "../schema/style.ts";
import { styleDeclarations } from "./css.ts";

describe("ch lengths and negative margins (W-331)", () => {
  test("ch is a length unit: a 65ch max width reaches the CSS", () => {
    const style = { maxWidth: { value: 65, unit: "ch" } };
    expect(StyleProps.safeParse(style).success).toBe(true);
    expect(styleDeclarations(style).declarations).toContainEqual({
      property: "max-width",
      value: "65ch",
    });
  });

  test("margins may be negative, up to -10000, on every side", () => {
    for (const key of ["marginTop", "marginRight", "marginBottom", "marginLeft"]) {
      const style = { [key]: { value: -24, unit: "px" } };
      expect(StyleProps.safeParse(style).success).toBe(true);
      expect(styleDeclarations(style).rejected).toEqual([]);
    }
    expect(
      styleDeclarations({ marginTop: { value: -1.5, unit: "rem" } }).declarations,
    ).toContainEqual({ property: "margin-top", value: "-1.5rem" });
    expect(StyleProps.safeParse({ marginTop: { value: -10_001, unit: "px" } }).success).toBe(false);
    expect(StyleProps.safeParse({ marginTop: "auto" }).success).toBe(true);
  });

  test("padding still refuses a negative value", () => {
    expect(StyleProps.safeParse({ paddingTop: { value: -1, unit: "px" } }).success).toBe(false);
  });
});
