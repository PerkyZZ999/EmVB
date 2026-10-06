import { describe, expect, test } from "bun:test";
import {
  formatOklch,
  formatRgb,
  oklchClipped,
  parseHex,
  parseOklch,
  parseRgb,
  toHex,
} from "./color-space.ts";

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

  test("pasted CSS oklch() reads lightness as 0–1 or a percent, and EmVB's 0–100 still works (W-173)", () => {
    const hex = (text: string) => {
      const rgba = parseOklch(text);
      return rgba ? toHex(rgba) : null;
    };
    expect(hex("oklch(0.628 0.2577 29.23)")).toBe("#ff0000");
    expect(hex("oklch(62.8% 0.2577 29.23deg)")).toBe("#ff0000");
    expect(hex("oklch(0.628 64.43% 29.23)")).toBe("#ff0000");
    expect(hex("62.8, 0.2577, 29.23")).toBe("#ff0000");
    expect(hex("oklch(1 0 0)")).toBe("#ffffff");
    expect(hex("oklch(0 0 0)")).toBe("#000000");
    expect(hex("oklch(101% 0 0)")).toBeNull();
    // The darkest colour EmVB shows (L 3.038) is still read as 0–100.
    expect(hex(formatOklch(must(parseHex("#000001"))))).toBe("#000001");
  });

  test("an OKLCH colour outside sRGB counts as clipped; one EmVB formatted never does (W-183)", () => {
    expect(oklchClipped("62.8, 0.4, 29")).toBe(true);
    expect(toHex(must(parseOklch("62.8, 0.4, 29")))).toBe("#ff0000");
    expect(oklchClipped("oklch(0.9 0.3 140)")).toBe(true);
    expect(oklchClipped("62.8, 0.1, 29")).toBe(false);
    expect(oklchClipped("nope")).toBe(false);
    for (const hex of [
      "#000000",
      "#ffffff",
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ffff00",
      "#c2410c",
      "#010101",
      "#fefefe",
    ]) {
      expect([hex, oklchClipped(formatOklch(must(parseHex(hex))))]).toEqual([hex, false]);
    }
  });
});
