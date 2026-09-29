import { expect, test } from "bun:test";
import { formElementCases } from "../../../test/fixtures/form-elements-cases.ts";
import golden from "../../../test/fixtures/form-elements-golden.json";

// Recorded from form-elements.ts before W-086 M8 shared its field pieces.
test("form elements keep their defaults, descriptors, CSS and markup", () => {
  expect(JSON.parse(JSON.stringify(formElementCases()))).toEqual(golden);
});
