import { expect, test } from "bun:test";
import { themeContextCases } from "../../test/fixtures/theme-context-cases.ts";
import golden from "../../test/fixtures/theme-context-golden.json";

// Recorded from theme-context.ts before W-086 M13 folded its branches; key order counts.
test("request contexts keep their shape for every path and hint", () => {
  expect(themeContextCases()).toBe(JSON.stringify(golden, null, 2));
});
