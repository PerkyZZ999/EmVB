import { describe, expect, test } from "bun:test";
import {
  themeContext404,
  themeContextFrom,
  themeContextFront,
  themeContextSearch,
} from "./theme-context.ts";

describe("themeContextFrom", () => {
  test("front page", () => {
    expect(themeContextFrom(new URL("https://example.com/"))).toMatchObject({
      isFront: true,
      kind: "singular",
    });
  });

  test("posts archive and singular", () => {
    expect(themeContextFrom(new URL("https://example.com/posts"))).toMatchObject({
      kind: "archive",
      collection: "posts",
    });
    expect(
      themeContextFrom(new URL("https://example.com/posts/hello"), {
        content: { collection: "posts", id: "01A" },
      }),
    ).toMatchObject({ kind: "singular", collection: "posts", entryId: "01A" });
  });

  test("category and tag archives", () => {
    expect(themeContextFrom(new URL("https://example.com/category/news"))).toMatchObject({
      kind: "archive",
      taxonomy: { type: "category", slug: "news" },
    });
    expect(themeContextFrom(new URL("https://example.com/tag/js"))).toMatchObject({
      taxonomy: { type: "tag", slug: "js" },
    });
  });

  test("404 helper", () => {
    expect(themeContext404()).toMatchObject({ is404: true });
    expect(themeContextFront()).toMatchObject({ isFront: true });
  });
});

test("search path and helper", () => {
  expect(themeContextFrom(new URL("https://example.com/search"))).toMatchObject({
    isSearch: true,
    kind: "archive",
  });
  expect(themeContextSearch()).toMatchObject({ isSearch: true, kind: "archive" });
});
