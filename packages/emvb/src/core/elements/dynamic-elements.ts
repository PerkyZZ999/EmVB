import type {
  LoopNode,
  SectionNode,
  PostAuthorNode,
  PostContentNode,
  PostDateNode,
  PostExcerptNode,
  PostImageNode,
  PostLinkNode,
  PostTitleNode,
} from "../schema/layout.ts";
import type { ElementDefinition } from "./definition.ts";

export const postTitle: ElementDefinition<PostTitleNode> = {
  baseCss: ".emvb-post-title{margin:0}",
  defaults: () => ({ type: "post-title", props: { level: 1 } }),
  descriptor: {
    type: "post-title",
    name: "Post Title",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      {
        key: "level",
        kind: "select",
        label: "Level",
        optional: true,
        options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `H${n}` })),
      },
    ],
  },
  // Rendered with ThemeDynamicData in renderPage (placeholder build for typing).
  build: (_node, attrs) => ({ tag: "h1", attrs, children: ["Post Title"] }),
};

export const postExcerpt: ElementDefinition<PostExcerptNode> = {
  baseCss: ".emvb-post-excerpt{margin:0}",
  defaults: () => ({ type: "post-excerpt", props: {} }),
  descriptor: {
    type: "post-excerpt",
    name: "Post Excerpt",
    group: "dynamic",
    defaultTab: "style",
    fields: [
      {
        key: "maxWords",
        kind: "int",
        label: "Excerpt length (words)",
        optional: true,
        message: "Enter a whole number of words, or leave it blank for the whole excerpt.",
      },
    ],
  },
  build: (_node, attrs) => ({ tag: "p", attrs, children: ["Post excerpt…"] }),
};

export const postContent: ElementDefinition<PostContentNode> = {
  baseCss: ".emvb-post-content{min-width:0}",
  defaults: () => ({ type: "post-content", props: {} }),
  descriptor: {
    type: "post-content",
    name: "Post Content",
    group: "dynamic",
    defaultTab: "style",
    fields: [],
  },
  build: (_node, attrs) => ({
    tag: "div",
    attrs,
    children: [{ tag: "p", attrs: {}, children: ["Post content…"] }],
  }),
};

export const postImage: ElementDefinition<PostImageNode> = {
  baseCss: ".emvb-post-image{display:block;max-width:100%;height:auto}",
  defaults: () => ({ type: "post-image", props: { decorative: false } }),
  descriptor: {
    type: "post-image",
    name: "Post Image",
    group: "dynamic",
    defaultTab: "content",
    fields: [{ key: "decorative", kind: "boolean", label: "Decorative", optional: true }],
  },
  build: (_node, attrs) => ({
    tag: "div",
    attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-post-image-missing`.trim() },
    children: ["Featured image"],
  }),
};

export const postDate: ElementDefinition<PostDateNode> = {
  baseCss: ".emvb-post-date{margin:0}",
  defaults: () => ({ type: "post-date", props: {} }),
  descriptor: {
    type: "post-date",
    name: "Post Date",
    group: "dynamic",
    defaultTab: "style",
    fields: [
      {
        key: "format",
        kind: "select",
        label: "Date format",
        optional: true,
        options: [
          { value: "medium", label: "Medium (Oct 6, 2026)" },
          { value: "short", label: "Short (10/6/26)" },
          { value: "long", label: "Long (October 6, 2026)" },
          { value: "full", label: "Full (Tuesday, October 6, 2026)" },
          { value: "numeric", label: "Numeric (2026-10-06)" },
        ],
      },
    ],
  },
  build: (_node, attrs) => ({ tag: "time", attrs, children: ["Post date"] }),
};

export const postAuthor: ElementDefinition<PostAuthorNode> = {
  baseCss: ".emvb-post-author{margin:0}",
  defaults: () => ({ type: "post-author", props: {} }),
  descriptor: {
    type: "post-author",
    name: "Post Author",
    group: "dynamic",
    defaultTab: "style",
    fields: [],
  },
  build: (_node, attrs) => ({ tag: "span", attrs, children: ["Author"] }),
};

export const postLink: ElementDefinition<PostLinkNode> = {
  baseCss: ".emvb-post-link{color:inherit}",
  defaults: () => ({ type: "post-link", props: {} }),
  descriptor: {
    type: "post-link",
    name: "Post Link",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      {
        key: "text",
        kind: "text",
        label: "Text",
        optional: true,
        message: "Leave blank to use the post title.",
      },
      { key: "newTab", kind: "boolean", label: "Open in new tab", optional: true },
    ],
  },
  build: (_node, attrs) => ({ tag: "a", attrs: { ...attrs, href: "#" }, children: ["Post link"] }),
};

export const loop: ElementDefinition<LoopNode> = {
  baseCss:
    ".emvb-loop{display:flex;flex-direction:column;min-width:0;gap:1rem}.emvb-loop[data-emvb-loop-empty]{min-height:48px;padding:12px;color:var(--text-color-kumo-subtle,#666);background:var(--color-kumo-tint,#eee)}",
  defaults: () => ({ type: "loop", props: {}, children: [] }),
  descriptor: {
    type: "loop",
    name: "Loop",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      {
        key: "itemPartId",
        kind: "text",
        label: "Loop Item",
        optional: true,
        message:
          "Optional published Loop Item theme part. Leave blank to use nested elements as the item template.",
      },
    ],
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

export const section: ElementDefinition<SectionNode> = {
  baseCss: ".emvb-section{display:flex;flex-direction:column;min-width:0}",
  defaults: () => ({ type: "section", props: {}, children: [] }),
  descriptor: {
    type: "section",
    // "Theme section": it embeds a Section theme part; the layout Section is its own element (W-155).
    name: "Theme section",
    group: "layout",
    defaultTab: "content",
    fields: [
      {
        key: "partId",
        kind: "text",
        label: "Section part",
        optional: true,
        message:
          "Optional published Section theme part. When set, the part's contents replace the nested elements on every page that uses it.",
      },
    ],
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};
