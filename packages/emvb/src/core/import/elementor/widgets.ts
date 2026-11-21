/**
 * Elementor widgets → EmVB elements (W-945). Core Elementor widgets map to their EmVB
 * counterparts with Elementor's own defaults; Pro, theme-builder and third-party widgets are
 * best-effort and say what they left out. Every text is plain text and every URL goes through
 * EmVB's sanitizers before it lands in a node.
 */
import { MAX_TABS, MAX_TEXT_LENGTH } from "../../limits.ts";
import { FIELD_NAME_PATTERN, ICON_SVG_MAX } from "../../schema/layout.ts";
import { sanitizeHref } from "../../sanitize/href.ts";
import { sanitizeMediaUrl } from "../../sanitize/media-url.ts";
import { type ImportContext, type MenuLink, svgFileId } from "./context.ts";
import {
  type Block,
  cleanText,
  decodeEntities,
  embedVideoUrl,
  htmlToBlocks,
  inlineMarks,
  splitLong,
  stripControl,
} from "./html.ts";
import {
  boxReader,
  colorAt,
  deviceStyles,
  type Reader,
  type Style,
  textReader,
  typographyReader,
} from "./style.ts";
import {
  altFromUrl,
  color,
  image,
  isRecord,
  link,
  num,
  type Settings,
  slider,
  str,
  textAlign,
} from "./values.ts";

/** A layout node under construction; the whole tree is validated at the end. */
export type N = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  [key: string]: unknown;
};

export type Env = {
  /** The parent lays its children out in a row (alignment by auto margins needs a column). */
  parentRow: boolean;
  depth: number;
  /** Maps child Elementor elements (nested widgets), as the structure walker does. */
  walk: (elements: unknown, env: Env) => N[];
  /** Inside an Elementor 4 form: its labels by input id, so fields take their label. */
  form?: { labels: Map<string, string>; byField?: Map<Record<string, unknown>, string> };
  /** Inside a grid: its column counts, for children that span every column. */
  grid?: { desktop: number; tablet?: number; mobile?: number };
};

type Widget = (s: Settings, ctx: ImportContext, el: string, env: Env, raw: Settings) => N[];

export const node = (
  ctx: ImportContext,
  type: string,
  props: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): N => ({ id: ctx.id(), type, props, ...extra });

export const box = (
  ctx: ImportContext,
  children: N[],
  style: Style = {},
  extra: Record<string, unknown> = {},
): N =>
  node(
    ctx,
    "container",
    {},
    { style: { gap: { value: 0, unit: "px" }, ...style }, children, ...extra },
  );

/** Merges a device-style result into a node. */
function styled(n: N, ds: { style?: Style; devices?: Record<string, Style> }): N {
  if (ds.style) n["style"] = { ...(n["style"] as Style | undefined), ...ds.style };
  if (ds.devices) n["devices"] = ds.devices;
  return n;
}

/** Inline HTML in a title → plain text (and whether markup was dropped). */
function plain(value: unknown): { text: string; hadMarkup: boolean } {
  const raw = str(value) ?? "";
  const hadMarkup = /<[a-z/!]/i.test(raw);
  const text = cleanText(decodeEntities(raw.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")));
  return { text, hadMarkup };
}

const short = (text: string, max = MAX_TEXT_LENGTH) => text.slice(0, max);

export function href(value: unknown, ctx: ImportContext): { href?: string; newTab?: boolean } {
  const l = link(value);
  if (!l) return {};
  const safe = ctx.href(l.url);
  return safe ? { href: safe, ...(l.newTab ? { newTab: true } : {}) } : {};
}

const safeSrc = (url: string) => sanitizeMediaUrl(url.trim());

/** Elementor's "{name}" of a dynamic tag on `key`, if the setting is dynamic. */
export function dynamicTag(s: Settings, key: string): string | undefined {
  const dynamic = s["__dynamic__"];
  const raw = isRecord(dynamic) ? str(dynamic[key]) : undefined;
  return raw ? /name="([a-z0-9_-]{1,64})"/i.exec(raw)?.[1] : undefined;
}

/** Text blocks → EmVB nodes. Images without alt get one from the file name (noted). */
function blockNodes(blocks: readonly Block[], ctx: ImportContext, el: string): N[] {
  const out: N[] = [];
  for (const block of blocks) {
    if (ctx.overBudget) break;
    switch (block.kind) {
      case "heading":
        out.push(
          node(ctx, "heading", {
            text: block.text,
            level: block.level,
            ...(block.href ? { href: block.href } : {}),
            ...(block.marks ? { marks: block.marks } : {}),
          }),
        );
        break;
      case "text":
        out.push(
          node(ctx, "text", { text: block.text, ...(block.marks ? { marks: block.marks } : {}) }),
        );
        break;
      case "link":
        out.push(node(ctx, "link", { text: block.text, href: block.href }));
        break;
      case "list":
        out.push(
          node(ctx, "list", {
            items: block.items,
            ...(block.ordered ? { ordered: true } : {}),
            ...(block.start ? { start: block.start } : {}),
          }),
        );
        break;
      case "image": {
        const alt = block.alt || altFromUrl(block.src);
        if (!block.alt)
          ctx.note(
            "approximated",
            el,
            "Images without alt text got one from their file name; check it.",
          );
        ctx.externalImage(block.src);
        out.push(
          node(
            ctx,
            "image",
            { src: block.src, alt },
            { style: { maxWidth: { value: 100, unit: "%" } } },
          ),
        );
        break;
      }
      case "divider":
        out.push(node(ctx, "divider", {}));
        break;
      case "video":
        out.push(node(ctx, "video", { url: block.url, title: "Video" }));
        break;
    }
  }
  return out;
}

/** HTML content → nodes, noting what was flattened or dropped. */
function htmlNodes(value: unknown, ctx: ImportContext, el: string): N[] {
  const result = htmlToBlocks(str(value) ?? "", (url) => ctx.href(url), safeSrc);
  if (result.flattened)
    ctx.note(
      "approximated",
      el,
      "Inline formatting (bold, italic, coloured or linked words) became plain text.",
    );
  for (const what of result.dropped) ctx.note("skipped", el, `Left out: ${what}.`);
  return blockNodes(result.blocks, ctx, el);
}

/** Several nodes as one: a single node stays itself, more go in a column. */
function one(ctx: ImportContext, nodes: N[], gap: Style["gap"] = { value: 0, unit: "px" }): N[] {
  if (nodes.length <= 1) return nodes;
  return [box(ctx, nodes, { gap })];
}

const FA_PREFIX: Record<string, string> = {
  fas: "fa-solid",
  fa: "fa-solid",
  "fa-solid": "fa-solid",
  far: "fa-regular",
  "fa-regular": "fa-regular",
  fab: "fa-brands",
  "fa-brands": "fa-brands",
};

/** Font Awesome 4/5 names Elementor still stores → Font Awesome 7 names. */
const FA_RENAMED: Record<string, string> = {
  times: "xmark",
  close: "xmark",
  "check-circle": "circle-check",
  "times-circle": "circle-xmark",
  "info-circle": "circle-info",
  "question-circle": "circle-question",
  "exclamation-circle": "circle-exclamation",
  "exclamation-triangle": "triangle-exclamation",
  "play-circle": "circle-play",
  "user-circle": "circle-user",
  "arrow-circle-right": "circle-arrow-right",
  "chevron-circle-right": "circle-chevron-right",
  "phone-alt": "phone",
  "phone-square": "square-phone",
  "map-marker": "location-pin",
  "map-marker-alt": "location-dot",
  "external-link-alt": "up-right-from-square",
  "external-link": "arrow-up-right-from-square",
  search: "magnifying-glass",
  home: "house",
  "shopping-cart": "cart-shopping",
  "shopping-bag": "bag-shopping",
  "calendar-alt": "calendar-days",
  "mobile-alt": "mobile-screen-button",
  mobile: "mobile-screen",
  cog: "gear",
  cogs: "gears",
  "envelope-open": "envelope-open",
  "long-arrow-alt-right": "right-long",
  "long-arrow-right": "arrow-right-long",
  "angle-double-right": "angles-right",
  "quote-left": "quote-left",
  "star-half-alt": "star-half-stroke",
  "facebook-square": "square-facebook",
  "twitter-square": "square-twitter",
  "linkedin-in": "linkedin-in",
  "youtube-square": "square-youtube",
  "instagram-square": "square-instagram",
  "pinterest-square": "square-pinterest",
  "whatsapp-square": "square-whatsapp",
  "check-square": "square-check",
  edit: "pen-to-square",
  "trash-alt": "trash-can",
  "sign-out-alt": "right-from-bracket",
  "sign-in-alt": "right-to-bracket",
  "paper-plane": "paper-plane",
  "file-alt": "file-lines",
  "clock-o": "clock",
  "heart-o": "heart",
  "star-o": "star",
};

/** An Elementor icon setting → an EmVB icon id and its SVG from the editor's icon sets. */
function iconOf(
  value: unknown,
  ctx: ImportContext,
  el: string,
): { iconId: string; iconSvg: string; name: string } | undefined {
  let classes: string | undefined;
  let library: string | undefined;
  if (isRecord(value)) {
    library = str(value["library"]);
    if (library === "svg") {
      // W-951: the file's markup (fetched or added in the dialog) makes it a recolourable icon.
      const file = isRecord(value["value"]) ? str(value["value"]["url"]) : undefined;
      const url = file ? sanitizeMediaUrl(file) : undefined;
      const markup = url ? ctx.svgMarkup(url) : undefined;
      if (url && markup) return { iconId: svgFileId(url), iconSvg: markup, name: altFromUrl(url) };
      ctx.note(
        "skipped",
        el,
        url
          ? "Uploaded SVG icons that couldn't be read are left out; add the .svg files in the import dialog, or pick them again in the editor."
          : "Uploaded SVG icons aren't in the export file; pick them again in the editor.",
      );
      return undefined;
    }
    classes = str(value["value"]);
  } else {
    classes = str(value);
  }
  if (!classes?.trim()) return undefined;
  const tokens = classes.trim().split(/\s+/);
  if (tokens.some((t) => t.startsWith("eicon"))) {
    ctx.note(
      "skipped",
      el,
      "Elementor's own icons (eicons) have no EmVB match; pick a similar icon in the editor.",
    );
    return undefined;
  }
  let prefix = FA_PREFIX[library ?? ""] ?? undefined;
  let name: string | undefined;
  for (const token of tokens) {
    if (FA_PREFIX[token]) prefix ??= FA_PREFIX[token];
    else if (/^fa-[a-z0-9-]+$/.test(token)) name = token.slice(3);
  }
  if (!name) return undefined;
  prefix ??= "fa-solid";
  const candidates = [...new Set([FA_RENAMED[name] ?? name, name])];
  for (const candidate of candidates) {
    for (const p of prefix === "fa-regular" ? [prefix, "fa-solid"] : [prefix]) {
      const id = `${p}:${candidate}`;
      const svg = ctx.icon?.(id);
      if (svg && svg.length <= ICON_SVG_MAX) return { iconId: id, iconSvg: svg, name: candidate };
    }
  }
  ctx.note(
    "skipped",
    el,
    `Icon "${name}" wasn't found in EmVB's Font Awesome set; pick it again in the editor.`,
  );
  return undefined;
}

const humanize = (name: string) => {
  const words = name
    .replace(/-(?:alt|square|f|in|o)$/g, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Icon";
};

/** Left/center/right of a block widget in a column, by auto margins (Elementor's text-align). */
function align(
  n: N,
  value: unknown,
  env: Env,
  fallback?: "left" | "center" | "right" | "justify",
): N {
  const where = textAlign(value) ?? fallback;
  if (!where || env.parentRow) return n;
  const style = { ...(n["style"] as Style | undefined) };
  if (where === "justify") {
    style["width"] = { value: 100, unit: "%" };
  } else {
    if (where !== "left" && style["marginLeft"] === undefined) style["marginLeft"] = "auto";
    if (where !== "right" && style["marginRight"] === undefined) style["marginRight"] = "auto";
  }
  n["style"] = style;
  return n;
}

/** Image widget-like settings → an image node (or nothing, noted). */
function imageNode(
  ctx: ImportContext,
  el: string,
  value: unknown,
  extra: Record<string, unknown> = {},
): N | undefined {
  const img = image(value);
  if (!img) {
    if (isRecord(value) && str(value["url"]))
      ctx.note("skipped", el, "An image with an unsupported address was left out.");
    return undefined;
  }
  if (!img.alt)
    ctx.note("approximated", el, "Images without alt text got one from their file name; check it.");
  ctx.externalImage(img.url);
  return node(ctx, "image", { src: img.url, alt: img.alt ?? altFromUrl(img.url), ...extra });
}

// ---------------------------------------------------------------------------------------------
// Core widgets

const SIZES: Record<string, number> = { small: 15, medium: 19, large: 29, xl: 39, xxl: 59 };

const heading: Widget = (s, ctx, el) => {
  const tag = str(s["header_size"]) ?? "h2";
  const level = /^h([1-6])$/.exec(tag)?.[1];
  const ds = deviceStyles(s, ctx, el, [
    typographyReader("typography", "primary"),
    textReader("title_color", "primary"),
  ]);
  const sized = SIZES[str(s["size"]) ?? ""];
  if (sized && !(ds.style && "fontSize" in ds.style))
    ds.style = { ...ds.style, fontSize: { value: sized, unit: "px" } };
  const dynamic = dynamicTag(s, "title");
  if (dynamic === "post-title" || dynamic === "archive-title" || dynamic === "page-title") {
    return [styled(node(ctx, "post-title", level ? { level: Number(level) } : {}), ds)];
  }
  const { text, hadMarkup } = plain(s["title"]);
  if (!text) return [];
  const linkProps = href(s["link"], ctx);
  // W-950: bold, italic, coloured and linked words stay formatted.
  const marks = hadMarkup ? inlineMarks(str(s["title"]) ?? "", (url) => ctx.href(url), text) : [];
  if (hadMarkup && marks.length === 0)
    ctx.note("approximated", el, "Formatting inside a heading became plain text.");
  if (level)
    return splitLong(text).map((part) =>
      styled(
        node(ctx, "heading", {
          text: part,
          level: Number(level),
          ...linkProps,
          ...(marks.length > 0 ? { marks } : {}),
        }),
        ds,
      ),
    );
  if (linkProps.href) return [styled(node(ctx, "link", { text: short(text), ...linkProps }), ds)];
  return splitLong(text).map((part) =>
    styled(node(ctx, "text", { text: part, tag: tag === "div" ? "div" : "p" }), ds),
  );
};

const textEditor: Widget = (s, ctx, el) => {
  const ds = deviceStyles(s, ctx, el, [
    typographyReader("typography", "text"),
    textReader("text_color", "text"),
  ]);
  if (str(s["drop_cap"]) === "yes") ctx.note("approximated", el, "Drop caps aren't shown.");
  if ((num(s["text_columns"]) ?? 1) > 1)
    ctx.note("approximated", el, "Text columns are shown as one column.");
  const nodes = htmlNodes(s["editor"], ctx, el);
  if (nodes.length === 0) return [];
  const [only] = nodes;
  if (nodes.length === 1 && only) return [styled(only, ds)];
  return [styled(box(ctx, nodes, { gap: { value: 0.9, unit: "rem" } }), ds)];
};

const imageWidget: Widget = (s, ctx, el, env) => {
  const dynamic = dynamicTag(s, "image");
  const caption =
    str(s["caption_source"]) === "custom" ? plain(s["caption"]).text.slice(0, 500) : undefined;
  if (str(s["caption_source"]) === "attachment")
    ctx.note(
      "approximated",
      el,
      "Media-library captions aren't in the export; add the caption in the editor.",
    );
  const linkTo = str(s["link_to"]);
  const img = image(s["image"]);
  const linkProps =
    linkTo === "custom" ? href(s["link"], ctx) : linkTo === "file" && img ? { href: img.url } : {};
  const style: Style = { maxWidth: { value: 100, unit: "%" } };
  const ds = deviceStyles(s, ctx, el, [
    (x, d) => {
      const out: Style = {};
      const width = slider(x[`width${d}`]);
      if (width) out["width"] = width;
      const max = slider(x[`space${d}`]);
      if (max) out["maxWidth"] = max;
      const height = slider(x[`height${d}`]);
      if (height) out["height"] = height;
      const fit = str(x[`object-fit${d}`]);
      if (fit === "cover" || fit === "contain" || fit === "fill") out["objectFit"] = fit;
      return out;
    },
    (x, d, c) => {
      const out: Style = {};
      const radius = x[`image_border_radius${d}`];
      if (radius) Object.assign(out, boxReader("")({ border_radius: radius }, "", c, el));
      const opacity = isRecord(x[`opacity${d}`])
        ? num((x[`opacity${d}`] as Settings)["size"])
        : undefined;
      if (opacity !== undefined && opacity >= 0 && opacity <= 1) out["opacity"] = opacity;
      return out;
    },
  ]);
  if (dynamic === "post-featured-image") {
    return [align(styled(node(ctx, "post-image", {}, { style }), ds), s["align"], env, "center")];
  }
  const n = imageNode(ctx, el, s["image"], { ...(caption ? { caption } : {}), ...linkProps });
  if (!n) return [];
  n["style"] = style;
  if (str(s["hover_animation"])) ctx.note("approximated", el, "Hover animations aren't imported.");
  return [align(styled(n, ds), s["align"], env, "center")];
};

const SMALL_BUTTON = { pad: [12, 24] as [number, number], font: 15 };
const BUTTON_SIZES: Record<string, { pad: [number, number]; font: number }> = {
  xs: { pad: [10, 20], font: 13 },
  sm: { pad: [12, 24], font: 15 },
  md: { pad: [15, 30], font: 16 },
  lg: { pad: [20, 40], font: 18 },
  xl: { pad: [25, 50], font: 20 },
};

/** A button with Elementor's look: accent background, white text, 3px corners. */
function buttonNode(
  s: Settings,
  ctx: ImportContext,
  el: string,
  keys: { text: string; link: string; icon?: string } = {
    text: "text",
    link: "link",
    icon: "selected_icon",
  },
): N | undefined {
  const text = short(plain(s[keys.text]).text);
  if (!text) return undefined;
  const size = BUTTON_SIZES[str(s["size"]) ?? "sm"] ?? SMALL_BUTTON;
  const base: Style = {
    paddingTop: { value: size.pad[0], unit: "px" },
    paddingBottom: { value: size.pad[0], unit: "px" },
    paddingLeft: { value: size.pad[1], unit: "px" },
    paddingRight: { value: size.pad[1], unit: "px" },
    fontSize: { value: size.font, unit: "px" },
    lineHeight: 1,
    borderRadius: { value: 3, unit: "px" },
    borderStyle: "none",
    color: "#ffffff",
  };
  if (ctx.useDefaults) {
    const accent = ctx.globalColor("accent");
    if (accent) base["backgroundColor"] = accent;
  }
  const textColor: Reader = (x, d, c) => {
    const out: Style = {};
    const fill = colorAt(x, "button_text_color", c, d);
    if (fill) out["color"] = fill;
    const bg = colorAt(x, "background_color", c, d) ?? colorAt(x, "button_background_color", c, d);
    if (bg) out["backgroundColor"] = bg;
    const pad: Style = {};
    for (const [k, v] of Object.entries(
      boxReader("")({ padding: x[`text_padding${d}`] }, "", c, el),
    ))
      pad[k] = v;
    return { ...out, ...pad };
  };
  const ds = deviceStyles(s, ctx, el, [
    typographyReader("typography", "accent"),
    (x, d, c) => {
      // Border, radius and shadow of the button itself (its padding is `text_padding`).
      const out = boxReader("")(
        { ...x, padding: undefined, margin: undefined, background_background: undefined },
        d,
        c,
        el,
      );
      return out;
    },
    textColor,
  ]);
  const n = node(
    ctx,
    "button",
    { text, ...href(s[keys.link], ctx) },
    { style: { ...base, ...ds.style } },
  );
  if (ds.devices) n["devices"] = ds.devices;
  const hover: Style = {};
  const hoverText = colorAt(s, "hover_color", ctx);
  if (hoverText) hover["color"] = hoverText;
  const hoverBg = colorAt(s, "button_background_hover_color", ctx);
  if (hoverBg) hover["backgroundColor"] = hoverBg;
  const hoverBorder = colorAt(s, "button_hover_border_color", ctx);
  if (hoverBorder) hover["borderColor"] = hoverBorder;
  if (Object.keys(hover).length > 0) n["states"] = { hover };
  const icon = keys.icon ? iconOf(s[keys.icon] ?? s["icon"], ctx, el) : undefined;
  if (icon) {
    const props = n.props;
    props["iconId"] = icon.iconId;
    props["iconSvg"] = icon.iconSvg;
    const position = str(s["icon_align"]);
    props["iconPosition"] = position === "right" || position === "row-reverse" ? "after" : "before";
    const gap = slider(s["icon_indent"]);
    if (gap && gap.unit === "px")
      props["iconGap"] = Math.min(64, Math.max(0, Math.round(gap.value)));
  }
  return n;
}

const button: Widget = (s, ctx, el, env) => {
  const n = buttonNode(s, ctx, el);
  return n ? [align(n, s["align"], env, "left")] : [];
};

const spacer: Widget = (s, ctx) => {
  const height = slider(s["space"]) ?? { value: 50, unit: "px" as const };
  const n = node(ctx, "spacer", { height });
  const tablet = slider(s["space_tablet"]);
  const mobile = slider(s["space_mobile"]);
  if (tablet || mobile) {
    n["devices"] = {
      ...(tablet ? { tablet: { height: tablet } } : {}),
      ...(mobile ? { mobile: { height: mobile } } : {}),
    };
  }
  return [n];
};

const divider: Widget = (s, ctx, el, env) => {
  const style: Style = {};
  const kind = str(s["style"]) ?? "solid";
  if (kind === "dashed" || kind === "dotted" || kind === "solid") style["borderStyle"] = kind;
  else {
    style["borderStyle"] = "solid";
    ctx.note("approximated", el, `Divider pattern "${kind}" is shown as a solid line.`);
  }
  style["borderTopWidth"] = slider(s["weight"]) ?? { value: 1, unit: "px" };
  const fill =
    colorAt(s, "color", ctx) ?? (ctx.useDefaults ? ctx.globalColor("secondary") : undefined);
  if (fill) style["color"] = fill;
  const width = slider(s["width"]);
  if (width) style["width"] = width;
  const gap = slider(s["gap"]) ?? { value: 15, unit: "px" as const };
  style["marginTop"] = gap;
  style["marginBottom"] = gap;
  if (str(s["look"]) && str(s["look"]) !== "line")
    ctx.note("approximated", el, "A divider's text or icon was left out.");
  return [align(node(ctx, "divider", {}, { style }), s["align"], env, "left")];
};

/** An Icon widget's icon, with Elementor's stacked/framed looks. */
function iconNode(
  s: Settings,
  ctx: ImportContext,
  el: string,
  key = "selected_icon",
  fallbackColor = "primary",
): N | undefined {
  const icon = iconOf(s[key] ?? s["icon"], ctx, el);
  if (!icon) return undefined;
  const size = slider(s["size"]);
  const pxSize = size && size.unit === "px" ? Math.round(size.value) : 50;
  const linkProps = href(s["link"], ctx);
  const fill =
    colorAt(s, "primary_color", ctx) ??
    (ctx.useDefaults ? ctx.globalColor(fallbackColor) : undefined);
  const style: Style = {};
  const view = str(s["view"]);
  if (view === "stacked") {
    if (fill) style["backgroundColor"] = fill;
    style["color"] = colorAt(s, "secondary_color", ctx) ?? "#ffffff";
  } else if (fill) {
    style["color"] = fill;
  }
  if (view === "framed") {
    style["borderStyle"] = "solid";
    style["borderWidth"] = { value: 3, unit: "px" };
    if (fill) style["borderColor"] = fill;
  }
  if (view === "stacked" || view === "framed") {
    const pad = slider(s["icon_padding"]) ?? { value: 0.5, unit: "em" as const };
    for (const side of ["Top", "Right", "Bottom", "Left"]) style[`padding${side}`] = pad;
    style["borderRadius"] =
      str(s["shape"]) === "square" ? { value: 0, unit: "px" } : { value: 50, unit: "%" };
  }
  return node(
    ctx,
    "icon",
    {
      iconId: icon.iconId,
      iconSvg: icon.iconSvg,
      size: Math.min(512, Math.max(1, pxSize)),
      ...(linkProps.href ? { ...linkProps, title: humanize(icon.name) } : { decorative: true }),
    },
    { style },
  );
}

const iconWidget: Widget = (s, ctx, el, env) => {
  const n = iconNode(s, ctx, el);
  return n ? [align(n, s["align"], env, "center")] : [];
};

/** Icon Box / Image Box: media, then a title and a description. */
function mediaBox(media: N | undefined, s: Settings, ctx: ImportContext, el: string): N[] {
  const titleTag = str(s["title_size"]) ?? "h3";
  const level = Number(/^h([1-6])$/.exec(titleTag)?.[1] ?? 3);
  const title = plain(s["title_text"]).text;
  const description = plain(s["description_text"]).text;
  const linkProps = href(s["link"], ctx);
  const children: N[] = [];
  if (title) {
    children.push(
      styled(
        node(ctx, "heading", { text: short(title), level, ...linkProps }),
        deviceStyles(s, ctx, el, [
          typographyReader("title_typography", "primary"),
          textReader("title_color", "primary", "text_align"),
        ]),
      ),
    );
  }
  if (description) {
    children.push(
      styled(
        node(ctx, "text", { text: short(description) }),
        deviceStyles(s, ctx, el, [
          typographyReader("description_typography", "text"),
          textReader("description_color", "text", "text_align"),
        ]),
      ),
    );
  }
  const position = str(s["position"]) ?? "top";
  const side = position === "left" || position === "right";
  const content = box(ctx, children, { gap: { value: 10, unit: "px" } });
  const parts = media ? (position === "right" ? [content, media] : [media, content]) : [content];
  const where = textAlign(s["text_align"]) ?? (side ? "left" : "center");
  return [
    box(ctx, parts, {
      flexDirection: side ? "row" : "column",
      gap: { value: 15, unit: "px" },
      alignItems: side
        ? "flex-start"
        : where === "left"
          ? "flex-start"
          : where === "right"
            ? "flex-end"
            : "center",
      textAlign: where,
    }),
  ];
}

/** Elementor's title, text, link and position settings as an icon or image box's props. */
function mediaBoxProps(s: Settings, ctx: ImportContext): Record<string, unknown> {
  const level = Number(/^h([1-6])$/.exec(str(s["title_size"]) ?? "h3")?.[1] ?? 3);
  const position = str(s["position"]);
  const linkProps = href(s["link"], ctx);
  return {
    title: short(plain(s["title_text"]).text, 200),
    ...(level === 3 ? {} : { titleLevel: Math.max(2, level) }),
    text: short(plain(s["description_text"]).text),
    ...(position === "left" || position === "right" ? { position } : {}),
    ...linkProps,
  };
}

/** The box's own styles: alignment, and one colour for icon and words (EmVB's box has one). */
function mediaBoxStyle(s: Settings, ctx: ImportContext, el: string): Style {
  const style: Style = {};
  const where = textAlign(s["text_align"]);
  if (where) style.textAlign = where;
  const ink = colorAt(s, "title_color", ctx) ?? colorAt(s, "primary_color", ctx) ?? undefined;
  if (ink) style.color = ink;
  if (
    s["title_typography_typography"] ||
    s["description_typography_typography"] ||
    s["description_color"]
  )
    ctx.note(
      "approximated",
      el,
      "Icon and image boxes keep one text style; title and description fonts and colours were simplified.",
    );
  return style;
}

/** W-1020: Elementor's Icon Box → an Icon box; without a usable icon, the old layout. */
const iconBox: Widget = (s, ctx, el) => {
  const icon = iconOf(s["selected_icon"] ?? s["icon"], ctx, el);
  if (!icon) return mediaBox(undefined, s, ctx, el);
  const size = slider(s["size"]);
  const style = mediaBoxStyle(s, ctx, el);
  return [
    node(
      ctx,
      "icon-box",
      {
        iconId: icon.iconId,
        ...(icon.iconSvg ? { iconSvg: icon.iconSvg } : {}),
        ...(size && size.unit === "px"
          ? { iconSize: Math.min(512, Math.max(8, Math.round(size.value))) }
          : {}),
        ...mediaBoxProps(s, ctx),
      },
      Object.keys(style).length > 0 ? { style } : {},
    ),
  ];
};

/** W-1021: Elementor's image width (a % of the box) as the nearest Image box size. */
function imageBoxSize(percent: number | undefined): string | undefined {
  if (percent === undefined) return "small"; // Elementor's default is 30 %
  if (percent <= 32) return "small";
  if (percent <= 50) return undefined;
  if (percent <= 75) return "large";
  return "full";
}

/** W-1021: Elementor's Image Box → an Image box; without a usable image, the old layout. */
const imageBox: Widget = (s, ctx, el) => {
  const img = imageNode(ctx, el, s["image"]);
  if (!img) return mediaBox(undefined, s, ctx, el);
  const picture = img["props"] as Record<string, unknown>;
  const width = slider(s["image_size"]);
  const size = imageBoxSize(width?.unit === "%" ? width.value : undefined);
  const style = mediaBoxStyle(s, ctx, el);
  return [
    node(
      ctx,
      "image-box",
      {
        ...Object.fromEntries(
          ["src", "alt", "decorative", "mediaId", "width", "height"]
            .filter((key) => picture[key] !== undefined)
            .map((key) => [key, picture[key]]),
        ),
        ...(size ? { imageSize: size } : {}),
        ...mediaBoxProps(s, ctx),
      },
      Object.keys(style).length > 0 ? { style } : {},
    ),
  ];
};

const iconList: Widget = (s, ctx, el) => {
  const items = Array.isArray(s["icon_list"]) ? s["icon_list"].slice(0, 200) : [];
  const inline = str(s["view"]) === "inline";
  const textStyle = deviceStyles(s, ctx, el, [
    typographyReader("icon_typography", "text"),
    textReader("text_color", "secondary"),
  ]);
  const iconColor =
    colorAt(s, "icon_color", ctx) ?? (ctx.useDefaults ? ctx.globalColor("primary") : undefined);
  const iconSize = slider(s["icon_size"]);
  const rows: N[] = [];
  for (const raw of items) {
    if (!isRecord(raw) || ctx.overBudget) continue;
    const text = short(plain(raw["text"]).text);
    if (!text) continue;
    const linkProps = href(raw["link"], ctx);
    const label = linkProps.href
      ? node(ctx, "link", { text, ...linkProps })
      : node(ctx, "text", { text });
    styled(label, textStyle);
    const icon = iconOf(raw["selected_icon"] ?? raw["icon"], ctx, el);
    const parts: N[] = [];
    if (icon) {
      parts.push(
        node(
          ctx,
          "icon",
          {
            iconId: icon.iconId,
            iconSvg: icon.iconSvg,
            decorative: true,
            size: iconSize && iconSize.unit === "px" ? Math.round(iconSize.value) : 14,
          },
          iconColor ? { style: { color: iconColor } } : {},
        ),
      );
    }
    parts.push(label);
    rows.push(
      parts.length === 1
        ? label
        : box(ctx, parts, {
            flexDirection: "row",
            alignItems: "center",
            gap: { value: 5, unit: "px" },
          }),
    );
  }
  if (rows.length === 0) return [];
  const space = slider(s["space_between"]);
  return [
    box(ctx, rows, {
      flexDirection: inline ? "row" : "column",
      ...(inline ? { flexWrap: "wrap" } : {}),
      gap: space ?? { value: inline ? 16 : 8, unit: "px" },
    }),
  ];
};

const video: Widget = (s, ctx, el) => {
  const type = str(s["video_type"]) ?? "youtube";
  let url: string | undefined;
  if (type === "youtube") url = str(s["youtube_url"]);
  else if (type === "vimeo") url = str(s["vimeo_url"]);
  else if (type === "hosted")
    url = link(s["insert_url"] === "yes" ? s["external_url"] : s["hosted_url"])?.url;
  else {
    ctx.note("skipped", el, `${type} videos aren't supported; use YouTube, Vimeo or a video file.`);
    return [];
  }
  const embedded = url ? (embedVideoUrl(url) ?? url) : undefined;
  const safe = embedded ? sanitizeHref(embedded) : undefined;
  if (!safe) return [];
  return [node(ctx, "video", { url: safe, title: "Video" })];
};

/** A number a Counter can show. */
const clamp = (n: number) => Math.min(1e12, Math.max(-1e12, n));

/** W-1049: Elementor's Counter → a Counter that counts up as it does (5 s at most). */
const counter: Widget = (s, ctx, el) => {
  const end = clamp(num(s["ending_number"]) ?? 100);
  const start = clamp(num(s["starting_number"]) ?? 0);
  const sep = str(s["thousand_separator_char"]);
  const separator =
    s["thousand_separator"] === "yes" || (s["thousand_separator"] === undefined && sep)
      ? sep === "." || sep === "'"
        ? sep
        : sep === " " || sep === "space"
          ? " "
          : ","
      : undefined;
  const decimals = (String(end).split(".")[1] ?? "").length;
  const duration = num(s["duration"]) ?? 2000;
  if (duration > 5000) ctx.note("approximated", el, "Counters count up in 5 seconds at most.");
  const title = plain(s["title"]).text;
  return [
    styled(
      node(ctx, "counter", {
        value: end,
        ...(start !== 0 ? { start } : {}),
        ...(decimals ? { decimals: Math.min(3, decimals) } : {}),
        ...(separator ? { separator } : {}),
        ...(plain(s["prefix"]).text ? { prefix: plain(s["prefix"]).text.slice(0, 20) } : {}),
        ...(plain(s["suffix"]).text ? { suffix: plain(s["suffix"]).text.slice(0, 20) } : {}),
        ...(title ? { title: title.slice(0, 200) } : {}),
        countUp: true,
        duration: Math.min(5000, Math.max(300, Math.round(duration))),
      }),
      deviceStyles(s, ctx, el, [textReader("number_color", "primary")]),
    ),
  ];
};

/** W-1049: Elementor's Progress Bar → a Progress bar that grows in, as Elementor's does. */
const progress: Widget = (s, ctx, el) => {
  const percent = Math.min(
    100,
    Math.max(0, num(isRecord(s["percent"]) ? s["percent"]["size"] : s["percent"]) ?? 50),
  );
  const title = plain(s["title"]).text;
  if (plain(s["inner_text"]).text)
    ctx.note("approximated", el, "Text inside progress bars was left out; the title stays.");
  const bar =
    colorAt(s, "bar_color", ctx) ??
    (ctx.useDefaults ? ctx.globalColor("primary") : undefined) ??
    "#6ec1e4";
  return [
    node(
      ctx,
      "progress",
      {
        value: Math.round(percent * 100) / 100,
        ...(title ? { label: title.slice(0, 120) } : {}),
        ...(str(s["display_percentage"]) === "hide" ? {} : { showValue: true }),
        thickness: 30,
        grow: true,
      },
      { style: { color: bar } },
    ),
  ];
};

/** W-1022: Elementor's Testimonial → a Testimonial: quote, photo, name and job. */
const testimonial: Widget = (s, ctx, el) => {
  const quote = plain(s["testimonial_content"]).text;
  const name = plain(s["testimonial_name"]).text;
  if (!quote && !name) return [];
  const job = plain(s["testimonial_job"]).text;
  const img = imageNode(ctx, el, s["testimonial_image"]);
  const photo = (img?.["props"] ?? {}) as Record<string, unknown>;
  const where = textAlign(s["testimonial_alignment"]) ?? "center";
  const style: Style = { textAlign: where };
  if (where !== "left") style.alignItems = where === "right" ? "flex-end" : "center";
  const ink = colorAt(s, "content_content_color", ctx);
  if (ink) style.color = ink;
  if (s["content_typography_typography"] || s["name_text_color"] || s["job_text_color"])
    ctx.note(
      "approximated",
      el,
      "Testimonials keep one text style; name and job colours and fonts were simplified.",
    );
  return [
    node(
      ctx,
      "testimonial",
      {
        quote: short(quote),
        name: short(name, 200),
        ...(job ? { role: short(job, 200) } : {}),
        ...Object.fromEntries(
          ["src", "alt", "mediaId", "width", "height"]
            .filter((key) => photo[key] !== undefined)
            .map((key) => [key, photo[key]]),
        ),
      },
      { style },
    ),
  ];
};

/**
 * W-1073: Elementor Pro's Search Form becomes EmVB's, sending `?q=` to the site's /search page
 * (WordPress's `?s=` doesn't apply on EmDash). The icon-only button and the full-screen skin
 * become a field and a text button.
 */
const searchForm: Widget = (s, ctx, el) => {
  const placeholder = plain(s["placeholder"]).text;
  const buttonText = plain(s["button_text"]).text;
  if (s["skin"] === "full_screen" || s["button_type"] === "icon")
    ctx.note("approximated", el, "Search forms show a field and a Search button.");
  return [
    node(ctx, "search-form", {
      ...(placeholder ? { placeholder: placeholder.slice(0, 120) } : {}),
      ...(buttonText && s["button_type"] !== "icon" ? { buttonText: buttonText.slice(0, 40) } : {}),
    }),
  ];
};

/** W-1023: Elementor's Star Rating → a Rating, with its title as text beside it. */
const starRating: Widget = (s, ctx, el) => {
  const scale = Math.min(10, Math.max(1, Math.round(num(s["rating_scale"]) ?? 5)));
  const value = Math.min(
    scale,
    Math.max(0, num(isRecord(s["rating"]) ? s["rating"]["size"] : s["rating"]) ?? scale),
  );
  const size = num(isRecord(s["icon_size"]) ? s["icon_size"]["size"] : undefined);
  const rating = node(
    ctx,
    "rating",
    {
      value: Math.round(value * 10) / 10,
      max: scale,
      ...(size ? { size: Math.min(128, Math.max(8, Math.round(size))) } : {}),
    },
    { style: { color: colorAt(s, "stars_color", ctx) ?? "#f0ad4e" } },
  );
  if (s["star_style"] === "star_unicode" || s["unmarked_star_style"] === "outline")
    ctx.note("approximated", el, "Star ratings use EmVB's filled stars.");
  const title = plain(s["title"]).text;
  if (!title) return [rating];
  return [
    box(ctx, [node(ctx, "text", { text: short(title) }), rating], {
      flexDirection: "row",
      alignItems: "center",
      gap: { value: 8, unit: "px" },
    }),
  ];
};

const ALERT_KINDS = new Set(["info", "success", "warning", "danger"]);

/**
 * W-1025: Elementor's Alert → an Alert of the same kind. Elementor shows no icon, so neither does
 * the import; its own colours, when set, stay as the element's styles; Dismiss stays dismissible.
 */
const alert: Widget = (s, ctx) => {
  const title = plain(s["alert_title"]).text;
  const description = plain(s["alert_description"]).text;
  if (!title && !description) return [];
  const kind = str(s["alert_type"]) ?? "info";
  const style: Style = {};
  const background = colorAt(s, "background", ctx);
  const border = colorAt(s, "border_color", ctx);
  const ink = colorAt(s, "title_color", ctx);
  if (background) style.backgroundColor = background;
  if (border) style.borderColor = border;
  if (ink) style.color = ink;
  return [
    node(
      ctx,
      "alert",
      {
        variant: ALERT_KINDS.has(kind) ? kind : "info",
        ...(title ? { title: short(title, 200) } : {}),
        text: short(description),
        hideIcon: true,
        ...(str(s["show_dismiss"]) === "show" ? { dismissible: true } : {}),
      },
      Object.keys(style).length > 0 ? { style } : {},
    ),
  ];
};

const html: Widget = (s, ctx, el) => {
  const nodes = htmlNodes(s["html"], ctx, el);
  ctx.note(
    "approximated",
    el,
    "Custom HTML became plain EmVB elements; scripts, styles and markup were left out.",
  );
  return one(ctx, nodes, { value: 16, unit: "px" });
};

const menuAnchor: Widget = (s, ctx, el) => {
  const anchor = str(s["anchor"])?.trim().replace(/\s+/g, "-") ?? "";
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(anchor)) {
    if (anchor)
      ctx.note(
        "skipped",
        el,
        `Anchor "${anchor.slice(0, 40)}" isn't a valid id; add it in the editor.`,
      );
    return [];
  }
  if (ctx.htmlIds.has(anchor)) return [];
  ctx.htmlIds.add(anchor);
  return [box(ctx, [], {}, { htmlId: anchor, editorLabel: `Anchor ${anchor}`.slice(0, 80) })];
};

/** W-1049: Elementor's Google Maps → a Map that loads Google's map when a visitor asks. */
const googleMaps: Widget = (s, ctx, el) => {
  const address = plain(s["address"]).text.slice(0, 300);
  if (!address) return [];
  const zoom = num(isRecord(s["zoom"]) ? s["zoom"]["size"] : s["zoom"]);
  const height = num(isRecord(s["height"]) ? s["height"]["size"] : s["height"]);
  ctx.note(
    "approximated",
    el,
    "Google Maps load when a visitor presses Show the map, so Google isn't contacted before.",
  );
  return [
    node(ctx, "map", {
      address,
      provider: "google",
      embed: true,
      ...(zoom ? { zoom: Math.min(19, Math.max(1, Math.round(zoom))) } : {}),
      ...(height ? { height: Math.min(800, Math.max(150, Math.round(height))) } : {}),
    }),
  ];
};

/**
 * W-1019: Elementor's Image Gallery and Gallery → a Gallery of Gallery images (up to 60), with
 * Elementor's lightbox kept (on unless the widget turns it off) and masonry when it used it.
 */
function galleryWidget(
  list: unknown,
  columns: number,
  s: Settings,
  ctx: ImportContext,
  el: string,
): N[] {
  const items = Array.isArray(list) ? list : [];
  if (items.length > 60) ctx.note("skipped", el, "Galleries keep their first 60 pictures.");
  const pictures: N[] = [];
  for (const item of items.slice(0, 60)) {
    if (ctx.overBudget) break;
    const img = imageNode(ctx, el, item);
    if (!img) continue;
    const props = img["props"] as Record<string, unknown>;
    pictures.push(
      node(
        ctx,
        "gallery-image",
        Object.fromEntries(
          ["src", "alt", "decorative", "mediaId", "width", "height"]
            .filter((key) => props[key] !== undefined)
            .map((key) => [key, props[key]]),
        ),
      ),
    );
  }
  if (pictures.length === 0) return [];
  const lightbox = str(s["open_lightbox"]) !== "no";
  const masonry = str(s["gallery_layout"]) === "masonry" || s["masonry"] === "yes";
  return [
    node(
      ctx,
      "gallery",
      {
        ...(masonry ? { layout: "masonry" } : {}),
        columns: Math.min(6, Math.max(1, Math.round(columns))),
        ...(lightbox ? { lightbox: true } : {}),
      },
      { children: pictures },
    ),
  ];
}

const imageGallery: Widget = (s, ctx, el) =>
  galleryWidget(s["wp_gallery"], num(s["gallery_columns"]) ?? 4, s, ctx, el);
const proGallery: Widget = (s, ctx, el) =>
  galleryWidget(s["gallery"], num(s["columns"]) ?? 4, s, ctx, el);
/**
 * W-1018: Elementor's Image Carousel and Media Carousel → a Carousel with one picture per slide.
 * Navigation and looping follow Elementor's settings. Elementor plays by default; EmVB doesn't,
 * so autoplay comes over only when the widget turned it on explicitly (with its speed).
 */
function carouselWidget(
  list: unknown,
  perView: number,
  s: Settings,
  ctx: ImportContext,
  el: string,
  imageKey?: string,
): N[] {
  const items = Array.isArray(list) ? list : [];
  if (items.length > 20) ctx.note("skipped", el, "Carousels keep their first 20 slides.");
  const slides: N[] = [];
  for (const item of items.slice(0, 20)) {
    if (ctx.overBudget) break;
    const img = imageNode(ctx, el, imageKey && isRecord(item) ? item[imageKey] : item);
    if (!img) continue;
    img["style"] = { width: { value: 100, unit: "%" }, height: "auto" };
    slides.push(node(ctx, "carousel-slide", {}, { children: [img] }));
  }
  return carouselFrom(slides, perView, s, ctx, el);
}

const imageCarousel: Widget = (s, ctx, el) =>
  carouselWidget(s["carousel"], num(s["slides_to_show"]) ?? 3, s, ctx, el);
const mediaCarousel: Widget = (s, ctx, el) =>
  carouselWidget(s["slides"], num(s["slides_per_view"]) ?? 3, s, ctx, el, "image");

const BRANDS: Record<string, string> = {
  facebook: "#3b5998",
  "facebook-f": "#3b5998",
  twitter: "#1da1f2",
  "x-twitter": "#000000",
  instagram: "#262626",
  youtube: "#cd201f",
  linkedin: "#0077b5",
  "linkedin-in": "#0077b5",
  pinterest: "#bd081c",
  "pinterest-p": "#bd081c",
  tiktok: "#000000",
  whatsapp: "#25d366",
  github: "#333333",
  dribbble: "#ea4c89",
  behance: "#1769ff",
  vimeo: "#1ab7ea",
  "vimeo-v": "#1ab7ea",
  telegram: "#2ca5e0",
  reddit: "#ff4500",
  snapchat: "#fffc00",
  spotify: "#2ebd59",
  discord: "#5865f2",
  threads: "#000000",
  "square-x-twitter": "#000000",
};

/** W-1024: Font Awesome icon names Elementor's Social Icons use → EmVB's Social link networks. */
const SOCIAL_FROM_FA: Record<string, string> = {
  facebook: "facebook",
  "facebook-f": "facebook",
  "square-facebook": "facebook",
  instagram: "instagram",
  "square-instagram": "instagram",
  twitter: "x",
  "x-twitter": "x",
  "square-x-twitter": "x",
  "square-twitter": "x",
  linkedin: "linkedin",
  "linkedin-in": "linkedin",
  youtube: "youtube",
  "square-youtube": "youtube",
  tiktok: "tiktok",
  bluesky: "bluesky",
  mastodon: "mastodon",
  threads: "threads",
  "square-threads": "threads",
  github: "github",
  "square-github": "github",
  pinterest: "pinterest",
  "pinterest-p": "pinterest",
  "square-pinterest": "pinterest",
  whatsapp: "whatsapp",
  "square-whatsapp": "whatsapp",
  discord: "discord",
  twitch: "twitch",
  reddit: "reddit",
  "reddit-alien": "reddit",
  dribbble: "dribbble",
  behance: "behance",
  telegram: "telegram",
  "telegram-plane": "telegram",
  spotify: "spotify",
  envelope: "email",
  rss: "rss",
  globe: "website",
};

/**
 * W-1024: Elementor's Social Icons → Social icons, one Social link per profile. Elementor's
 * default colours are the brands', so they stay brand colours; custom ones become the badge
 * colour. A network EmVB has no preset for (Vimeo, Snapchat…) keeps the whole widget as icons.
 */
const socialIcons: Widget = (s, ctx, el, env, raw) => {
  const items = (Array.isArray(s["social_icon_list"]) ? s["social_icon_list"] : [])
    .filter(isRecord)
    .slice(0, 20);
  const networks = items.map((item) => {
    const value = item["social_icon"] ?? item["social"];
    const name = isRecord(value) ? str(value["value"]) : str(value);
    return SOCIAL_FROM_FA[(name ?? "").replace(/^fa[brs]? fa-/, "").replace(/^fa-/, "")];
  });
  if (items.length === 0 || networks.some((network) => !network))
    return socialIconsAsIcons(s, ctx, el, env, raw);
  const links = items.map((item, i) => {
    const linkProps = href(item["link"], ctx);
    return node(ctx, "social-link", {
      network: networks[i],
      href: linkProps.href ?? "",
      ...(linkProps.newTab ? { newTab: true } : {}),
    });
  });
  const shape = str(s["shape"]) ?? "rounded";
  const custom = str(s["icon_color"]) === "custom";
  const style: Style = {};
  const size = slider(s["icon_size"]);
  if (size && size.unit === "px") style.fontSize = { value: Math.round(size.value), unit: "px" };
  const gap = slider(s["icon_spacing"]);
  if (gap) style.gap = gap;
  const where = textAlign(s["align"]);
  if (where)
    style.justifyContent =
      where === "left" ? "flex-start" : where === "right" ? "flex-end" : "center";
  if (custom) {
    const badge = colorAt(s, "icon_primary_color", ctx);
    if (badge) style.color = badge;
    if (colorAt(s, "icon_secondary_color", ctx))
      ctx.note("approximated", el, "Social icons draw their icons in white on the badge colour.");
  }
  return [
    node(
      ctx,
      "social-icons",
      {
        shape: shape === "circle" || shape === "square" ? shape : "rounded",
        ...(custom ? {} : { brandColors: true }),
      },
      { children: links, ...(Object.keys(style).length > 0 ? { style } : {}) },
    ),
  ];
};

/** Before W-1024, and still for networks without a preset: each icon an Icon on its colour. */
const socialIconsAsIcons: Widget = (s, ctx, el) => {
  const items = Array.isArray(s["social_icon_list"]) ? s["social_icon_list"].slice(0, 50) : [];
  const size = slider(s["icon_size"]);
  const px = size && size.unit === "px" ? Math.round(size.value) : 25;
  const shape = str(s["shape"]) ?? "rounded";
  const custom = str(s["icon_color"]) === "custom";
  const icons: N[] = [];
  for (const raw of items) {
    if (!isRecord(raw) || ctx.overBudget) continue;
    const icon = iconOf(raw["social_icon"] ?? raw["social"], ctx, el);
    if (!icon) continue;
    const linkProps = href(raw["link"], ctx);
    const pad = slider(s["icon_padding"]) ?? { value: 0.5, unit: "em" as const };
    const brand = icon.name.replace(/^square-/, "");
    icons.push(
      node(
        ctx,
        "icon",
        {
          iconId: icon.iconId,
          iconSvg: icon.iconSvg,
          size: px,
          title: humanize(brand),
          ...linkProps,
          ...(linkProps.href ? {} : { decorative: true }),
        },
        {
          style: {
            color: (custom ? colorAt(s, "icon_secondary_color", ctx) : undefined) ?? "#ffffff",
            backgroundColor:
              (custom ? colorAt(s, "icon_primary_color", ctx) : undefined) ??
              BRANDS[icon.name] ??
              BRANDS[brand] ??
              "#69727d",
            paddingTop: pad,
            paddingRight: pad,
            paddingBottom: pad,
            paddingLeft: pad,
            borderRadius:
              shape === "circle"
                ? { value: 50, unit: "%" }
                : shape === "square"
                  ? { value: 0, unit: "px" }
                  : { value: 10, unit: "%" },
          },
        },
      ),
    );
  }
  if (icons.length === 0) return [];
  const where = textAlign(s["align"]) ?? "center";
  return [
    box(ctx, icons, {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: slider(s["icon_spacing"]) ?? { value: 5, unit: "px" },
      justifyContent: where === "left" ? "flex-start" : where === "right" ? "flex-end" : "center",
    }),
  ];
};

/** Classic Tabs / Accordion / Toggle: `tabs: [{ tab_title, tab_content }]`. */
function tabItems(s: Settings): { title: string; content: unknown }[] {
  const list = Array.isArray(s["tabs"]) ? s["tabs"] : [];
  return list
    .filter(isRecord)
    .map((t) => ({ title: plain(t["tab_title"]).text, content: t["tab_content"] }))
    .filter((t) => t.title);
}

const tabs: Widget = (s, ctx, el) => {
  const items = tabItems(s);
  if (items.length === 0) return [];
  if (items.length > MAX_TABS) ctx.note("skipped", el, `Only the first ${MAX_TABS} tabs are kept.`);
  const panels = items
    .slice(0, MAX_TABS)
    .map((t) =>
      node(
        ctx,
        "tab-panel",
        { label: short(t.title) },
        { children: htmlNodes(t.content, ctx, el) },
      ),
    );
  return [node(ctx, "tabs", {}, { children: panels })];
};

const accordion =
  (firstOpen: boolean): Widget =>
  (s, ctx, el) => {
    const items = tabItems(s).slice(0, 100);
    if (items.length === 0) return [];
    const children = items.map((t, i) =>
      node(
        ctx,
        "accordion-item",
        { summary: t.title.slice(0, 200), ...(firstOpen && i === 0 ? { open: true } : {}) },
        { children: htmlNodes(t.content, ctx, el) },
      ),
    );
    return [node(ctx, "accordion", {}, { children })];
  };

/** Nested Tabs / Nested Accordion: titles in settings, one child container per item. */
const nestedTabs: Widget = (s, ctx, el, env, raw) => {
  const titles = (Array.isArray(s["tabs"]) ? s["tabs"] : [])
    .filter(isRecord)
    .map((t) => plain(t["tab_title"]).text || "Tab");
  const kids = Array.isArray(raw["elements"]) ? raw["elements"] : [];
  if (titles.length > MAX_TABS)
    ctx.note("skipped", el, `Only the first ${MAX_TABS} tabs are kept.`);
  const panels = titles
    .slice(0, MAX_TABS)
    .map((title, i) =>
      node(
        ctx,
        "tab-panel",
        { label: short(title) },
        { children: env.walk([kids[i]], { ...env, parentRow: false, depth: env.depth + 2 }) },
      ),
    );
  return panels.length > 0 ? [node(ctx, "tabs", {}, { children: panels })] : [];
};

const nestedAccordion: Widget = (s, ctx, _el, env, raw) => {
  const titles = (Array.isArray(s["items"]) ? s["items"] : [])
    .filter(isRecord)
    .map((t) => plain(t["item_title"]).text || "Item");
  const kids = Array.isArray(raw["elements"]) ? raw["elements"] : [];
  const items = titles
    .slice(0, 100)
    .map((title, i) =>
      node(
        ctx,
        "accordion-item",
        { summary: title.slice(0, 200) },
        { children: env.walk([kids[i]], { ...env, parentRow: false, depth: env.depth + 2 }) },
      ),
    );
  return items.length > 0 ? [node(ctx, "accordion", {}, { children: items })] : [];
};

// ---------------------------------------------------------------------------------------------
// Pro and theme-builder widgets (best effort)

const FIELD_TYPES: Record<string, string> = {
  text: "text-input",
  email: "text-input",
  url: "text-input",
  tel: "text-input",
  number: "text-input",
  date: "text-input",
  time: "text-input",
  password: "text-input",
  textarea: "textarea",
  select: "select",
  radio: "radio",
  checkbox: "checkbox",
  acceptance: "checkbox",
};

const form: Widget = (s, ctx, el) => {
  const fields = Array.isArray(s["form_fields"]) ? s["form_fields"].slice(0, 100) : [];
  const children: N[] = [];
  const names = new Set<string>();
  fields.forEach((raw, i) => {
    if (!isRecord(raw)) return;
    const type = str(raw["field_type"]) ?? "text";
    const nodeType = FIELD_TYPES[type];
    if (!nodeType) {
      ctx.note("skipped", el, `Form field type "${type}" was left out.`);
      return;
    }
    let name = str(raw["custom_id"]) ?? "";
    if (!FIELD_NAME_PATTERN.test(name) || name.length > 80 || names.has(name))
      name = `field_${i + 1}`;
    names.add(name);
    const label =
      plain(raw["field_label"]).text.slice(0, 200) ||
      (type === "acceptance" ? plain(raw["acceptance_text"]).text.slice(0, 200) : "");
    const placeholder = plain(raw["placeholder"]).text.slice(0, 200);
    children.push(
      node(ctx, nodeType, {
        field: name,
        ...(label ? { label } : {}),
        ...(placeholder && nodeType !== "checkbox" ? { placeholder } : {}),
      }),
    );
  });
  const label = plain(s["button_text"]).text.slice(0, 80) || "Send";
  children.push(node(ctx, "submit", { label }));
  ctx.note(
    "approximated",
    el,
    "Connect each imported form to a form in the forms plugin; field options and email actions weren't imported.",
  );
  return [
    node(ctx, "form", { formId: "" }, { style: { gap: { value: 10, unit: "px" } }, children }),
  ];
};

/** W-1026: a site menu's links as Menu items (three levels, as the Menu shows). */
function menuItems(ctx: ImportContext, links: readonly MenuLink[], depth = 0): N[] {
  return links.slice(0, 50).map((entry) =>
    node(
      ctx,
      "menu-item",
      {
        text: short(entry.text || "Link", 200),
        ...(entry.href ? { href: entry.href.slice(0, 2000) } : {}),
        ...(entry.newTab ? { newTab: true } : {}),
      },
      { children: depth < 2 && entry.children ? menuItems(ctx, entry.children, depth + 1) : [] },
    ),
  );
}

/**
 * Elementor's Nav Menu → a Menu. W-1026: filled with the site menu's links when the dialog
 * found it (EmDash's WordPress import keeps the menu's name); otherwise empty, with a note.
 */
const navMenu: Widget = (s, ctx, el) => {
  const name = str(s["menu"])?.trim();
  const vertical = str(s["layout"]) === "vertical" || str(s["layout"]) === "dropdown";
  if (name) ctx.menus.add(name.slice(0, 100));
  const links = name ? ctx.menuOf?.(name) : undefined;
  if (!links || links.length === 0) {
    ctx.note(
      "approximated",
      el,
      `The WordPress menu${name ? ` "${name.slice(0, 40)}"` : ""} isn't on this site; add its links to the Menu in the editor.`,
    );
  }
  return [
    node(
      ctx,
      "menu",
      { direction: vertical ? "column" : "row" },
      { children: links ? menuItems(ctx, links) : [] },
    ),
  ];
};

/**
 * Elementor's Mega Menu → a Menu whose items hold their dropdown content. W-1069: Elementor's
 * dropdowns span the menu unless Content width is Fit to content, so those panels are wide. The
 * content stays in the item (Elementor keeps it in the widget, not in a shared template), so it
 * isn't turned into a Section theme part.
 */
const megaMenu: Widget = (s, ctx, _el, env, raw) => {
  const items = (Array.isArray(s["menu_items"]) ? s["menu_items"] : [])
    .filter(isRecord)
    .slice(0, 50);
  const kids = Array.isArray(raw["elements"]) ? raw["elements"] : [];
  const wide = str(s["content_width"]) !== "fit_to_content";
  const children = items.map((item, i) => {
    const text = plain(item["item_title"]).text || "Item";
    const panel =
      str(item["item_dropdown_content"]) === "yes"
        ? env.walk([kids[i]], { ...env, parentRow: false, depth: env.depth + 2 })
        : [];
    return node(
      ctx,
      "menu-item",
      {
        text: short(text),
        ...href(item["item_link"], ctx),
        ...(wide && panel.length > 0 ? { wide: true } : {}),
      },
      { children: panel },
    );
  });
  return [node(ctx, "menu", { direction: "row" }, { children })];
};

/** W-1049: Elementor's Call to Action → a Call to action: picture, title, text, button, ribbon. */
const callToAction: Widget = (s, ctx, el) => {
  const title = plain(s["title"]).text.slice(0, 200);
  if (!title) return [];
  const level = Number(/^h([2-6])$/.exec(str(s["title_tag"]) ?? "h2")?.[1] ?? 2);
  const bg = image(s["bg_image"]);
  if (bg) ctx.externalImage(bg.url);
  const layout = str(s["layout"]);
  const where =
    str(s["skin"]) === "cover"
      ? "behind"
      : layout === "left"
        ? "left"
        : layout === "right"
          ? "right"
          : "top";
  const target = href(s["link"], ctx);
  const btn = plain(s["button"]).text.slice(0, 80);
  const description = plain(s["description"]).text;
  const ribbon = plain(s["ribbon_title"]).text.slice(0, 30);
  ctx.note("approximated", el, "Call to Action boxes keep their content, not their hover effects.");
  const fill = colorAt(s, "background_color", ctx);
  return [
    node(
      ctx,
      "cta",
      {
        title,
        ...(level !== 3 ? { titleLevel: level } : {}),
        ...(description ? { text: short(description) } : {}),
        ...(bg ? { src: bg.url, alt: bg.alt ?? "" } : {}),
        layout: where,
        ...(btn && target.href ? { buttonText: btn } : {}),
        ...target,
        ...(ribbon ? { ribbon } : {}),
      },
      fill ? { style: { backgroundColor: fill } } : {},
    ),
  ];
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  dollar: "$",
  euro: "€",
  pound: "£",
  yen: "¥",
  rupee: "₹",
  franc: "₣",
  real: "R$",
  baht: "฿",
  krona: "kr",
  lira: "₺",
  peseta: "₧",
  peso: "₱",
  shekel: "₪",
  won: "₩",
  guilder: "ƒ",
};

/** W-1049: Elementor's Price Table → a Price table: price, sale price, features, button, ribbon. */
const priceTable: Widget = (s, ctx, el) => {
  const title = plain(s["heading"]).text.slice(0, 120);
  const price = plain(s["price"]).text.slice(0, 20);
  if (!title && !price) return [];
  const currency = (
    str(s["currency_symbol"]) === "custom"
      ? plain(s["currency_symbol_custom"]).text
      : (CURRENCY_SYMBOLS[str(s["currency_symbol"]) ?? "dollar"] ?? "")
  ).slice(0, 5);
  const regular = s["sale"] === "yes" ? plain(s["original_price"]).text.slice(0, 20) : "";
  const features = (Array.isArray(s["features_list"]) ? s["features_list"] : [])
    .filter(isRecord)
    .map((f) => plain(f["item_text"]).text.slice(0, 200))
    .filter(Boolean)
    .slice(0, 30);
  const sub = plain(s["sub_heading"]).text;
  const footer = plain(s["footer_additional_info"]).text;
  const description = [sub, footer].filter(Boolean).join("\n").slice(0, 500);
  const target = href(s["link"], ctx);
  const btn = plain(s["button_text"]).text.slice(0, 80);
  const ribbon = s["show_ribbon"] === "yes" ? plain(s["ribbon_title"]).text.slice(0, 30) : "";
  if (footer) ctx.note("approximated", el, "A price table's footer text joined its description.");
  const level = Number(/^h([2-6])$/.exec(str(s["heading_tag"]) ?? "h3")?.[1] ?? 3);
  return [
    node(ctx, "price-table", {
      title: title || price,
      ...(level !== 3 ? { titleLevel: level } : {}),
      ...(description ? { description } : {}),
      price: price || "0",
      ...(currency ? { currency } : {}),
      ...(plain(s["period"]).text ? { period: plain(s["period"]).text.slice(0, 40) } : {}),
      ...(regular ? { regularPrice: regular } : {}),
      ...(features.length > 0 ? { features } : {}),
      ...(btn && target.href ? { buttonText: btn, buttonHref: target.href } : {}),
      ...(target.newTab && btn ? { newTab: true } : {}),
      ...(s["show_ribbon"] === "yes" ? { featured: true, ...(ribbon ? { ribbon } : {}) } : {}),
    }),
  ];
};

/** W-1049: Elementor's Price List → a Price list, one item per row with its picture and link. */
const priceList: Widget = (s, ctx, el) => {
  const rows = (Array.isArray(s["price_list"]) ? s["price_list"] : []).filter(isRecord);
  if (rows.length > 50) ctx.note("skipped", el, "Price lists keep their first 50 items.");
  const items: N[] = [];
  for (const row of rows.slice(0, 50)) {
    const title = plain(row["title"]).text.slice(0, 120);
    if (!title) continue;
    const img = image(row["image"]);
    if (img) ctx.externalImage(img.url);
    const target = href(row["link"], ctx);
    const description = plain(row["item_description"]).text.slice(0, 500);
    items.push(
      node(ctx, "price-list-item", {
        title,
        price: plain(row["price"]).text.slice(0, 20),
        ...(description ? { description } : {}),
        ...(img ? { src: img.url, ...(img.alt ? { alt: img.alt } : {}) } : {}),
        ...target,
      }),
    );
  }
  return items.length > 0 ? [node(ctx, "price-list", {}, { children: items })] : [];
};

/** W-1049: Elementor's Flip Box → a Flip box: front and back, its direction and button. */
const flipBox: Widget = (s, ctx, el) => {
  const frontTitle = plain(s["title_text_a"]).text.slice(0, 200);
  const backTitle = plain(s["title_text_b"]).text.slice(0, 200);
  if (!frontTitle && !backTitle) return [];
  const frontText = plain(s["description_text_a"]).text;
  const backText = plain(s["description_text_b"]).text;
  const target = href(s["link"], ctx);
  const btn = plain(s["button_text"]).text.slice(0, 80);
  const direction = str(s["flip_direction"]);
  if (image(s["image"]) || isRecord(s["selected_icon"]))
    ctx.note("approximated", el, "A flip box's front image or icon was left out.");
  return [
    node(ctx, "flip-box", {
      frontTitle: frontTitle || backTitle,
      ...(frontText ? { frontText: short(frontText) } : {}),
      ...(backTitle ? { backTitle } : {}),
      ...(backText ? { backText: short(backText) } : {}),
      ...(btn && target.href ? { buttonText: btn, ...target } : {}),
      ...(direction === "left" || direction === "up" || direction === "down" ? { direction } : {}),
    }),
  ];
};

const blockquote: Widget = (s, ctx) => {
  const content = plain(s["blockquote_content"]).text;
  if (!content) return [];
  const author = plain(s["author_name"]).text;
  return [
    box(
      ctx,
      [
        node(
          ctx,
          "text",
          { text: short(content) },
          { style: { fontSize: { value: 1.2, unit: "em" } } },
        ),
        ...(author ? [node(ctx, "text", { text: short(`— ${author}`) })] : []),
      ],
      {
        gap: { value: 8, unit: "px" },
        borderStyle: "solid",
        borderLeftWidth: { value: 4, unit: "px" },
        paddingLeft: { value: 20, unit: "px" },
      },
    ),
  ];
};

/** Elementor's highlight shapes → the closest Animated headline mark. */
const HEADLINE_MARKERS: Record<string, "underline" | "circle" | "strike"> = {
  circle: "circle",
  curly: "underline",
  underline: "underline",
  double: "underline",
  double_underline: "underline",
  underline_zigzag: "underline",
  diagonal: "strike",
  strikethrough: "strike",
  x: "strike",
};

/** W-1049: Elementor's Animated Headline → an Animated headline with its mark or rotating words. */
const animatedHeadline: Widget = (s, ctx, el) => {
  const rotate = str(s["headline_style"]) === "rotate";
  const words = (str(s["rotating_text"]) ?? "")
    .split("\n")
    .map((w) => plain(w).text.slice(0, 120))
    .filter(Boolean);
  const highlight = (rotate ? words[0] : plain(s["highlighted_text"]).text)?.slice(0, 120) ?? "";
  const before = plain(s["before_text"]).text.slice(0, 200);
  const after = plain(s["after_text"]).text.slice(0, 200);
  if (!highlight && !before && !after) return [];
  const level = Number(/^h([1-6])$/.exec(str(s["tag"]) ?? "h3")?.[1] ?? 3);
  if (link(s["link"])) ctx.note("approximated", el, "An animated headline's link was left out.");
  const marker = HEADLINE_MARKERS[str(s["marker"]) ?? "circle"] ?? "underline";
  return [
    styled(
      node(ctx, "headline", {
        level,
        ...(before ? { before } : {}),
        highlight: highlight || before || after,
        ...(after && highlight ? { after } : {}),
        mark: rotate ? "none" : marker,
        ...(rotate && words.length > 1
          ? { rotate: words.slice(1, 11), rotating: true, turns: s["loop"] === "yes" ? 5 : 1 }
          : {}),
      }),
      deviceStyles(s, ctx, el, [
        typographyReader("title_typography", "primary"),
        textReader("title_color", "secondary", "alignment"),
      ]),
    ),
  ];
};

const toc: Widget = (s, ctx) => {
  const title = plain(s["title"]).text.slice(0, 80);
  return [node(ctx, "toc", title ? { title } : {})];
};

const postTitle: Widget = (s, ctx, el) => {
  const level = /^h([1-6])$/.exec(str(s["header_size"]) ?? "h1")?.[1];
  return [
    styled(
      node(ctx, "post-title", level ? { level: Number(level) } : {}),
      deviceStyles(s, ctx, el, [
        typographyReader("typography", "primary"),
        textReader("title_color", "primary"),
      ]),
    ),
  ];
};

const postInfo: Widget = (s, ctx, el) => {
  const items = (Array.isArray(s["icon_list"]) ? s["icon_list"] : []).filter(isRecord);
  const parts: N[] = [];
  for (const item of items) {
    const type = str(item["type"]);
    if (type === "author") parts.push(node(ctx, "post-author", {}));
    else if (type === "date") parts.push(node(ctx, "post-date", {}));
    else if (type) ctx.note("skipped", el, `Post info "${type}" was left out.`);
  }
  if (parts.length === 0) return [];
  return [
    box(ctx, parts, {
      flexDirection: str(s["view"]) === "traditional" ? "column" : "row",
      gap: { value: 12, unit: "px" },
    }),
  ];
};

const siteLogo: Widget = (s, ctx, el, env) => {
  const n = imageNode(ctx, el, s["custom_image"] ?? s["image"]);
  if (!n) {
    ctx.note(
      "skipped",
      el,
      "The site logo comes from WordPress settings; add your logo as an image.",
    );
    return [];
  }
  n["style"] = { maxWidth: { value: 100, unit: "%" } };
  return [align(n, s["align"], env, "center")];
};

/**
 * W-1018 carousel settings from an Elementor carousel-like widget: arrows and dots from
 * `navigation`, autoplay and its speed, looping.
 */
function carouselFrom(
  slides: N[],
  perView: number,
  s: Settings,
  ctx: ImportContext,
  el: string,
): N[] {
  if (slides.length === 0) return [];
  const navigation = str(s["navigation"]) ?? "both";
  const autoplay = str(s["autoplay"]);
  if (autoplay !== "yes" && autoplay !== "no")
    ctx.note(
      "approximated",
      el,
      "Carousels don't play by themselves unless you turn on Play automatically.",
    );
  const speed = num(s["autoplay_speed"]);
  return [
    node(
      ctx,
      "carousel",
      {
        perView: Math.min(4, Math.max(1, Math.round(perView))),
        ...(navigation === "both" || navigation === "arrows" ? { arrows: true } : {}),
        ...(navigation === "both" || navigation === "dots" ? { dots: true } : {}),
        ...(autoplay === "yes"
          ? {
              autoplay: true,
              ...(speed ? { interval: Math.min(30, Math.max(3, Math.round(speed / 1000))) } : {}),
            }
          : {}),
        ...(str(s["infinite"]) === "no" ? {} : { loop: true }),
      },
      { children: slides },
    ),
  ];
}

/** W-1049: Elementor's Slides → a Carousel, one slide per Elementor slide with its content. */
const slides: Widget = (s, ctx, el) => {
  const list = (Array.isArray(s["slides"]) ? s["slides"] : []).filter(isRecord);
  if (list.length > 20) ctx.note("skipped", el, "Carousels keep their first 20 slides.");
  const height = slider(s["slides_height"]) ?? { value: 400, unit: "px" as const };
  const out: N[] = [];
  for (const slide of list.slice(0, 20)) {
    const parts: N[] = [];
    const title = plain(slide["heading"]).text;
    if (title) parts.push(node(ctx, "heading", { text: short(title), level: 2 }));
    const text = plain(slide["description"]).text;
    if (text) parts.push(node(ctx, "text", { text: short(text) }));
    const btn = buttonNode(slide, ctx, el, { text: "button_text", link: "link" });
    if (btn) parts.push(btn);
    const style: Style = {
      minHeight: height,
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",
      gap: { value: 15, unit: "px" },
      color: "#ffffff",
    };
    const fill = color(slide["background_color"]);
    if (fill) style["backgroundColor"] = fill;
    const bg = image(slide["background_image"]);
    if (bg && !/[()\\\s"'`]/.test(bg.url)) {
      style["backgroundImage"] = bg.url;
      style["backgroundSize"] = "cover";
    }
    out.push(node(ctx, "carousel-slide", {}, { children: [box(ctx, parts, style)] }));
  }
  return carouselFrom(out, 1, s, ctx, el);
};

/** W-1049: Elementor's Testimonial Carousel and Reviews → a Carousel of Testimonials. */
const testimonialCarousel: Widget = (s, ctx, el, env, raw) => {
  const list = (Array.isArray(s["slides"]) ? s["slides"] : []).filter(isRecord);
  if (list.length > 20) ctx.note("skipped", el, "Carousels keep their first 20 slides.");
  const out: N[] = [];
  for (const slide of list.slice(0, 20)) {
    const quote = testimonial(
      {
        testimonial_content: slide["content"],
        testimonial_name: slide["name"],
        testimonial_job: slide["title"],
        testimonial_image: slide["image"],
      },
      ctx,
      el,
      env,
      raw,
    );
    if (quote.length > 0) out.push(node(ctx, "carousel-slide", {}, { children: quote }));
  }
  return carouselFrom(out, num(s["slides_per_view"]) ?? 1, s, ctx, el);
};

/** Elementor's Countdown time (site time, no zone) as a Countdown target in UTC. */
function countdownTarget(value: unknown): string | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(str(value) ?? "");
  return m ? `${m[1]}T${m[2]}:${m[3]}Z` : undefined;
}

/** W-1049: Elementor's Countdown (due date) → a live Countdown with its ending action. */
const countdown: Widget = (s, ctx, el) => {
  if (str(s["countdown_type"]) === "evergreen") {
    ctx.note("skipped", el, "Evergreen countdowns (a timer per visitor) weren't imported.");
    return [];
  }
  const target = countdownTarget(s["due_date"]);
  if (!target) return [];
  ctx.note(
    "approximated",
    el,
    "Countdown dates have no time zone in Elementor; they were read as UTC. Check the time.",
  );
  const actions = Array.isArray(s["expire_actions"]) ? s["expire_actions"].map(String) : [];
  const message = plain(s["message_after_expire"]).text.slice(0, 200);
  const redirect = href(s["expire_redirect_url"], ctx).href;
  const expired = actions.includes("hide")
    ? { expired: "hide" }
    : redirect
      ? { expired: "link", expiredHref: redirect, ...(message ? { expiredText: message } : {}) }
      : message
        ? { expiredText: message }
        : {};
  if (actions.includes("redirect"))
    ctx.note("approximated", el, "A countdown that redirected now shows a link instead.");
  return [
    node(ctx, "countdown", {
      target,
      ticking: true,
      ...(s["show_seconds"] === "" || s["show_seconds"] === "no" ? { hideSeconds: true } : {}),
      ...expired,
    }),
  ];
};

/** Elementor's share buttons → EmVB's Share link services. */
const SHARE_FROM_ELEMENTOR: Record<string, string> = {
  facebook: "facebook",
  twitter: "x",
  "x-twitter": "x",
  linkedin: "linkedin",
  whatsapp: "whatsapp",
  telegram: "telegram",
  reddit: "reddit",
  threads: "threads",
  bluesky: "bluesky",
  email: "email",
};

/** W-1049: Elementor's Share Buttons → Share buttons with the services EmVB has. */
const shareButtons: Widget = (s, ctx, el) => {
  const list = (Array.isArray(s["share_buttons"]) ? s["share_buttons"] : []).filter(isRecord);
  const networks = list.map((b) => SHARE_FROM_ELEMENTOR[str(b["button"]) ?? ""]);
  if (networks.some((n) => !n))
    ctx.note("skipped", el, "Share buttons for services EmVB has no link for were left out.");
  const links = [...new Set(networks.filter((n): n is string => Boolean(n)))]
    .slice(0, 12)
    .map((network) => node(ctx, "share-link", { network }));
  if (links.length === 0) return [];
  const shape = str(s["shape"]);
  return [
    node(
      ctx,
      "share-buttons",
      {
        shape: shape === "circle" || shape === "rounded" ? shape : "square",
        ...(str(s["color_source"]) === "custom" ? {} : { brandColors: true }),
      },
      { children: links },
    ),
  ];
};

/** One hotspot offset (Elementor's slider in %). */
const offset = (value: unknown): number | undefined => {
  const n = num(isRecord(value) ? value["size"] : value);
  return n === undefined ? undefined : Math.min(100, Math.max(0, Math.round(n * 100) / 100));
};

/** W-1049: Elementor's Hotspot → Hotspots: its picture and a marker per hotspot, per device. */
const hotspotWidget: Widget = (s, ctx, el) => {
  const img = image(s["image"]);
  if (!img) return [];
  ctx.externalImage(img.url);
  const list = (Array.isArray(s["hotspot"]) ? s["hotspot"] : []).filter(isRecord);
  if (list.length > 20) ctx.note("skipped", el, "Hotspots keep their first 20 markers.");
  const markers = list.slice(0, 20).map((spot, i) => {
    const title = plain(spot["hotspot_label"]).text.slice(0, 120) || `Point ${i + 1}`;
    const text = plain(spot["hotspot_tooltip_content"]).text.slice(0, 1000);
    const at = (key: string) => offset(spot[key]);
    const place: Record<string, number> = {};
    for (const [prop, key] of [
      ["xTablet", "hotspot_offset_x_tablet"],
      ["yTablet", "hotspot_offset_y_tablet"],
      ["xMobile", "hotspot_offset_x_mobile"],
      ["yMobile", "hotspot_offset_y_mobile"],
    ] as const) {
      const v = at(key);
      if (v !== undefined) place[prop] = v;
    }
    return node(ctx, "hotspot", {
      title,
      ...(text ? { text } : {}),
      x: at("hotspot_offset_x") ?? 50,
      y: at("hotspot_offset_y") ?? 50,
      ...place,
    });
  });
  return [
    node(
      ctx,
      "hotspots",
      { src: img.url, alt: img.alt ?? altFromUrl(img.url) },
      { children: markers },
    ),
  ];
};

const codeHighlight: Widget = (s, ctx, el) => {
  const code = str(s["code"]) ?? "";
  if (!code.trim()) return [];
  ctx.note("approximated", el, "Code blocks became plain monospace text, without highlighting.");
  return splitLong(
    stripControl(code.replace(/\r\n?/g, "\n").replace(/\t/g, "  ")),
    MAX_TEXT_LENGTH,
  ).map((part) =>
    node(
      ctx,
      "text",
      { text: part, tag: "div" },
      { style: { fontFamily: "ui-monospace, monospace" } },
    ),
  );
};

const audio: Widget = (s, ctx, el) => {
  const linkProps = href(s["link"], ctx);
  ctx.note("approximated", el, "Audio players became a link.");
  return linkProps.href ? [node(ctx, "link", { text: "Listen", ...linkProps })] : [];
};

const textPath: Widget = (s, ctx, el) => {
  const text = plain(s["text"]).text;
  ctx.note("approximated", el, "Text on a path is shown as straight text.");
  return text ? [node(ctx, "text", { text: short(text) })] : [];
};

const skip =
  (message: string, kind: "skipped" | "unmapped" = "skipped"): Widget =>
  (_s, ctx, el) => {
    ctx.note(kind, el, message);
    return [];
  };

const LOOPS = "Post lists and loops weren't imported; rebuild them with EmVB's Loop element.";

export const WIDGETS: Record<string, Widget> = {
  heading,
  "text-editor": textEditor,
  image: imageWidget,
  button,
  spacer,
  divider,
  icon: iconWidget,
  "icon-box": iconBox,
  "image-box": imageBox,
  "icon-list": iconList,
  video,
  counter,
  progress,
  testimonial,
  "star-rating": starRating,
  alert,
  html,
  "menu-anchor": menuAnchor,
  google_maps: googleMaps,
  "image-gallery": imageGallery,
  gallery: proGallery,
  "image-carousel": imageCarousel,
  "media-carousel": mediaCarousel,
  "social-icons": socialIcons,
  tabs,
  accordion: accordion(true),
  toggle: accordion(false),
  "nested-tabs": nestedTabs,
  "nested-accordion": nestedAccordion,
  form,
  "nav-menu": navMenu,
  "mega-menu": megaMenu,
  "call-to-action": callToAction,
  "price-table": priceTable,
  "price-list": priceList,
  "flip-box": flipBox,
  blockquote,
  "animated-headline": animatedHeadline,
  "table-of-contents": toc,
  "theme-post-title": postTitle,
  "theme-page-title": postTitle,
  "theme-archive-title": postTitle,
  "theme-post-excerpt": (_s, ctx) => [node(ctx, "post-excerpt", {})],
  "theme-post-content": (_s, ctx) => [node(ctx, "post-content", {})],
  "theme-post-featured-image": (s, ctx, _el, env) => [
    align(
      node(ctx, "post-image", {}, { style: { maxWidth: { value: 100, unit: "%" } } }),
      s["align"],
      env,
      "center",
    ),
  ],
  "post-info": postInfo,
  "theme-site-logo": siteLogo,
  slides,
  "testimonial-carousel": testimonialCarousel,
  reviews: testimonialCarousel,
  "code-highlight": codeHighlight,
  audio,
  "text-path": textPath,
  shortcode: (s, ctx, el) => {
    ctx.note(
      "skipped",
      el,
      `The shortcode ${plain(s["shortcode"]).text.slice(0, 60) || ""} needs WordPress and was left out.`.replace(
        "  ",
        " ",
      ),
    );
    return [];
  },
  "theme-site-title": skip("The site title comes from WordPress settings; add it as a Heading."),
  "read-more": skip("WordPress's Read More tag has no EmVB equivalent."),
  sidebar: skip("WordPress sidebars weren't imported."),
  countdown,
  "share-buttons": shareButtons,
  "search-form": searchForm,
  login: skip("Login forms weren't imported."),
  lottie: skip("Lottie animations weren't imported."),
  hotspot: hotspotWidget,
  "paypal-button": skip("PayPal buttons weren't imported."),
  "progress-tracker": skip("Reading progress bars weren't imported."),
  posts: skip(LOOPS),
  "archive-posts": skip(LOOPS),
  "loop-grid": skip(LOOPS),
  "loop-carousel": skip(LOOPS),
  portfolio: skip(LOOPS),
  "post-navigation": skip("Post navigation wasn't imported."),
  "post-comments": skip("Comments weren't imported."),
  "author-box": skip("Author boxes weren't imported; use Post author."),
};

// ---------------------------------------------------------------------------------------------
// Third-party widgets: rebuilt from their text, images and buttons

/** Elementor 4 stores `{ $$type, value }`; unwraps to the plain value. */
export function unwrap(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (isRecord(value) && "$$type" in value) return unwrap(value["value"], depth + 1);
  return value;
}

const TITLE_KEY = /(^|_)(title|heading|headline|title_text|main_title)$/;
const TEXT_KEY =
  /(^|_)(description|content|text|editor|desc|paragraph|sub_?title|subheading|excerpt)$/;
const IMAGE_KEY = /(^|_)(image|img|photo|picture|logo|thumbnail)$/;
const BUTTON_TEXT_KEY = /(^|_)(btn|button)(_text|_label)?$/;
const SETTING_NOISE =
  /(color|typography|_size|align|_width|_height|padding|margin|border|shadow|_position|_icon|animation|css|_id$|_class|^_)/;

export function genericWidget(type: string, s: Settings, ctx: ImportContext, el: string): N[] {
  const out: N[] = [];
  let title: string | undefined;
  let buttonText: string | undefined;
  let buttonLink: unknown;
  const level = Number(
    /^h([1-6])$/.exec(str(unwrap(s["tag"])) ?? str(unwrap(s["header_size"])) ?? "")?.[1] ?? 2,
  );
  for (const [key, rawValue] of Object.entries(s).slice(0, 300)) {
    if (ctx.overBudget) break;
    const value = unwrap(rawValue);
    if (SETTING_NOISE.test(key) && !IMAGE_KEY.test(key)) continue;
    if (IMAGE_KEY.test(key) && isRecord(value)) {
      const src = unwrap(
        isRecord(value["src"])
          ? ((value["src"] as Settings)["value"] ?? value["src"])
          : value["url"],
      );
      const url = isRecord(src) ? unwrap(src["url"]) : src;
      const n = imageNode(ctx, el, { url: str(url), alt: str(unwrap(value["alt"])) });
      if (n) {
        n["style"] = { maxWidth: { value: 100, unit: "%" } };
        out.push(n);
      }
      continue;
    }
    if (typeof value !== "string" || !value.trim()) continue;
    if (BUTTON_TEXT_KEY.test(key)) {
      buttonText ??= value;
      continue;
    }
    if (/(^|_)(link|url|btn_link|button_link)$/.test(key)) {
      buttonLink ??= value;
      continue;
    }
    if (!title && TITLE_KEY.test(key)) {
      title = plain(value).text;
      if (title) out.push(node(ctx, "heading", { text: short(title), level }));
      continue;
    }
    if (TEXT_KEY.test(key)) out.push(...htmlNodes(value, ctx, el));
  }
  if (!buttonLink) {
    for (const [key, rawValue] of Object.entries(s)) {
      if (/(^|_)link$/.test(key) && isRecord(unwrap(rawValue))) {
        const value = unwrap(rawValue) as Settings;
        const dest = unwrap(value["destination"]);
        buttonLink = isRecord(dest) ? unwrap(dest["value"]) : (str(dest) ?? value["url"]);
        break;
      }
    }
  }
  if (buttonText) {
    const btn = buttonNode({ text: buttonText, link: link(buttonLink) ?? buttonLink }, ctx, el, {
      text: "text",
      link: "link",
    });
    if (btn) out.push(btn);
  }
  if (out.length === 0) {
    ctx.note(
      "unmapped",
      el,
      `Widget "${type}" has no EmVB match and no text to keep; it was left out.`,
    );
    return [];
  }
  ctx.note(
    "unmapped",
    el,
    `Widget "${type}" isn't known to EmVB; its text, images and buttons were kept in a plain layout.`,
  );
  return one(ctx, out, { value: 12, unit: "px" });
}
