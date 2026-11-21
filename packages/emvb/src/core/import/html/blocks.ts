/**
 * W-1074: WordPress (Gutenberg) blocks → EmVB elements. Core blocks map onto their EmVB
 * counterparts using the block's JSON attributes where they say more than the markup (columns'
 * widths, a cover's image and overlay, a gallery's columns); blocks WordPress builds when the
 * page is shown (latest posts, navigation, shortcodes…) are left out and reported, and blocks
 * from plugins keep their text and images. A few block style attributes are kept (text and
 * background colour, font size, padding, corner radius) because they are structured values
 * EmVB can validate; theme presets aren't on this site and are reported instead.
 */
import { SOCIAL_NETWORKS } from "../../schema/layout.ts";
import { sanitizeHref } from "../../sanitize/href.ts";
import { sanitizeMediaUrl } from "../../sanitize/media-url.ts";
import { cleanText, stripControl } from "../elementor/html.ts";
import { color, isRecord, num, str } from "../elementor/values.ts";
import type { N } from "../elementor/widgets.ts";
import { cssLength, GAP, MAX_BOX_DEPTH, type Mapper, withStyle } from "./map.ts";
import type { HtmlElement, HtmlNode, WpBlock } from "./parse.ts";

type Style = Record<string, unknown>;
type Attrs = Readonly<Record<string, unknown>>;

/** Blocks WordPress fills in when the page is shown: there is nothing to import. */
const DYNAMIC = new Set([
  "latest-posts",
  "latest-comments",
  "archives",
  "categories",
  "calendar",
  "tag-cloud",
  "rss",
  "query",
  "query-loop",
  "query-title",
  "query-pagination",
  "post-template",
  "post-title",
  "post-content",
  "post-excerpt",
  "post-featured-image",
  "post-date",
  "post-author",
  "post-author-name",
  "post-terms",
  "post-navigation-link",
  "comments",
  "comments-query-loop",
  "comment-template",
  "post-comments-form",
  "navigation",
  "navigation-link",
  "navigation-submenu",
  "page-list",
  "site-logo",
  "site-title",
  "site-tagline",
  "template-part",
  "loginout",
  "legacy-widget",
  "widget-group",
  "avatar",
  "term-description",
  "footnotes",
  "pattern",
]);

/** Page breaks and "Read more" markers: nothing to show on an EmVB page. */
const MARKERS = new Set(["more", "nextpage", "read-more"]);

/** WordPress social link services → EmVB's Social icons networks. */
const SERVICES: Record<string, string> = {
  twitter: "x",
  mail: "email",
  feed: "rss",
  chain: "website",
};

const ACRONYMS = new Set(["rss", "html", "wp", "url"]);

const words = (text: string) =>
  text
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

/** `core/media-text` → "Media Text"; plugin blocks keep their namespace ("Jetpack: Slideshow"). */
function blockLabel(name: string): string {
  const [space, rest] = name.includes("/") ? name.split("/", 2) : ["core", name];
  const label =
    space === "core" ? words(rest ?? "") : `${words(space ?? "")}: ${words(rest ?? "")}`;
  return label.slice(0, 60) || "Block";
}

const elements = (list: readonly HtmlNode[]): HtmlElement[] =>
  list.filter((c): c is HtmlElement => c.kind === "element");

/** Every element in the content (blocks are looked through), depth-first. */
function* descendants(list: readonly HtmlNode[]): Generator<HtmlElement> {
  for (const item of list) {
    if (item.kind === "text") continue;
    if (item.kind === "element") yield item;
    yield* descendants(item.children);
  }
}

/** The blocks inside the content, through the HTML that holds them (`<ul>` around social links). */
function innerBlocks(list: readonly HtmlNode[], level = 0): WpBlock[] {
  if (level > 4) return [];
  return list.flatMap((item) =>
    item.kind === "block"
      ? [item]
      : item.kind === "element"
        ? innerBlocks(item.children, level + 1)
        : [],
  );
}

const find = (list: readonly HtmlNode[], test: (el: HtmlElement) => boolean) => {
  for (const el of descendants(list)) if (test(el)) return el;
  return undefined;
};

const hasClass = (el: HtmlElement, name: string) =>
  (el.attrs["class"] ?? "").split(/\s+/).includes(name);

/** A block attribute's text (a label, a placeholder): plain, one line, at most `max` long. */
const attrText = (value: unknown, max: number) =>
  cleanText(stripControl(str(value) ?? "")).slice(0, max);

const uses = (value: unknown) => typeof value === "string" && value.startsWith("var:");

/** The block's own colours, size, padding and radius (theme presets are only noted). */
function blockStyle(m: Mapper, attrs: Attrs, label: string): Style {
  const style: Style = {};
  const s = isRecord(attrs["style"]) ? attrs["style"] : {};
  const colors = isRecord(s["color"]) ? s["color"] : {};
  const text = color(colors["text"]);
  const background = color(colors["background"]);
  if (text) style["color"] = text;
  if (background) style["backgroundColor"] = background;
  const typography = isRecord(s["typography"]) ? s["typography"] : {};
  const size = cssLength(typography["fontSize"], ["px", "rem", "em"]);
  if (size && size.value > 0) style["fontSize"] = size;
  const spacing = isRecord(s["spacing"]) ? s["spacing"] : {};
  const padding = isRecord(spacing["padding"]) ? spacing["padding"] : {};
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const value = cssLength(padding[side], ["px", "rem", "em", "%"]);
    if (value) style[`padding${side.charAt(0).toUpperCase()}${side.slice(1)}`] = value;
  }
  const border = isRecord(s["border"]) ? s["border"] : {};
  const radius = cssLength(border["radius"], ["px", "rem", "em", "%"]);
  if (radius) style["borderRadius"] = radius;
  const presets = [
    attrs["textColor"],
    attrs["backgroundColor"],
    attrs["fontSize"],
    attrs["gradient"],
  ];
  if (
    presets.some((p) => typeof p === "string" && p) ||
    uses(colors["text"]) ||
    uses(colors["background"]) ||
    uses(typography["fontSize"])
  )
    m.ctx.note(
      "approximated",
      label,
      "Your WordPress theme's colour and size presets aren't on this site; those blocks take your site styles.",
    );
  return style;
}

/** A block's text alignment (`textAlign`, or `align` on text blocks). */
function textAlignOf(attrs: Attrs): Style {
  const value = str(attrs["textAlign"]) ?? str(attrs["align"]);
  return value === "left" || value === "center" || value === "right" || value === "justify"
    ? { textAlign: value }
    : {};
}

/** The cover's overlay, image or video behind its content. */
function coverStyle(attrs: Attrs, bg: HtmlElement | undefined): Style {
  const style: Style = {
    justifyContent: "center",
    paddingTop: { value: 48, unit: "px" },
    paddingBottom: { value: 48, unit: "px" },
    paddingLeft: { value: 24, unit: "px" },
    paddingRight: { value: 24, unit: "px" },
  };
  const url = sanitizeMediaUrl(str(attrs["url"]) ?? bg?.attrs["src"] ?? "");
  const video = attrs["backgroundType"] === "video";
  if (url && !/[()\\\s"'`]/.test(url)) {
    style[video ? "backgroundVideo" : "backgroundImage"] = url;
    if (!video) {
      style["backgroundSize"] = "cover";
      style["backgroundPosition"] = "center";
    }
  }
  const minHeight = num(attrs["minHeight"]);
  const unit = str(attrs["minHeightUnit"]) ?? "px";
  const height = minHeight !== undefined ? cssLength(`${minHeight}${unit}`) : undefined;
  style["minHeight"] = height ?? { value: 430, unit: "px" };
  const overlay =
    color(attrs["customOverlayColor"]) ?? (attrs["overlayColor"] ? "#000000" : undefined);
  const dim = num(attrs["dimRatio"]) ?? (url ? 50 : 100);
  if (dim > 0)
    style["overlay"] = {
      color: overlay ?? "#000000",
      opacity: Math.min(1, Math.max(0, Math.round(dim) / 100)),
    };
  if (attrs["isDark"] !== false) style["color"] = "#ffffff";
  return style;
}

const WRAPPERS = new Set(["div", "section", "header", "footer", "main", "article", "aside", "nav"]);

/**
 * The content of a layout block: its wrapper element (`<div class="wp-block-group">`, older
 * themes' `__inner-container`) is looked through, so it doesn't become an extra box.
 */
function contentOf(list: readonly HtmlNode[]): readonly HtmlNode[] {
  let current = list;
  for (let level = 0; level < 3; level++) {
    const meaningful = current.filter((c) => c.kind !== "text" || c.text.trim());
    const only = meaningful.length === 1 ? meaningful[0] : undefined;
    if (only?.kind !== "element" || !WRAPPERS.has(only.tag)) break;
    current = only.children;
  }
  return current;
}

export function mapBlock(m: Mapper, block: WpBlock, depth: number): N[] {
  const ctx = m.ctx;
  const name = block.name;
  const core = name.startsWith("core/") ? name.slice(5) : undefined;
  const label = blockLabel(name);
  const attrs = block.attrs;
  ctx.elements++;
  const done = (nodes: N[]) => {
    if (nodes.length > 0) ctx.mapped++;
    return nodes;
  };
  const inner = (d = depth + 1) => m.nodes(block.children, Math.min(d, MAX_BOX_DEPTH));
  /** A layout block's content without its own wrapper `div` (the EmVB box replaces it). */
  const unwrapped = () => m.nodes(contentOf(block.children), Math.min(depth + 1, MAX_BOX_DEPTH));
  const styled = (nodes: N[], extra: Style = {}) =>
    withStyle(nodes, { ...blockStyle(m, attrs, label), ...extra });

  if (core && MARKERS.has(core)) {
    ctx.elements--;
    return [];
  }
  if (core && DYNAMIC.has(core)) {
    ctx.note(
      "skipped",
      label,
      "WordPress builds this when the page is shown, so there is nothing to import; rebuild it with EmVB's elements (a Loop for post lists, a Menu for navigation).",
    );
    return [];
  }
  switch (core) {
    case "paragraph":
    case "heading":
    case "list":
    case "verse":
    case "preformatted":
    case "code":
    case "table":
    case "details":
    case "file":
    case "freeform":
    case "list-item":
      return done(styled(inner(depth), textAlignOf(attrs)));
    case "quote":
    case "pullquote": {
      const quote = find(block.children, (el) => el.tag === "blockquote");
      const cite = quote ? elements(quote.children).find((el) => el.tag === "cite") : undefined;
      const content = quote ? quote.children : block.children;
      return done(styled(m.quote(content, depth, cite?.children)));
    }
    case "image":
      return done(inner(depth));
    case "gallery":
      return done(gallery(m, block, attrs));
    case "buttons": {
      const kids = unwrapped();
      if (kids.length === 0) return [];
      const vertical = isRecord(attrs["layout"]) && attrs["layout"]["orientation"] === "vertical";
      return done([
        m.box(kids, {
          flexDirection: vertical ? "column" : "row",
          flexWrap: "wrap",
          gap: { value: 8, unit: "px" },
          ...(vertical ? { alignItems: "flex-start" } : {}),
        }),
      ]);
    }
    case "button": {
      const link = find(block.children, (el) => el.tag === "a");
      const href = link ? m.href(link.attrs["href"]) : undefined;
      const content =
        link?.children ?? find(block.children, (el) => el.tag === "button")?.children ?? [];
      const text = m.plain(content).slice(0, 200);
      if (!text) return [];
      return done(
        styled([
          m.node("button", {
            text,
            ...(href ? { href } : {}),
            ...(href && link?.attrs["target"] === "_blank" ? { newTab: true } : {}),
          }),
        ]),
      );
    }
    case "columns": {
      const kids = unwrapped();
      if (kids.length === 0) return [];
      const row = m.box(kids, {
        flexDirection: "row",
        gap: { value: 32, unit: "px" },
        ...blockStyle(m, attrs, label),
      });
      if (attrs["isStackedOnMobile"] !== false)
        row["devices"] = { mobile: { flexDirection: "column" } };
      return done([row]);
    }
    case "column": {
      const kids = unwrapped();
      if (kids.length === 0) return [];
      const width = cssLength(attrs["width"], ["px", "%", "rem", "em"]);
      const size: Style = width
        ? { flexBasis: width, flexGrow: 0, flexShrink: 1 }
        : { flexBasis: { value: 0, unit: "px" }, flexGrow: 1 };
      return done([
        {
          ...m.box(kids, {
            minWidth: { value: 0, unit: "px" },
            ...size,
            ...blockStyle(m, attrs, label),
          }),
          devices: { mobile: { flexBasis: "auto" } },
        },
      ]);
    }
    case "group":
    case "row":
    case "stack": {
      const kids = unwrapped();
      if (kids.length === 0) return [];
      const layout = isRecord(attrs["layout"]) ? attrs["layout"] : {};
      const tagName = str(attrs["tagName"]);
      const tag =
        tagName &&
        ["section", "header", "footer", "main", "article", "aside", "nav"].includes(tagName)
          ? { tag: tagName }
          : {};
      const style = blockStyle(m, attrs, label);
      if (layout["type"] === "grid") {
        const count = num(layout["columnCount"]);
        return done([
          m.node(
            "grid",
            { columns: count ? Math.min(12, Math.max(1, Math.round(count))) : 3 },
            { style: { gap: GAP, ...style }, children: kids },
          ),
        ]);
      }
      const row =
        (layout["type"] === "flex" && layout["orientation"] !== "vertical") || core === "row";
      return done([
        m.box(
          kids,
          {
            ...(row
              ? {
                  flexDirection: "row",
                  flexWrap: layout["flexWrap"] === "nowrap" ? "nowrap" : "wrap",
                  alignItems: "center",
                }
              : {}),
            ...style,
          },
          tag,
        ),
      ]);
    }
    case "cover": {
      const bg = find(
        block.children,
        (el) => el.tag === "img" && hasClass(el, "wp-block-cover__image-background"),
      );
      const content = find(block.children, (el) => hasClass(el, "wp-block-cover__inner-container"));
      const kids = content
        ? m.nodes(content.children, Math.min(depth + 1, MAX_BOX_DEPTH))
        : m.nodes(
            block.children.filter(
              (c) =>
                c.kind !== "element" || (c.tag !== "img" && c.tag !== "span" && c.tag !== "video"),
            ),
            Math.min(depth + 1, MAX_BOX_DEPTH),
          );
      const style = coverStyle(attrs, bg);
      if (typeof style["backgroundImage"] === "string")
        m.ctx.externalImage(style["backgroundImage"]);
      if (
        attrs["hasParallax"] ||
        attrs["isRepeated"] ||
        attrs["gradient"] ||
        attrs["customGradient"]
      )
        ctx.note(
          "approximated",
          label,
          "Parallax, repeated images and gradients of covers were left out.",
        );
      return done([m.box(kids, { ...style, ...blockStyle(m, attrs, label) })]);
    }
    case "media-text": {
      const media = find(block.children, (el) => hasClass(el, "wp-block-media-text__media"));
      const content = find(block.children, (el) => hasClass(el, "wp-block-media-text__content"));
      const mediaNodes = media ? m.nodes(media.children, depth + 1) : [];
      const contentNodes = content ? m.nodes(content.children, depth + 2) : [];
      if (mediaNodes.length + contentNodes.length === 0) return [];
      const half: Style = {
        flexBasis: { value: 0, unit: "px" },
        flexGrow: 1,
        minWidth: { value: 0, unit: "px" },
      };
      const sides = [
        m.box(mediaNodes, half),
        m.box(contentNodes, { ...half, justifyContent: "center" }),
      ];
      if (attrs["mediaPosition"] === "right") sides.reverse();
      return done([
        {
          ...m.box(sides, {
            flexDirection: "row",
            gap: { value: 32, unit: "px" },
            ...blockStyle(m, attrs, label),
          }),
          ...(attrs["isStackedOnMobile"] !== false
            ? { devices: { mobile: { flexDirection: "column" } } }
            : {}),
        },
      ]);
    }
    case "separator":
      return done([m.node("divider", {})]);
    case "spacer": {
      const height = cssLength(attrs["height"] ?? "100px", ["px", "rem", "em", "vh"]) ?? {
        value: 100,
        unit: "px",
      };
      return done([m.node("spacer", { height })]);
    }
    case "embed":
    case "video": {
      const url = str(attrs["url"]) ?? "";
      const caption = find(block.children, (el) => el.tag === "figcaption");
      const title = caption ? m.plain(caption.children) : undefined;
      const video = m.videoUrl(url);
      if (video) return done([m.videoNode(video, title)]);
      if (core === "video") return done(inner(depth));
      const href = url ? sanitizeHref(url) : undefined;
      const provider = str(attrs["providerNameSlug"]) ?? "";
      if (!href || !/^https?:\/\//i.test(href)) {
        ctx.note("skipped", label, "Embeds without a usable address were left out.");
        return [];
      }
      ctx.note(
        "approximated",
        label,
        "Embeds other than YouTube and Vimeo became a link to the original (EmVB doesn't load other sites' frames).",
      );
      const text = (title || (provider ? `View on ${blockLabel(provider)}` : href)).slice(0, 200);
      return done([m.node("link", { text, href })]);
    }
    case "html":
      ctx.note(
        "approximated",
        label,
        "Custom HTML became plain EmVB elements; scripts, styles and markup were left out.",
      );
      return done(inner(depth));
    case "search": {
      ctx.note(
        "approximated",
        label,
        "The search box sends visitors to this site's search page (/search).",
      );
      const fieldLabel = attrText(attrs["label"], 80);
      const placeholder = attrText(attrs["placeholder"], 120);
      const buttonText = attrText(attrs["buttonText"], 40);
      return done([
        m.node("search-form", {
          ...(fieldLabel ? { label: fieldLabel } : {}),
          ...(placeholder ? { placeholder } : {}),
          ...(buttonText ? { buttonText } : {}),
        }),
      ]);
    }
    case "social-links":
      return done(socialLinks(m, block));
    case "audio":
      ctx.note(
        "skipped",
        label,
        "Audio players were left out (EmVB has no audio element); link to the file instead.",
      );
      return [];
    case "shortcode": {
      const code = m.plain(block.children).slice(0, 60);
      ctx.note(
        "skipped",
        label,
        code
          ? `The shortcode ${code} needs WordPress and was left out.`
          : "Shortcodes need WordPress and were left out.",
      );
      return [];
    }
    case "block":
      ctx.note(
        "skipped",
        "Synced pattern",
        "Synced patterns (reusable blocks) are only a reference in the post; import their content separately.",
      );
      return [];
    default:
      break;
  }
  const kept = inner(depth);
  ctx.note(
    "unmapped",
    label,
    kept.length > 0
      ? "EmVB has no element for this block; its text, images and links were kept in plain elements."
      : "EmVB has no element for this block, and it had no text or images to keep.",
  );
  return done(kept);
}

/** `core/gallery` → a Gallery of up to 60 pictures (lightbox when it linked to the files). */
function gallery(m: Mapper, block: WpBlock, attrs: Attrs): N[] {
  const pictures: N[] = [];
  let linkedToFiles = attrs["linkTo"] === "media" || attrs["linkTo"] === "file";
  let count = 0;
  for (const el of descendants(block.children)) {
    if (el.tag !== "img") continue;
    count++;
    if (pictures.length >= 60 || m.ctx.overBudget) continue;
    const pic = m.picture(el);
    if (!pic) continue;
    pictures.push(
      m.node("gallery-image", {
        src: pic.src,
        alt: pic.alt,
        ...(pic.decorative ? { decorative: true } : {}),
      }),
    );
  }
  for (const item of innerBlocks(block.children))
    if (item.attrs["linkDestination"] === "media") linkedToFiles = true;
  if (count > 60) m.ctx.note("skipped", "Gallery", "Galleries keep their first 60 pictures.");
  if (pictures.length === 0) return [];
  const columns = num(attrs["columns"]);
  return [
    m.node(
      "gallery",
      {
        columns: Math.min(6, Math.max(1, Math.round(columns ?? Math.min(3, pictures.length)))),
        ...(linkedToFiles ? { lightbox: true } : {}),
      },
      { children: pictures },
    ),
  ];
}

/** `core/social-links` → Social icons, for the services EmVB has. */
function socialLinks(m: Mapper, block: WpBlock): N[] {
  const links: N[] = [];
  for (const item of innerBlocks(block.children)) {
    if (item.name !== "core/social-link") continue;
    const service = str(item.attrs["service"]) ?? "";
    const network = SERVICES[service] ?? service;
    const href = sanitizeHref(str(item.attrs["url"]) ?? "");
    if (!href || !(SOCIAL_NETWORKS as readonly string[]).includes(network)) {
      m.ctx.note(
        "skipped",
        "Social Links",
        href
          ? `Social links for services EmVB has no icon for (${attrText(service, 30)}) were left out.`
          : "Social links without an address were left out.",
      );
      continue;
    }
    const label = attrText(item.attrs["label"], 80);
    links.push(m.node("social-link", { network, href, ...(label ? { label } : {}) }));
  }
  if (links.length === 0) return [];
  return [m.node("social-icons", {}, { children: links })];
}
