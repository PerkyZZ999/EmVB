import { describe, expect, test } from "bun:test";
import { iconAnimationRuns } from "./animation-runs.ts";

describe("W-848 looping icons stop on their own", () => {
  test("W-848 a spin repeats only as many whole turns as fit in 5 s, at least one", () => {
    expect(
      [200, 1000, 2000, 2500, 3000, 10_000].map((ms) => iconAnimationRuns("spin", ms)),
    ).toEqual([25, 5, 2, 2, 1, 1]);
  });

  test("W-848 a pulse runs an even number of times within 5 s, so it ends at rest", () => {
    expect([200, 800, 1000, 2500, 3000].map((ms) => iconAnimationRuns("pulse", ms))).toEqual([
      24, 6, 4, 2, 2,
    ]);
  });
});
