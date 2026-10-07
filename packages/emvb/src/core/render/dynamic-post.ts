import type { LayoutNode, POST_DATE_FORMATS } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { portableTextToVNodes, type ThemePostFields } from "../theme/dynamic.ts";
import type { RenderMode } from "./context.ts";
import type { VNode } from "./vnode.ts";

/**
 * W-196: only an ISO date (`2026-10-06`, optionally with a time) is read as a date. `Date.parse`
 * also takes text like "Spring 2026" (as Jan 1) or "2026-02-30", which would show a wrong date.
 */
const parseIsoDate = (raw: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw);
  if (!match) return Number.NaN;
  const parsed = Date.parse(raw.replace(" ", "T"));
  if (Number.isNaN(parsed)) return Number.NaN;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return day.getUTCDate() === Number(match[3]) && day.getUTCMonth() === Number(match[2]) - 1
    ? parsed
    : Number.NaN;
};

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

type PostDateFormat = (typeof POST_DATE_FORMATS)[number];

/** In UTC, so the date doesn't move with the server's time zone. */
function formatPostDate(time: number, format: PostDateFormat): string {
  const date = new Date(time);
  if (format === "numeric") return date.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en", { dateStyle: format, timeZone: "UTC" }).format(date);
}

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
      render: (node, attrs, post) => {
        if (!post.excerpt) return undefined;
        const max = props<{ maxWords?: number }>(node).maxWords;
        const words = post.excerpt.trim().split(/\s+/);
        const text = max && words.length > max ? `${words.slice(0, max).join(" ")}…` : post.excerpt;
        return { tag: "p", attrs, children: [text] };
      },
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
  [
    "post-date",
    {
      placeholder: (attrs) => ({ tag: "time", attrs, children: ["Post date"] }),
      has: (post) => !!post.publishedAt?.trim(),
      render: (node, attrs, post) => {
        const raw = post.publishedAt?.trim();
        if (!raw) return undefined;
        const parsed = parseIsoDate(raw);
        const format = props<{ format?: PostDateFormat }>(node).format ?? "medium";
        const text = Number.isNaN(parsed) ? raw.slice(0, 80) : formatPostDate(parsed, format);
        // W-196: `datetime` must be machine-readable, so a date we can't read only shows as text.
        const timeAttrs = Number.isNaN(parsed) ? attrs : { ...attrs, datetime: raw.slice(0, 80) };
        return { tag: "time", attrs: timeAttrs, children: [text] };
      },
    },
  ],
  [
    "post-author",
    {
      placeholder: (attrs) => ({ tag: "span", attrs, children: ["Author"] }),
      has: (post) => !!post.authorName?.trim(),
      render: (_node, attrs, post) => {
        const name = post.authorName?.trim();
        return name ? { tag: "span", attrs, children: [name.slice(0, 200)] } : undefined;
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
