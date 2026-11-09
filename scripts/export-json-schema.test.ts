import { expect, test } from "bun:test";
import { SCHEMA_FILES, expected, staleSchemaFiles } from "./export-json-schema.ts";

test("docs/schema matches the code (W-925; run bun scripts/export-json-schema.ts)", () => {
  expect(staleSchemaFiles()).toEqual([]);
});

test("the layout export names schema 18 and contract 1.0 and lists the 1.0 names", () => {
  const layout = expected("layout.schema.json");
  expect(layout).toContain("schema 18, contract 1.0");
  expect(layout).toContain('"part-ref"');
  expect(layout).toContain('"editorLabel"');
  expect(layout).toContain('"motion"');
  expect(layout).not.toContain('"itemPartId"');
  expect(Object.keys(SCHEMA_FILES)).toEqual(["layout.schema.json", "design.schema.json"]);
});
