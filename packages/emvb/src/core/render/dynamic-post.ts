import type { LayoutNode } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { portableTextToVNodes, type ThemePostFields } from "../theme/dynamic.ts";
import type { RenderMode } from "./context.ts";
import type { VNode } from "./vnode.ts";

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const DYNAMIC_POST_TYPES = new Set([
  "post-title",
  "post-excerpt",
  "post-content",
  "post-image",
  "post-link",
]);

export const isDynamicPostNode = (node: LayoutNode) => DYNAMIC_POST_TYPES.has(node.type);

/** A post field element: the post's value publicly, a placeholder in the editor when there is no post. */
export function renderDynamicPost(
  node: LayoutNode,
  attrs: Record<string, string>,
  post: ThemePostFields | undefined,
  mode: RenderMode,
): VNode | undefined {
  if (node.type === "post-title") {
    if (!post)
      return mode === "editor" ? { tag: "h1", attrs, children: ["Post Title"] } : undefined;
    const level = (node.props as { level?: number }).level ?? 1;
    const tag = HEADING_TAGS[Math.min(6, Math.max(1, level)) - 1] ?? "h1";
    return { tag, attrs, children: [post.title] };
  }
  if (node.type === "post-excerpt") {
    if (!post) {
      return mode === "editor" ? { tag: "p", attrs, children: ["Post excerpt…"] } : undefined;
    }
    if (!post.excerpt) return undefined;
    return { tag: "p", attrs, children: [post.excerpt] };
  }
  if (node.type === "post-content") {
    if (!post) {
      return mode === "editor"
        ? {
            tag: "div",
            attrs,
            children: [{ tag: "p", attrs: {}, children: ["Post content…"] }],
          }
        : undefined;
    }
    const blocks = portableTextToVNodes(post.content);
    if (blocks.length === 0) return undefined;
    return { tag: "div", attrs, children: blocks };
  }
  if (node.type === "post-image") {
    if (!post?.featuredImageUrl) {
      return mode === "editor"
        ? {
            tag: "div",
            attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-post-image-missing`.trim() },
            children: ["Featured image"],
          }
        : undefined;
    }
    const src = sanitizeMediaUrl(post.featuredImageUrl);
    if (!src) return undefined;
    const decorative = (node.props as { decorative?: boolean }).decorative === true;
    const imgAttrs: Record<string, string> = { ...attrs, src };
    if (decorative) imgAttrs["alt"] = "";
    else imgAttrs["alt"] = post.featuredImageAlt?.trim() || post.title || "Featured image";
    return { tag: "img", attrs: imgAttrs, children: [] };
  }
  if (node.type === "post-link") {
    if (!post) {
      return mode === "editor"
        ? { tag: "a", attrs: { ...attrs, href: "#" }, children: ["Post link"] }
        : undefined;
    }
    const href = sanitizeHref(post.permalink);
    if (!href) return undefined;
    const label = (node.props as { text?: string }).text?.trim() || post.title || post.permalink;
    const linkAttrs: Record<string, string> = { ...attrs, href };
    if ((node.props as { newTab?: boolean }).newTab) {
      linkAttrs.target = "_blank";
      linkAttrs.rel = "noopener noreferrer";
    }
    return { tag: "a", attrs: linkAttrs, children: [label] };
  }
  return undefined;
}
