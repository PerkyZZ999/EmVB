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

describe("malformed percent-escapes (W-305)", () => {
  test("a malformed category or tag slug is looked up as written instead of throwing", () => {
    expect(themeContextFrom(new URL("https://example.com/category/%E0%A4%A"))).toMatchObject({
      kind: "archive",
      taxonomy: { type: "category", slug: "%E0%A4%A" },
    });
    expect(themeContextFrom(new URL("https://example.com/tag/50%"))).toMatchObject({
      taxonomy: { type: "tag", slug: "50%" },
    });
    expect(themeContextFrom(new URL("https://example.com/tag/caf%C3%A9")).taxonomy?.slug).toBe(
      "café",
    );
  });
});

describe("archive pages (W-221)", () => {
  const ctx = (path: string) => themeContextFrom(new URL(`http://site.test${path}`));
  test("/page/N is that page of the archive; conditions see the archive path", () => {
    expect(ctx("/posts/page/3")).toMatchObject({ kind: "archive", path: "/posts", page: 3 });
    expect(ctx("/category/news/page/2")).toMatchObject({
      path: "/category/news",
      page: 2,
      taxonomy: { type: "category", slug: "news" },
    });
    expect(ctx("/posts/page/1")).toMatchObject({ path: "/posts", page: 1 });
    expect(ctx("/posts").page).toBeUndefined();
  });
  test("a bad page number is not an archive", () => {
    expect(ctx("/posts/page/0").kind).toBe("other");
    expect(ctx("/posts/page/abc").kind).toBe("other");
  });
});
