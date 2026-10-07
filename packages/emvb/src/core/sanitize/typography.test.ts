import { describe, expect, test } from "bun:test";
import { StyleProps } from "../schema/style.ts";
import { styleDeclarations } from "./css.ts";

const css = (style: Record<string, unknown>) =>
  styleDeclarations(style).declarations.map((d) => `${d.property}:${d.value}`);
const ok = (style: Record<string, unknown>) => StyleProps.safeParse(style).success;

describe("typography range (W-213)", () => {
  test("font weights 100–900 in steps of 100", () => {
    for (const w of [100, 200, 300, 800, 900]) {
      expect(ok({ fontWeight: w })).toBe(true);
      expect(css({ fontWeight: w })).toEqual([`font-weight:${w}`]);
    }
    expect(ok({ fontWeight: 850 })).toBe(false);
    expect(ok({ fontWeight: 1000 })).toBe(false);
    expect(css({ fontWeight: 1000 })).toEqual([]);
  });

  test("letter spacing may be negative", () => {
    expect(ok({ letterSpacing: { value: -0.05, unit: "em" } })).toBe(true);
    expect(css({ letterSpacing: { value: -0.05, unit: "em" } })).toEqual([
      "letter-spacing:-0.05em",
    ]);
    expect(ok({ letterSpacing: "auto" })).toBe(false);
    expect(css({ letterSpacing: "auto" })).toEqual([]);
  });

  test("line height may be a unitless number 0–100", () => {
    expect(ok({ lineHeight: 1.5 })).toBe(true);
    expect(css({ lineHeight: 1.5 })).toEqual(["line-height:1.5"]);
    expect(ok({ lineHeight: 101 })).toBe(false);
    expect(ok({ lineHeight: -1 })).toBe(false);
    expect(css({ lineHeight: 101 })).toEqual([]);
  });
});
