import { describe, expect, test } from "bun:test";
import { formatOklch, formatRgb, parseHex, parseOklch, parseRgb, toHex } from "./color-space.ts";

function must<T>(value: T | null): T {
  if (value === null) throw new Error("expected a colour");
  return value;
}

describe("colour notations (W-160)", () => {
  test("hex, RGB and OKLCH are views of the same stored hex", () => {
    const rgba = must(parseHex("#c2410c"));
    expect(rgba).toEqual({ r: 194, g: 65, b: 12, a: 1 });
    expect(formatRgb(rgba)).toBe("194, 65, 12");
    expect(toHex(must(parseRgb("194, 65, 12")))).toBe("#c2410c");
    const oklch = formatOklch(rgba);
    expect(toHex(must(parseOklch(oklch)))).toBe("#c2410c");
  });

  test("an 8-digit hex keeps alpha, and a bad channel is refused", () => {
    expect(toHex(must(parseRgb("255, 0, 0, 50%")))).toBe("#ff000080");
    expect(parseHex("#ff000080")?.a).toBeCloseTo(128 / 255, 2);
    expect(parseRgb("256, 0, 0")).toBeNull();
    expect(parseOklch("120, 0.1, 20")).toBeNull();
    expect(parseOklch("nope")).toBeNull();
  });
});
