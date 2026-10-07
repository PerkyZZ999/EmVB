import { describe, expect, test } from "bun:test";
import golden from "../../../test/fixtures/dynamic-post-golden.json";
import { PostDateNode, PostExcerptNode, type LayoutNode } from "../schema/layout.ts";
import type { ThemePostFields } from "../theme/dynamic.ts";
import { renderDynamicPost } from "./dynamic-post.ts";
import { serialize } from "./vnode.ts";

const post: ThemePostFields = {
  id: "01POST",
  slug: "welcome",
  title: "Welcome",
  excerpt: "Short",
  content: [{ _type: "block", style: "normal", children: [{ _type: "span", text: "Body" }] }],
  featuredImageUrl: "https://example.com/hero.jpg",
  featuredImageAlt: "Hero",
  permalink: "/posts/welcome",
};

const posts: Record<string, ThemePostFields | undefined> = {
  post,
  bare: {
    ...post,
    excerpt: "",
    content: [],
    featuredImageUrl: undefined,
    featuredImageAlt: undefined,
  },
  unsafe: {
    ...post,
    featuredImageUrl: "javascript:alert(1)",
    permalink: "javascript:alert(1)",
    featuredImageAlt: "  ",
  },
  none: undefined,
};

// Golden rows cover every post field against a full post, an empty one, unsafe URLs and no
// post, in both modes, plus the heading-level clamp, decorative images and link options.
describe("post field elements (golden)", () => {
  for (const row of golden) {
    test(`${row.type} ${JSON.stringify(row.props)} with ${row.post} post, ${row.mode}`, () => {
      const node = { id: "node0001", type: row.type, props: row.props } as LayoutNode;
      const vnode = renderDynamicPost(
        node,
        { class: "c" },
        posts[row.post],
        row.mode as "public" | "editor",
      );
      expect(vnode ? serialize(vnode) : null).toBe(row.html);
    });
  }
});

describe("Post Date format and Post Excerpt length (W-177)", () => {
  const html = (type: string, props: Record<string, unknown>, fields: Partial<ThemePostFields>) => {
    const node = { id: "node0001", type, props } as LayoutNode;
    const vnode = renderDynamicPost(node, {}, { ...post, ...fields }, "public");
    return vnode ? serialize(vnode) : null;
  };

  test("a Post Date reads in the chosen format, in UTC; unset stays medium", () => {
    const at = { publishedAt: "2026-10-06T23:30:00.000Z" };
    const dates = [undefined, "short", "long", "full", "numeric"].map(
      (format) => html("post-date", format ? { format } : {}, at)?.match(/>([^<]*)</)?.[1],
    );
    expect(dates).toEqual([
      "Oct 6, 2026",
      "10/6/26",
      "October 6, 2026",
      "Tuesday, October 6, 2026",
      "2026-10-06",
    ]);
    expect(html("post-date", { format: "long" }, at)).toContain(
      'datetime="2026-10-06T23:30:00.000Z"',
    );
  });

  test("a date that can't be read shows as text with no datetime (W-196)", () => {
    expect(html("post-date", {}, { publishedAt: "Spring 2026" })).toBe("<time>Spring 2026</time>");
    expect(html("post-date", {}, { publishedAt: "2026-02-30" })).toBe("<time>2026-02-30</time>");
    expect(html("post-date", {}, { publishedAt: "2026-10-06 12:00" })).toBe(
      '<time datetime="2026-10-06 12:00">Oct 6, 2026</time>',
    );
  });

  test("a Post Excerpt is cut to its word count with an ellipsis, and a short one is kept", () => {
    const excerpt = { excerpt: "One two  three\nfour five" };
    expect(html("post-excerpt", { maxWords: 3 }, excerpt)).toBe("<p>One two three…</p>");
    expect(html("post-excerpt", { maxWords: 5 }, excerpt)).toBe("<p>One two  three\nfour five</p>");
    expect(html("post-excerpt", {}, excerpt)).toBe("<p>One two  three\nfour five</p>");
  });

  test("the settings are optional props the schema checks", () => {
    const parse = (type: string, props: Record<string, unknown>) =>
      (type === "post-date" ? PostDateNode : PostExcerptNode).safeParse({
        id: "node0001",
        type,
        props,
      }).success;
    expect(parse("post-date", { format: "full" })).toBe(true);
    expect(parse("post-date", { format: "relative" })).toBe(false);
    expect(parse("post-excerpt", { maxWords: 30 })).toBe(true);
    expect(parse("post-excerpt", { maxWords: 0 })).toBe(false);
    expect(parse("post-excerpt", { maxWords: 2.5 })).toBe(false);
  });
});
