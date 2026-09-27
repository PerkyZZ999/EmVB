import { describe, expect, test } from "bun:test";
import { packSmoke } from "./pack-smoke.ts";

describe("pack smoke (W-044, R-052)", () => {
  test("packed emvb tarball exports TypeScript source entrypoints", async () => {
    await packSmoke();
    expect(true).toBe(true);
  }, 120_000);
});
