import type { VisitorInfo } from "../audience/rules.ts";
import type { ArchivePagination } from "./pagination.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { isParentNode, LOOP_FILTER, LOOP_PERMALINK } from "../schema/layout.ts";

const FIELD_SLUG = /^[a-z][a-z0-9_]{0,63}$/;
import type { VNode } from "../render/vnode.ts";
import { sanitizeHref } from "../sanitize/href.ts";

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
  /** What the host knows about the visitor, for visitor-aware elements (W-313). */
  visitor?: VisitorInfo;
  /** The visitor's arm per A/B test (W-312); hosts pick it on the server. */
  abArms?: Readonly<Record<string, "a" | "b">>;
  /** Entries for collection Loops (W-308), keyed by the Loop's node id. Hosts fill this. */
  collections?: Readonly<Record<string, ThemePostFields[]>>;
  /** Site settings bound fields can read (W-307), e.g. `title`, `tagline`, `url`. */
  site?: Readonly<Record<string, string>>;
  /** The request's URL parameters, first value per name (W-307). */
  params?: Readonly<Record<string, string>>;
  /** The page's own origin, e.g. `https://example.com`: URL-parameter links stay on it (W-307). */
  origin?: string;
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

const BLOCK_STYLES = new Set(["normal", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]);
/** Portable Text decorators kept as their HTML element (W-328). */
const DECORATORS: Record<string, string> = {
  strong: "strong",
  em: "em",
  code: "code",
  underline: "u",
  "strike-through": "s",
};
const MAX_LIST_DEPTH = 6;

/** The links a block defines (`markDefs`), by key, with hrefs that pass the link check. */
function linkDefs(block: Record<string, unknown>): Map<string, string> {
  const links = new Map<string, string>();
  const defs = Array.isArray(block["markDefs"]) ? block["markDefs"] : [];
  for (const def of defs) {
    if (!isRecord(def) || def["_type"] !== "link" || typeof def["_key"] !== "string") continue;
    const href = typeof def["href"] === "string" ? sanitizeHref(def["href"]) : undefined;
    if (href) links.set(def["_key"], href);
  }
  return links;
}

/** A span's text wrapped in its marks; unknown marks and unsafe links leave plain text. */
function spanNode(
  span: Record<string, unknown>,
  links: Map<string, string>,
): VNode | string | null {
  const text = typeof span["text"] === "string" ? span["text"] : "";
  if (!text) return null;
  const marks = Array.isArray(span["marks"])
    ? span["marks"].filter((m) => typeof m === "string")
    : [];
  let node: VNode | string = text;
  for (const mark of marks.toReversed()) {
    const tag = DECORATORS[mark];
    if (tag) node = { tag, attrs: {}, children: [node] };
    else {
      const href = links.get(mark);
      if (href) node = { tag: "a", attrs: { href }, children: [node] };
    }
  }
  return node;
}

/** A block's spans, with line breaks kept as `<br>`. */
function inlineNodes(block: Record<string, unknown>): (VNode | string)[] {
  const links = linkDefs(block);
  const children = Array.isArray(block["children"]) ? block["children"] : [];
  const out: (VNode | string)[] = [];
  for (const child of children) {
    if (!isRecord(child) || (child["_type"] !== undefined && child["_type"] !== "span")) continue;
    const node = spanNode(child, links);
    if (node === null) continue;
    if (typeof node === "string" && node.includes("\n")) {
      node.split("\n").forEach((part, i) => {
        if (i > 0) out.push({ tag: "br", attrs: {}, children: [] });
        if (part) out.push(part);
      });
    } else out.push(node);
  }
  return out;
}

/** Adjacent text joined, and the block's outer whitespace trimmed, as before W-328. */
function tidy(nodes: (VNode | string)[]): (VNode | string)[] {
  const out: (VNode | string)[] = [];
  for (const node of nodes) {
    const last = out.at(-1);
    if (typeof node === "string" && typeof last === "string") out[out.length - 1] = last + node;
    else out.push(node);
  }
  const first = out[0];
  if (typeof first === "string") out[0] = first.trimStart();
  const end = out.at(-1);
  if (typeof end === "string") out[out.length - 1] = end.trimEnd();
  return out.filter((node) => node !== "");
}

const hasText = (nodes: readonly (VNode | string)[]): boolean =>
  nodes.some((n) => (typeof n === "string" ? n.trim() !== "" : hasText(n.children)));

/**
 * Convert Portable Text (or a plain string) into safe VNodes (W-328). Kept: paragraphs, headings
 * (h1–h6), block quotes, bulleted and numbered lists (nested by level), bold, italic, code,
 * underline, strike-through and links whose href passes the link check. Everything else (custom
 * blocks, images, embeds, raw HTML) is left out; text is always escaped by the serializer.
 */
export function portableTextToVNodes(value: unknown): VNode[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [{ tag: "p", attrs: {}, children: [trimmed] }] : [];
  }
  if (!Array.isArray(value)) return [];
  const out: VNode[] = [];
  // The open lists, outermost first, while consecutive list items continue them.
  let lists: VNode[] = [];
  for (const block of value) {
    if (!isRecord(block) || block["_type"] !== "block") {
      lists = [];
      continue;
    }
    const inline = tidy(inlineNodes(block));
    const listItem = block["listItem"];
    if (listItem === "bullet" || listItem === "number") {
      const tag = listItem === "number" ? "ol" : "ul";
      const rawLevel = typeof block["level"] === "number" ? Math.floor(block["level"]) : 1;
      const level = Math.min(Math.max(rawLevel, 1), MAX_LIST_DEPTH);
      lists = lists.slice(0, level);
      if (lists.length === level && lists[level - 1]?.tag !== tag)
        lists = lists.slice(0, level - 1);
      while (lists.length < level) {
        const list: VNode = { tag, attrs: {}, children: [] };
        const parent = lists.at(-1);
        if (parent) {
          const lastItem = parent.children.at(-1);
          if (lastItem && typeof lastItem !== "string") lastItem.children.push(list);
          else parent.children.push({ tag: "li", attrs: {}, children: [list] });
        } else out.push(list);
        lists.push(list);
      }
      if (hasText(inline))
        lists[level - 1]?.children.push({ tag: "li", attrs: {}, children: inline });
      continue;
    }
    lists = [];
    if (!hasText(inline)) continue;
    const style =
      typeof block["style"] === "string" && BLOCK_STYLES.has(block["style"])
        ? block["style"]
        : "normal";
    const tag = style === "normal" ? "p" : style;
    out.push({ tag, attrs: {}, children: inline });
  }
  return out.filter((node) =>
    node.tag !== "ul" && node.tag !== "ol" ? true : node.children.length > 0,
  );
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
  /** W-330: where entries link, the image and excerpt fields, and `field = value` filters. */
  permalink?: string;
  imageField?: string;
  excerptField?: string;
  where?: Record<string, string | string[]>;
};

const MAX_LOOP_FILTERS = 5;

/**
 * `category=news; team=design` → `{ category: "news", team: "design" }` (W-330); the same field
 * twice becomes a list (either value). At most 5 pairs; anything malformed is left out.
 */
export function parseLoopFilter(text: unknown): Record<string, string | string[]> | undefined {
  if (typeof text !== "string" || !LOOP_FILTER.test(text)) return undefined;
  const where: Record<string, string | string[]> = {};
  let count = 0;
  for (const pair of text.split(";")) {
    const at = pair.indexOf("=");
    if (at < 0) continue;
    const field = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    if (!field || !value || count >= MAX_LOOP_FILTERS) continue;
    count += 1;
    const had = where[field];
    where[field] = had === undefined ? value : [...(Array.isArray(had) ? had : [had]), value];
  }
  return count > 0 ? where : undefined;
}

/** An entry's link from a Loop's pattern (W-330): `{slug}` and `{id}` filled in, URL-encoded. */
export function loopPermalink(pattern: string, entry: { slug: string; id: string }): string {
  return pattern
    .replaceAll("{slug}", encodeURIComponent(entry.slug))
    .replaceAll("{id}", encodeURIComponent(entry.id));
}

/** Every collection Loop in a layout, so hosts can fetch their entries (W-308). */
export function collectCollectionLoops(layout: Layout): CollectionLoop[] {
  const loops: CollectionLoop[] = [];
  const walk = (node: LayoutNode): void => {
    if (node.type === "loop" && loops.length < 20) {
      const props = node.props as {
        collection?: unknown;
        limit?: unknown;
        order?: unknown;
        permalink?: unknown;
        imageField?: unknown;
        excerptField?: unknown;
        filter?: unknown;
      };
      if (typeof props.collection === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(props.collection)) {
        const limit =
          typeof props.limit === "number" && props.limit >= 1 && props.limit <= 50
            ? Math.floor(props.limit)
            : 6;
        const order = props.order === "oldest" || props.order === "title" ? props.order : "newest";
        const loop: CollectionLoop = {
          nodeId: node.id,
          collection: props.collection,
          limit,
          order,
        };
        if (typeof props.permalink === "string" && LOOP_PERMALINK.test(props.permalink))
          loop.permalink = props.permalink;
        if (typeof props.imageField === "string" && FIELD_SLUG.test(props.imageField))
          loop.imageField = props.imageField;
        if (typeof props.excerptField === "string" && FIELD_SLUG.test(props.excerptField))
          loop.excerptField = props.excerptField;
        const where = parseLoopFilter(props.filter);
        if (where) loop.where = where;
        loops.push(loop);
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
