import { describe, expect, test } from "bun:test";
import { summarizeLayout } from "./stats.ts";

describe("summarizeLayout", () => {
  test("a children list far over the cap does not overflow the stack (W-646)", () => {
    const children = Array.from({ length: 2_000_000 }, () => ({}));
    const summary = summarizeLayout({ schemaVersion: 17, root: { children } });
    expect(summary?.schemaVersion).toBe(17);
    expect(summary?.nodes).toBeGreaterThan(100_000);
    expect(summary?.nodes).toBeLessThanOrEqual(100_001);
  });
});
