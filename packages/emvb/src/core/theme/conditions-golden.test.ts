import { expect, test } from "bun:test";
import { conditionsCases } from "../../../test/fixtures/conditions-cases.ts";
import golden from "../../../test/fixtures/conditions-golden.json";

// Recorded from conditions.ts before W-086 M15 moved each matcher next to its specificity.
test("conditions match, score, gate and pick winners as before", () => {
  expect(JSON.stringify(conditionsCases(), null, 2)).toBe(JSON.stringify(golden, null, 2));
});
