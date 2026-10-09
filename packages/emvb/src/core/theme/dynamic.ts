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
  /**
   * The entry's other plain fields (text, numbers, true/false) by field name, for data bindings
   * (W-307): a Loop over a Team collection binds a heading to `role`.
   */
  fields?: Readonly<Record<string, string | number | boolean>>;
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
  /** Entries for collection Loops (W-308), keyed by the Loop's node id. Hosts fill this. */
  collections?: Readonly<Record<string, ThemePostFields[]>>;
  /** Site settings bound fields can read (W-307), e.g. `title`, `tagline`, `url`. */
  site?: Readonly<Record<string, string>>;
  /** The request's URL parameters, first value per name (W-307). */
  params?: Readonly<Record<string, string>>;
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

/** A Loop that lists a collection (W-308): what hosts fetch for it. */
export type CollectionLoop = {
  nodeId: string;
  collection: string;
  limit: number;
  order: "newest" | "oldest" | "title";
};

/** Every collection Loop in a layout, so hosts can fetch their entries (W-308). */
export function collectCollectionLoops(layout: Layout): CollectionLoop[] {
  const loops: CollectionLoop[] = [];
  const walk = (node: LayoutNode): void => {
    if (node.type === "loop" && loops.length < 20) {
      const props = node.props as { collection?: unknown; limit?: unknown; order?: unknown };
      if (typeof props.collection === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(props.collection)) {
        const limit =
          typeof props.limit === "number" && props.limit >= 1 && props.limit <= 50
            ? Math.floor(props.limit)
            : 6;
        const order = props.order === "oldest" || props.order === "title" ? props.order : "newest";
        loops.push({ nodeId: node.id, collection: props.collection, limit, order });
      }
    }
    if (isParentNode(node)) {
      for (const child of node.children) walk(child);
    }
  };
  walk(layout.root);
  return loops;
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
