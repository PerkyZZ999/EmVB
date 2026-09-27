import type { Layout, LayoutNode } from "../schema/layout.ts";
import { isParentNode } from "../schema/layout.ts";
import type { VNode } from "../render/vnode.ts";

/** Normalized post fields for server-side theme binding (framework-free). */
export type ThemePostFields = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Portable Text JSON, plain string, or already-normalized blocks. */
  content: unknown;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
  /** Public path, e.g. `/posts/welcome`. */
  permalink: string;
};

/** Data passed into `renderPage` when resolving Single Post / Archive / Loop Item. */
export type ThemeDynamicData = {
  post?: ThemePostFields;
  posts?: ThemePostFields[];
  /** Published Loop Item layouts keyed by theme-part entry id. */
  loopTemplates?: Record<string, Layout>;
  archiveTitle?: string;
};

/** Editor canvas placeholders when no live post is bound. */
export const SAMPLE_POST: ThemePostFields = {
  id: "sample",
  slug: "sample",
  title: "Post Title",
  excerpt: "Post excerpt…",
  content: "Post content…",
  permalink: "#",
  featuredImageAlt: "Featured image",
};

function spanText(children: unknown): string {
  if (!Array.isArray(children)) return "";
  const parts: string[] = [];
  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const span = child as Record<string, unknown>;
    if (typeof span.text === "string") parts.push(span.text);
  }
  return parts.join("");
}

/**
 * Convert Portable Text (or a plain string) into safe VNodes.
 * Marks are flattened to escaped text; only block structure is preserved.
 */
export function portableTextToVNodes(value: unknown): VNode[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [{ tag: "p", attrs: {}, children: [trimmed] }] : [];
  }
  if (!Array.isArray(value)) return [];
  const out: VNode[] = [];
  for (const block of value) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b["_type"] !== "block") continue;
    const text = spanText(b.children).trim();
    if (!text) continue;
    const style = typeof b.style === "string" ? b.style : "normal";
    const tag =
      style === "h1"
        ? "h1"
        : style === "h2"
          ? "h2"
          : style === "h3"
            ? "h3"
            : style === "h4"
              ? "h4"
              : "p";
    out.push({ tag, attrs: {}, children: [text] });
  }
  return out;
}

/** Collect `loop.itemPartId` values so hosts can load Loop Item templates. */
export function collectLoopItemPartIds(layout: Layout): string[] {
  const ids = new Set<string>();
  const walk = (node: LayoutNode): void => {
    if (node.type === "loop") {
      const id =
        typeof (node.props as { itemPartId?: unknown }).itemPartId === "string"
          ? (node.props as { itemPartId: string }).itemPartId.trim()
          : "";
      if (id) ids.add(id);
    }
    if (isParentNode(node)) {
      for (const child of node.children) walk(child);
    }
  };
  walk(layout.root);
  return [...ids];
}

export function resolvePostForRender(
  dynamic: ThemeDynamicData | undefined,
  mode: "public" | "editor",
): ThemePostFields | undefined {
  if (dynamic?.post) return dynamic.post;
  if (mode === "editor") return SAMPLE_POST;
  return undefined;
}

export function resolvePostsForLoop(
  dynamic: ThemeDynamicData | undefined,
  mode: "public" | "editor",
): ThemePostFields[] {
  if (dynamic?.posts && dynamic.posts.length > 0) return dynamic.posts;
  if (mode === "editor") return [SAMPLE_POST];
  return [];
}
