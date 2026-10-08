import type { ArchivePagination } from "./pagination.ts";
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
  /** ISO date or a display string from the post. */
  publishedAt?: string;
  authorName?: string;
};

/** Data passed into `renderPage` when resolving Single Post / Archive / Loop Item. */
export type ThemeDynamicData = {
  post?: ThemePostFields;
  posts?: ThemePostFields[];
  /** Published Loop Item layouts keyed by theme-part entry id. */
  loopTemplates?: Record<string, Layout>;
  /** Published Section layouts keyed by theme-part entry id. */
  sectionTemplates?: Record<string, Layout>;
  /** Section part ids already being expanded, so a section cannot include itself. */
  sectionStack?: readonly string[];
  /**
   * Where the nodes being rendered come from (W-250): unset for the page itself, else the synced
   * section and loop item parts they were expanded from. Another layout can reuse an id.
   */
  idOrigin?: string;
  archiveTitle?: string;
  /** Which archive page is showing, for the Pagination element (W-221). */
  pagination?: ArchivePagination;
  /** Set inside a Loop's item, where a Pagination would repeat once per post (W-228). */
  inLoopItem?: boolean;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const spanText = (children: unknown) =>
  Array.isArray(children)
    ? children
        .filter(isRecord)
        .map((span) => (typeof span["text"] === "string" ? span["text"] : ""))
        .join("")
    : "";

const HEADING_STYLES = new Set(["h1", "h2", "h3", "h4"]);

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
  return value.flatMap((block): VNode[] => {
    if (!isRecord(block) || block["_type"] !== "block") return [];
    const text = spanText(block["children"]).trim();
    if (!text) return [];
    const style = block["style"];
    const tag = typeof style === "string" && HEADING_STYLES.has(style) ? style : "p";
    return [{ tag, attrs: {}, children: [text] }];
  });
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

/** Collect `section.partId` values so hosts can load Section templates. */
export function collectSectionPartIds(layout: Layout): string[] {
  const ids = new Set<string>();
  const walk = (node: LayoutNode): void => {
    if (node.type === "section") {
      const id =
        typeof (node.props as { partId?: unknown }).partId === "string"
          ? (node.props as { partId: string }).partId.trim()
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
