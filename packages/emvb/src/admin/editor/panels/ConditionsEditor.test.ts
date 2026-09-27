import { describe, expect, test } from "bun:test";
import { summarizeConditions } from "../../theme-api.ts";
import { optionValue, ruleFromOption } from "./ConditionsEditor.tsx";

describe("ConditionsEditor helpers", () => {
  test("round-trips entire site and collection options", () => {
    const entire = ruleFromOption("general:entire_site", "include", "a");
    expect(optionValue(entire)).toBe("general:entire_site");
    const posts = ruleFromOption("singular:collection:posts", "exclude", "b");
    expect(posts).toMatchObject({
      op: "exclude",
      group: "singular",
      name: "collection",
      args: { collection: "posts" },
    });
    expect(optionValue(posts)).toBe("singular:collection:posts");
  });
});

describe("summarizeConditions", () => {
  test("summarizes entire site and excludes", () => {
    expect(
      summarizeConditions({
        schemaVersion: 1,
        rules: [
          { id: "1", op: "include", group: "general", name: "entire_site", args: {} },
          { id: "2", op: "exclude", group: "singular", name: "front", args: {} },
        ],
      }),
    ).toBe("Entire site · Exclude: Front page");
  });
});
