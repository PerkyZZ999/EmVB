import { describe, expect, test } from "bun:test";
import { parseLengthDraft } from "./length-units.ts";

describe("typography fields (W-213)", () => {
  test("Letter spacing takes a negative number; Line height doesn't", () => {
    expect(parseLengthDraft("-1", "letterSpacing", "px")).toEqual({
      ok: true,
      value: { value: -1, unit: "px" },
    });
    expect(parseLengthDraft("-1", "lineHeight", "em").ok).toBe(false);
  });

  test("Line height's × unit stores a plain number 0–100; other fields have no ×", () => {
    expect(parseLengthDraft("1.4", "lineHeight", "x")).toEqual({ ok: true, value: 1.4 });
    expect(parseLengthDraft("140", "lineHeight", "x").ok).toBe(false);
    expect(parseLengthDraft("24px", "lineHeight", "x")).toEqual({
      ok: true,
      value: { value: 24, unit: "px" },
    });
    expect(parseLengthDraft("1.4", "fontSize", "x").ok).toBe(false);
  });
});
