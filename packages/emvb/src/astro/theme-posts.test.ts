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

  test("mediaFieldsFrom prefers src then url", () => {
    expect(mediaFieldsFrom({ url: "https://cdn.example/a.jpg" }).featuredImageUrl).toBe(
      "https://cdn.example/a.jpg",
    );
    expect(mediaFieldsFrom({ src: "/a.jpg", url: "/b.jpg" }).featuredImageUrl).toBe("/a.jpg");
  });
});
