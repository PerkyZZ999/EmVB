import type {
  LoopEmptyNode,
  LoopNode,
  SectionNode,
  PostAuthorNode,
  PostContentNode,
  PostDateNode,
  PostExcerptNode,
  PostImageNode,
  PostLinkNode,
  PostTitleNode,
  PaginationNode,
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

/** How a Loop shows its items (W-308). */
const DISPLAY_OPTIONS = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
  { value: "cards", label: "Cards" },
];

export const loop: ElementDefinition<LoopNode> = {
  baseCss:
    ".emvb-loop{display:flex;flex-direction:column;min-width:0;gap:1rem}.emvb-loop[data-emvb-loop-empty]{min-height:48px;padding:12px;color:var(--text-color-kumo-subtle,#666);background:var(--color-kumo-tint,#eee)}" +
    // W-308: grid and cards share one item design; phones get one column.
    ".emvb-loop-grid,.emvb-loop-cards{display:grid;grid-template-columns:repeat(var(--emvb-loop-columns,3),minmax(0,1fr))}" +
    ".emvb-loop-cards>.emvb-loop-item{padding:1rem;border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 3%,transparent)}" +
    ".emvb-loop-grid>.emvb-loop-empty,.emvb-loop-cards>.emvb-loop-empty{grid-column:1/-1}" +
    "@media (max-width: 767px){.emvb-loop-grid,.emvb-loop-cards{grid-template-columns:minmax(0,1fr)}}",
  defaults: () => ({ type: "loop", props: {}, children: [] }),
  descriptor: {
    type: "loop",
    name: "Loop",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      {
        key: "collection",
        kind: "text",
        label: "Collection",
        optional: true,
        message:
          "A collection's slug, such as posts or team, lists its entries on any page. Leave it empty on an Archive part to list the archive's posts.",
      },
      {
        key: "display",
        kind: "select",
        label: "Show as",
        optional: true,
        options: DISPLAY_OPTIONS,
      },
      {
        key: "columns",
        kind: "int",
        max: 6,
        label: "Columns",
        optional: true,
        message: "1 to 6 columns for Grid and Cards (one on phones). Leave it empty for 3.",
      },
      {
        key: "limit",
        kind: "int",
        max: 50,
        label: "Entries to show",
        optional: true,
        message: "1 to 50 entries from the collection. Leave it empty for 6.",
      },
      {
        key: "order",
        kind: "select",
        label: "Order",
        optional: true,
        options: [
          { value: "newest", label: "Newest first" },
          { value: "oldest", label: "Oldest first" },
          { value: "title", label: "By title" },
        ],
      },
      {
        key: "permalink",
        kind: "text",
        label: "Link pattern",
        optional: true,
        message:
          "Where each entry links, e.g. /team/{slug}; {slug} and {id} are filled in. Leave it empty for /collection/{slug}.",
      },
      {
        key: "imageField",
        kind: "text",
        label: "Image field",
        optional: true,
        message: "The field Post Image shows, e.g. photo. Leave it empty for the featured image.",
      },
      {
        key: "excerptField",
        kind: "text",
        label: "Excerpt field",
        optional: true,
        message: "The field Post Excerpt shows, e.g. role. Leave it empty for the excerpt.",
      },
      {
        key: "filter",
        kind: "text",
        label: "Only entries where",
        optional: true,
        message:
          "field=value pairs separated by ;, e.g. category=news; team=design. A taxonomy works too. The same field twice matches either value.",
      },
      {
        key: "itemPartId",
        kind: "text",
        label: "Loop Item",
        optional: true,
        message:
          "Optional published Loop Item theme part. Leave blank to use nested elements as the item template.",
      },
      {
        key: "perPage",
        kind: "int",
        max: 50,
        label: "Posts per page",
        optional: true,
        message:
          "1 to 50 posts on each archive page. Leave it empty for 20. Add a Pagination element to link the pages.",
      },
    ],
  },
  build: (node, attrs, children) => {
    const display = node.props.display;
    const extra = display === "grid" || display === "cards" ? ` emvb-loop-${display}` : "";
    return {
      tag: "div",
      attrs: { ...attrs, class: `${attrs.class ?? ""}${extra}`.trim() },
      children,
    };
  },
};

export const loopEmpty: ElementDefinition<LoopEmptyNode> = {
  baseCss: ".emvb-loop-empty{display:flex;flex-direction:column;min-width:0;gap:.5rem}",
  defaults: () => ({ type: "loop-empty", props: {}, children: [] }),
  descriptor: {
    type: "loop-empty",
    name: "Empty state",
    group: "dynamic",
    defaultTab: "style",
    fields: [],
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

export const pagination: ElementDefinition<PaginationNode> = {
  baseCss:
    ".emvb-pagination{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}.emvb-pagination a{color:inherit}.emvb-pagination a[aria-current=page]{font-weight:700;text-decoration:none}.emvb-pagination-count{opacity:.75}",
  defaults: () => ({ type: "pagination", props: {} }),
  descriptor: {
    type: "pagination",
    name: "Pagination",
    group: "dynamic",
    defaultTab: "content",
    fields: [
      { key: "prevText", kind: "text", label: "Previous text", optional: true },
      { key: "nextText", kind: "text", label: "Next text", optional: true },
      { key: "showCount", kind: "boolean", label: "Show page count", optional: true },
      {
        key: "countText",
        kind: "text",
        label: "Count text",
        optional: true,
        message:
          '{page} and {total} are filled in. EmDash 1.2 doesn\'t report a total, so the count shows "Page N" until it does.',
      },
    ],
  },
  // Rendered by core/render/pagination.ts from the archive's page data (W-222).
  build: (_node, attrs) => ({ tag: "nav", attrs, children: [] }),
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
