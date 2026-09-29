import { expect, test } from "bun:test";
import golden from "../../../test/fixtures/node-shapes-golden.json";
import { nodeShapes } from "../../../test/fixtures/node-shapes.ts";

// Recorded from layout.ts before W-086 M7 built the node schemas from shared fields.
test("layout schemas keep their shape, constraints and key order", () => {
  expect(nodeShapes()).toEqual(golden);
});
