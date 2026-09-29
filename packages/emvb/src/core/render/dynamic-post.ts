import type { LayoutNode } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { portableTextToVNodes, type ThemePostFields } from "../theme/dynamic.ts";
import type { RenderMode } from "./context.ts";
import type { VNode } from "./vnode.ts";

type Attrs = Record<string, string>;

type PostField = {
  /** Shown in the editor when there is no post, or the post lacks this field; public pages show nothing. */
  placeholder: (attrs: Attrs) => VNode;
  /** Whether the post has this field; the placeholder stands in when it doesn't. */
  has?: (post: ThemePostFields) => boolean;
  /** The field's markup, or nothing when the post's value is empty or unsafe. */
  render: (node: LayoutNode, attrs: Attrs, post: ThemePostFields) => VNode | undefined;
};

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const props = <T>(node: LayoutNode) => node.props as T;

const POST_FIELDS = new Map<string, PostField>([
  [
    "post-title",
    {
      placeholder: (attrs) => ({ tag: "h1", attrs, children: ["Post Title"] }),
      render: (node, attrs, post) => {
        const level = props<{ level?: number }>(node).level ?? 1;
        const tag = HEADING_TAGS[Math.min(6, Math.max(1, level)) - 1] ?? "h1";
        return { tag, attrs, children: [post.title] };
      },
    },
  ],
  [
    "post-excerpt",
    {
      placeholder: (attrs) => ({ tag: "p", attrs, children: ["Post excerpt…"] }),
      render: (_node, attrs, post) =>
        post.excerpt ? { tag: "p", attrs, children: [post.excerpt] } : undefined,
    },
  ],
  [
    "post-content",
    {
      placeholder: (attrs) => ({
        tag: "div",
        attrs,
        children: [{ tag: "p", attrs: {}, children: ["Post content…"] }],
      }),
      render: (_node, attrs, post) => {
        const blocks = portableTextToVNodes(post.content);
        return blocks.length > 0 ? { tag: "div", attrs, children: blocks } : undefined;
      },
    },
  ],
  [
    "post-image",
    {
      placeholder: (attrs) => ({
        tag: "div",
        attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-post-image-missing`.trim() },
        children: ["Featured image"],
      }),
      has: (post) => !!post.featuredImageUrl,
      render: (node, attrs, post) => {
        const src = sanitizeMediaUrl(post.featuredImageUrl ?? "");
        if (!src) return undefined;
        const alt = props<{ decorative?: boolean }>(node).decorative
          ? ""
          : post.featuredImageAlt?.trim() || post.title || "Featured image";
        return { tag: "img", attrs: { ...attrs, src, alt }, children: [] };
      },
    },
  ],
  [
    "post-link",
    {
      placeholder: (attrs) => ({
        tag: "a",
        attrs: { ...attrs, href: "#" },
        children: ["Post link"],
      }),
      render: (node, attrs, post) => {
        const href = sanitizeHref(post.permalink);
        if (!href) return undefined;
        const { text, newTab } = props<{ text?: string; newTab?: boolean }>(node);
        const linkAttrs: Attrs = { ...attrs, href };
        if (newTab) {
          linkAttrs.target = "_blank";
          linkAttrs.rel = "noopener noreferrer";
        }
        return {
          tag: "a",
          attrs: linkAttrs,
          children: [text?.trim() || post.title || post.permalink],
        };
      },
    },
  ],
]);

export const isDynamicPostNode = (node: LayoutNode) => POST_FIELDS.has(node.type);

/** A post field element: the post's value publicly, a placeholder in the editor when there is no post. */
export function renderDynamicPost(
  node: LayoutNode,
  attrs: Attrs,
  post: ThemePostFields | undefined,
  mode: RenderMode,
): VNode | undefined {
  const field = POST_FIELDS.get(node.type);
  if (!field) return undefined;
  if (!post || field.has?.(post) === false) {
    return mode === "editor" ? field.placeholder(attrs) : undefined;
  }
  return field.render(node, attrs, post);
}
