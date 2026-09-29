import { describe, expect, test } from "bun:test";
import golden from "../../../test/fixtures/dynamic-post-golden.json";
import type { LayoutNode } from "../schema/layout.ts";
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
