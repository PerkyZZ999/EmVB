import { expect, test } from "bun:test";
import { dropTable, moveTable } from "../../test/fixtures/arrange-cases.ts";
import golden from "../../test/fixtures/arrange-golden.json";
import moves from "../../test/fixtures/arrange-moves-golden.json";

// The golden table was recorded from canDrop before W-086 H10 restructured it.
test("canDrop gives the recorded outcome for every source and target", () => {
  expect(dropTable()).toEqual(golden);
});

// Recorded from moveUp/Down/In/Out before W-086 L1 shared their guards.
test("keyboard moves give the recorded place or refusal for every element", () => {
  expect(moveTable()).toEqual(moves);
});
