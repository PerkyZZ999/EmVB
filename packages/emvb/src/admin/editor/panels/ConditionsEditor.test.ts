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
      "404 page",
      "Posts (all)",
      "? (all)",
      "One entry in Pages",
      "Posts archive",
      "Search results",
      "Category: news",
      "All tags",
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
    ).toBe("Front page · Search results · Exclude: 404 page");
  });
});

describe("Theme Builder list labels match the conditions editor (W-294)", () => {
  const one = (r: object) => summarizeConditions({ rules: [{ op: "include", ...r }] });

  test("built-in collections read as the editor names them, not by slug", () => {
    expect(one({ group: "singular", name: "collection", args: { collection: "emvb_pages" } })).toBe(
      "Visual pages (all)",
    );
    expect(
      one({ group: "singular", name: "entry", args: { collection: "emvb_pages", id: "01A" } }),
    ).toBe("One entry in Visual pages");
    expect(one({ group: "archive", name: "taxonomy", args: { taxonomy: "category" } })).toBe(
      "All categories",
    );
  });

  test("the editor's options read the same in the list", () => {
    // value → the label the conditions editor shows for it
    const options: [string, string][] = [
      ["general:entire_site", "Entire site"],
      ["singular:front", "Front page"],
      ["singular:all", "All singular"],
      ["singular:not_found", "404 page"],
      ["singular:collection:pages", "Pages (all)"],
      ["singular:collection:posts", "Posts (all)"],
      ["singular:collection:emvb_pages", "Visual pages (all)"],
      ["archive:collection:posts", "Posts archive"],
      ["archive:search", "Search results"],
      ["archive:taxonomy:category", "All categories"],
      ["archive:taxonomy:tag", "All tags"],
    ];
    for (const [value, label] of options) {
      expect(summarizeConditions({ rules: [ruleFromOption(value, "include", "x")] })).toBe(label);
    }
  });

  test("one category or tag reads with its taxonomy's name", () => {
    expect(
      one({ group: "archive", name: "taxonomy", args: { taxonomy: "category", slug: "news" } }),
    ).toBe("Category: news");
  });

  test("a collection the list doesn't know shows its slug", () => {
    expect(one({ group: "archive", name: "collection", args: { collection: "recipes" } })).toBe(
      "recipes archive",
    );
  });
});
