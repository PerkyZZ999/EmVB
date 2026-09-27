import { describe, expect, test } from "bun:test";
import { defaultTriggers, validateTriggers } from "../../../core/index.ts";

describe("popup triggers defaults for editor", () => {
  test("defaultTriggers round-trips validation", () => {
    const result = validateTriggers(defaultTriggers());
    expect(result.ok).toBe(true);
  });

  test("click trigger requires a safe selector on save", () => {
    const bad = validateTriggers({
      schemaVersion: 1,
      open: [{ type: "click", selector: "<script>" }],
      advanced: {},
    });
    expect(bad.ok).toBe(false);
  });
});
