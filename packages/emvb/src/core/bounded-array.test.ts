import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { boundedArray } from "./bounded-array.ts";
import { ProposeChangesInput } from "../mcp/proposals.ts";
import { AddElementInput, UpdateSiteStylesInput } from "../mcp/write.ts";

const flood = (n = 200_000) => Array.from({ length: n }, () => 0);
const issues = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues;
};

describe("D-070: arrays from requests check their length before their items", () => {
  test("an oversized array of bad items is one issue, not one per item", () => {
    const found = issues(boundedArray(z.object({ kind: z.string() }), 100, 1), flood());
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toBe("Too many items: at most 100.");
  });

  test("within its bounds it parses like z.array, and its JSON Schema is the plain array", () => {
    const schema = boundedArray(z.string(), 3, 1);
    expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(issues(schema, [])).toHaveLength(1);
    expect(issues(schema, "a")).toHaveLength(1);
    expect(z.toJSONSchema(schema, { target: "draft-7" })).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string" },
    });
  });

  test("propose_changes ops", () => {
    const input = { pageId: "p", baseRevision: "r", baseDesignRevision: null, ops: flood() };
    expect(issues(ProposeChangesInput, input)).toHaveLength(1);
  });

  test("add_element children, at any depth", () => {
    const element = { type: "container", children: [{ type: "container", children: flood() }] };
    expect(issues(AddElementInput, { pageId: "p", parentId: "root0001", element })).toHaveLength(1);
  });

  test("update_site_styles variables, removals and classes", () => {
    for (const input of [
      { variables: { colors: flood() } },
      { removeVariables: flood() },
      { classes: flood() },
      { removeClasses: flood() },
    ]) {
      expect(issues(UpdateSiteStylesInput, input)).toHaveLength(1);
    }
  });
});
