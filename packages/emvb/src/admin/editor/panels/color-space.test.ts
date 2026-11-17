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

describe("CSS colour forms (W-540)", () => {
  test("rgb channels can be percents or decimals", () => {
    expect(parseRgb("rgb(100%, 0%, 50%)")).toEqual({ r: 255, g: 0, b: 128, a: 1 });
    expect(parseRgb("rgb(127.6 0 0)")).toEqual({ r: 128, g: 0, b: 0, a: 1 });
    expect(parseRgb("rgb(101% 0 0)")).toBeNull();
  });
  test("an oklch hue wraps around the circle", () => {
    expect(parseOklch("oklch(0.5 0.1 -30)")).toEqual(parseOklch("oklch(0.5 0.1 330)"));
    expect(parseOklch("oklch(0.5 0.1 400deg)")).toEqual(parseOklch("oklch(0.5 0.1 40)"));
  });
});

describe("OKLCH outside sRGB is mapped by chroma, not clipped (W-1082)", () => {
  const read = (text: string) => {
    const out = readBack(toHex(must(parseOklch(text))));
    return out;
  };
  const readBack = (hex: string) => {
    const [l, c, h] = formatOklch(must(parseHex(hex)))
      .split(", ")
      .map(Number) as [number, number, number];
    return { hex, l, c, h };
  };

  test("lightness and hue stay close; chroma gives way", () => {
    // Per-channel clipping turned this violet into L 48, hue 315.7 (#8e00b5).
    const violet = read("40, 0.35, 320");
    expect(violet.hex).toBe("#75008c");
    expect(Math.abs(violet.l - 40)).toBeLessThan(1.5);
    expect(Math.abs(violet.h - 320)).toBeLessThan(1.5);
    expect(violet.c).toBeLessThan(0.35);
    // Clipping gave #1500ff, L 45.5.
    expect(read("50, 0.4, 264").hex).toBe("#0033ff");
  });

  test("in-gamut colours, white and black are left alone", () => {
    expect(read("62.796, 0.25768, 29.23").hex).toBe("#ff0000");
    expect(read("100, 0.3, 40").hex).toBe("#ffffff");
    expect(read("0, 0.3, 40").hex).toBe("#000000");
  });
});
