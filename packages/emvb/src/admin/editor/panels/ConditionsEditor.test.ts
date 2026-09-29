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

  test("round-trips search results option", () => {
    const search = ruleFromOption("archive:search", "include", "s");
    expect(search).toMatchObject({ group: "archive", name: "search" });
    expect(optionValue(search)).toBe("archive:search");
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

  test("summarizes search results include", () => {
    expect(
      summarizeConditions({
        schemaVersion: 1,
        rules: [{ id: "1", op: "include", group: "archive", name: "search", args: {} }],
      }),
    ).toBe("Search results");
  });

  test("labels every rule kind, with its arguments, and falls back to group/name", () => {
    const rule = (group: string, name: string, args: Record<string, unknown> = {}) => ({
      op: "include",
      group,
      name,
      args,
    });
    const label = (r: ReturnType<typeof rule>) => summarizeConditions({ rules: [r] });
    expect(
      [
        rule("general", "entire_site"),
        rule("singular", "front"),
        rule("singular", "not_found"),
        rule("singular", "collection", { collection: "posts" }),
        rule("singular", "collection"),
        rule("singular", "entry", { collection: "pages" }),
        rule("archive", "collection", { collection: "posts" }),
        rule("archive", "search"),
        rule("archive", "taxonomy", { taxonomy: "category", slug: "news" }),
        rule("archive", "taxonomy", { taxonomy: "tag" }),
        rule("archive", "taxonomy"),
        rule("singular", "all"),
        rule("archive", "all"),
        rule("general", "entry"),
        { op: "include" } as ReturnType<typeof rule>,
      ].map(label),
    ).toEqual([
      "Entire site",
      "Front page",
      "404",
      "Singular: posts",
      "Singular: ?",
      "Entry in pages",
      "Archive: posts",
      "Search results",
      "category:news",
      "All tag",
      "All ?",
      "All singular",
      "All archives",
      "general/entry",
      "?/?",
    ]);
  });

  test("invalid, empty and mixed condition docs", () => {
    expect(summarizeConditions("{not json")).toBe("Invalid conditions");
    expect(summarizeConditions(null)).toBe("No conditions");
    expect(summarizeConditions({ rules: [] })).toBe("No conditions");
    expect(summarizeConditions({ rules: [{ op: "other", group: "archive", name: "all" }] })).toBe(
      "No conditions",
    );
    expect(
      summarizeConditions(
        JSON.stringify({
          rules: [
            { op: "include", group: "singular", name: "front" },
            { op: "include", group: "archive", name: "search" },
            { op: "exclude", group: "singular", name: "not_found" },
          ],
        }),
      ),
    ).toBe("Front page · Search results · Exclude: 404");
  });
});
