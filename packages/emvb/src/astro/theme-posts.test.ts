import { describe, expect, test } from "bun:test";
import { mediaFieldsFrom, themePostFromEntry } from "./theme-posts.ts";

describe("themePostFromEntry", () => {
  test("maps EmDash entry data to ThemePostFields", () => {
    const post = themePostFromEntry({
      id: "welcome",
      data: {
        id: "01WELCOME",
        slug: "welcome",
        title: "Welcome",
        excerpt: "Hi",
        content: [{ _type: "block", style: "normal", children: [{ text: "Body" }] }],
        featured_image: { id: "m1", src: "/media/hero.jpg", alt: "Hero" },
      },
    });
    expect(post).toMatchObject({
      id: "01WELCOME",
      slug: "welcome",
      title: "Welcome",
      excerpt: "Hi",
      permalink: "/posts/welcome",
      featuredImageUrl: "/media/hero.jpg",
      featuredImageAlt: "Hero",
    });
  });

  test("W-303: EmDash's publishedAt Date becomes an ISO publish date", () => {
    const post = themePostFromEntry({
      id: "welcome",
      data: { id: "01WELCOME", slug: "welcome", publishedAt: new Date("2026-09-06T12:00:00Z") },
    });
    expect(post?.publishedAt).toBe("2026-09-06T12:00:00.000Z");
    // A text date field still wins, and an invalid Date is no date.
    expect(
      themePostFromEntry({ slug: "a", published_at: "2026-01-02", publishedAt: new Date(0) })
        ?.publishedAt,
    ).toBe("2026-01-02");
    expect(themePostFromEntry({ slug: "a", publishedAt: new Date("nope") })?.publishedAt).toBe(
      undefined,
    );
  });

  test("a plain data bag with missing fields gets empty text and the given permalink prefix", () => {
    expect(themePostFromEntry({ slug: "hello", title: 5 }, { permalinkPrefix: "/blog/" })).toEqual({
      id: "hello",
      slug: "hello",
      title: "",
      excerpt: "",
      content: "",
      permalink: "/blog/hello",
    });
  });

  test("an entry with neither id nor slug is not a post", () => {
    expect(themePostFromEntry({ data: { title: "Orphan" } })).toBeNull();
  });

  test("mediaFieldsFrom skips blank URLs, trims, and drops a blank alt", () => {
    expect(mediaFieldsFrom({ src: "  ", url: "", previewUrl: " /p.jpg ", alt: "   " })).toEqual({
      featuredImageUrl: "/p.jpg",
      featuredImageAlt: undefined,
    });
    expect(mediaFieldsFrom("/raw.jpg")).toEqual({});
  });

  test("mediaFieldsFrom prefers src then url", () => {
    expect(mediaFieldsFrom({ url: "https://cdn.example/a.jpg" }).featuredImageUrl).toBe(
      "https://cdn.example/a.jpg",
    );
    expect(mediaFieldsFrom({ src: "/a.jpg", url: "/b.jpg" }).featuredImageUrl).toBe("/a.jpg");
  });
});
