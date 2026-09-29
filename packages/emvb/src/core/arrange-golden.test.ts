import { expect, test } from "bun:test";
import { dropTable } from "../../test/fixtures/arrange-cases.ts";
import golden from "../../test/fixtures/arrange-golden.json";

// The golden table was recorded from canDrop before W-086 H10 restructured it.
test("canDrop gives the recorded outcome for every source and target", () => {
  expect(dropTable()).toEqual(golden);
});
