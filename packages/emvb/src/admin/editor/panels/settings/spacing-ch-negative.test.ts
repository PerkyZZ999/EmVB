import { describe, expect, test } from "bun:test";
import { parseLengthDraft, unitsFor } from "./length-units.ts";

describe("spacing controls take ch and negative margins (W-331)", () => {
  test("the spacing fields take -16, and 40ch typed or picked", () => {
    expect(parseLengthDraft("-16", "marginTop", "px")).toEqual({
      ok: true,
      value: { value: -16, unit: "px" },
    });
    expect(parseLengthDraft("-16", "paddingTop", "px").ok).toBe(false);
    expect(parseLengthDraft("40ch", "maxWidth", "px")).toEqual({
      ok: true,
      value: { value: 40, unit: "ch" },
    });
    expect(unitsFor("marginLeft")).toContain("ch");
    expect(unitsFor("paddingTop")).toContain("ch");
  });
});
