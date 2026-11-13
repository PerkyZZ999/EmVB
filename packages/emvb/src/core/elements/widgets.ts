/**
 * The 1.2 widgets: elements built from plain markup and CSS. Each one renders
 * without script; the few interactive extras are opt-in runtimes.
 */
import type {
  AlertNode,
  IconBoxNode,
  ImageBoxNode,
  LayoutNode,
  RatingNode,
  CarouselNode,
  CarouselSlideNode,
  GalleryImageNode,
  GalleryNode,
  SocialIconsNode,
  SocialLinkNode,
  TestimonialNode,
} from "../schema/layout.ts";
import {
  ALERT_VARIANTS,
  MAX_RATING,
  type MEDIA_BOX_POSITIONS,
  SOCIAL_NETWORKS,
} from "../schema/layout.ts";
import { SOCIAL_ICONS } from "../icons/social.generated.ts";
import { sanitizeSvgMarkup } from "../sanitize/svg.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { iconGlyph } from "./icon-svg.ts";
import type { VNode } from "../render/vnode.ts";
import type { ElementDefinition } from "./definition.ts";

/** Star outline on a 24 × 24 grid. */
const STAR =
  "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26";

/** A number as people write it: 4.5, 4, 0.3 (at most one decimal). */
const ratingNumber = (value: number) => String(Math.round(value * 10) / 10);

/** W-1023: what screen readers hear for a Rating. */
function ratingLabel(props: RatingNode["props"]): string {
  const max = props.max ?? 5;
  const value = ratingNumber(Math.min(Math.max(props.value, 0), max));
  const template = props.label?.trim() || "Rated {value} out of {max}";
  return template.replaceAll("{value}", value).replaceAll("{max}", String(max));
}

/**
 * One star filled to `fraction` (0 to 1): an empty star with the filled part over it. The filled
 * part is the same star cut by its viewBox, so a half star needs no ids, masks or styles.
 */
function star(size: number, fraction: number): VNode {
  const svg = (className: string, part: number, extra: Record<string, string>): VNode => ({
    tag: "svg",
    attrs: {
      xmlns: "http://www.w3.org/2000/svg",
      class: className,
      width: String(Math.round(size * part * 100) / 100),
      height: String(size),
      viewBox: `0 0 ${Math.round(24 * part * 1000) / 1000} 24`,
      fill: "currentColor",
      "aria-hidden": "true",
      focusable: "false",
      ...extra,
    },
    children: [{ tag: "polygon", attrs: { points: STAR }, children: [] }],
  });
  const parts: VNode[] = [svg("emvb-rating-empty", 1, { "fill-opacity": "0.25" })];
  if (fraction > 0) parts.push(svg("emvb-rating-fill", fraction, {}));
  return { tag: "span", attrs: { class: "emvb-rating-star" }, children: parts };
}

export const rating: ElementDefinition<RatingNode> = {
  baseCss:
    ".emvb-rating{display:inline-flex;gap:0.125em;line-height:0;color:inherit}.emvb-rating-star{position:relative;display:inline-block}.emvb-rating-star svg{display:block}.emvb-rating-fill{position:absolute;top:0;left:0}[dir=rtl] .emvb-rating-fill,.emvb-rating[dir=rtl] .emvb-rating-fill{left:auto;right:0;transform:scaleX(-1)}",
  defaults: () => ({ type: "rating", props: { value: 4.5, max: 5 } }),
  descriptor: {
    type: "rating",
    name: "Star rating",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "value",
        kind: "decimal",
        label: "Rating",
        min: 0,
        max: 5,
        maxProp: "max",
        message: "Enter a number from 0 up to the number of stars, such as 4.5.",
      },
      {
        key: "max",
        kind: "int",
        label: "Stars",
        optional: true,
        max: MAX_RATING,
        message: `From 1 to ${MAX_RATING} stars.`,
      },
      { key: "size", kind: "int", label: "Star size (px)", optional: true, min: 8, max: 128 },
      { key: "label", kind: "text", label: "Text for screen readers", optional: true },
    ],
  },
  build: (node, attrs) => ratingStars(node.props, attrs),
};

/** The stars of a rating as one named image (W-1023; a Testimonial's rating too, W-1022). */
function ratingStars(props: RatingNode["props"], attrs: Record<string, string>): VNode {
  const max = props.max ?? 5;
  const value = Math.min(Math.max(props.value, 0), max);
  const size = props.size ?? 20;
  const stars = Array.from({ length: max }, (_, i) =>
    star(size, Math.min(Math.max(value - i, 0), 1)),
  );
  return {
    tag: "div",
    attrs: { ...attrs, role: "img", "aria-label": ratingLabel(props) },
    children: stars,
  };
}

/** W-1025: the opt-in public scripts the 1.2 widgets use; a page loads only the ones it needs. */
export type WidgetRuntime = "alerts" | "carousel" | "lightbox";

/** The widget runtime one element needs, if any: only when it opts in. */
export function nodeRuntime(node: LayoutNode): WidgetRuntime | undefined {
  if (node.type === "alert" && (node as AlertNode).props.dismissible) return "alerts";
  if (node.type === "gallery" && (node as GalleryNode).props.lightbox) return "lightbox";
  if (node.type === "carousel") {
    const { arrows, dots, autoplay } = (node as CarouselNode).props;
    if (arrows || dots || autoplay) return "carousel";
  }
  return undefined;
}

const ALERT_LABELS: Record<AlertNode["props"]["variant"], string> = {
  info: "Information",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
};

/** Icon outlines on a 24 × 24 grid (stroke), one per variant. */
const ALERT_ICONS: Record<AlertNode["props"]["variant"], VNode[]> = {
  info: [
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" }, children: [] },
    { tag: "path", attrs: { d: "M12 16v-4M12 8h.01" }, children: [] },
  ],
  success: [
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" }, children: [] },
    { tag: "path", attrs: { d: "m9 12 2 2 4-4" }, children: [] },
  ],
  warning: [
    {
      tag: "path",
      attrs: { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" },
      children: [],
    },
    { tag: "path", attrs: { d: "M12 9v4M12 17h.01" }, children: [] },
  ],
  danger: [
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" }, children: [] },
    { tag: "path", attrs: { d: "m15 9-6 6M9 9l6 6" }, children: [] },
  ],
};

const strokeSvg = (className: string, size: number, children: VNode[]): VNode => ({
  tag: "svg",
  attrs: {
    xmlns: "http://www.w3.org/2000/svg",
    class: className,
    width: String(size),
    height: String(size),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  },
  children,
});

/** Text colour, background and border per variant; every pair is at least 7:1. */
const ALERT_COLORS: Record<AlertNode["props"]["variant"], [string, string, string]> = {
  info: ["#0b3d75", "#eaf2fd", "#b6d3f5"],
  success: ["#14532d", "#e9f7ef", "#b7e4c7"],
  warning: ["#5c3b00", "#fff7e0", "#f5d48a"],
  danger: ["#7f1d1d", "#fdecec", "#f5b5b5"],
};

export const alert: ElementDefinition<AlertNode> = {
  baseCss:
    ".emvb-alert{display:flex;gap:0.75em;align-items:flex-start;padding:0.875em 1em;border:1px solid;border-radius:6px}.emvb-alert[hidden]{display:none}.emvb-alert-icon{flex:none;margin-top:0.125em}.emvb-alert-body{flex:1;min-width:0}.emvb-alert-title{margin:0 0 0.25em;font-weight:600}.emvb-alert-text{margin:0;white-space:pre-line}.emvb-alert-dismiss{flex:none;display:inline-flex;margin:-0.25em -0.25em 0 0;padding:0.25em;border:0;border-radius:4px;background:none;color:inherit;cursor:pointer}.emvb-alert-dismiss:not([data-emvb-ready]){display:none}.emvb-alert-dismiss:focus-visible{outline:2px solid currentColor;outline-offset:2px}" +
    ALERT_VARIANTS.map((variant) => {
      const [color, background, border] = ALERT_COLORS[variant];
      return `.emvb-alert-${variant}{color:${color};background-color:${background};border-color:${border}}`;
    }).join(""),
  defaults: () => ({
    type: "alert",
    props: { variant: "info", title: "Heads up", text: "Something your visitors should know." },
  }),
  descriptor: {
    type: "alert",
    name: "Alert",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "variant",
        kind: "select",
        label: "Kind",
        options: ALERT_VARIANTS.map((value) => ({ value, label: ALERT_LABELS[value] })),
      },
      { key: "title", kind: "text", label: "Title", optional: true },
      { key: "text", kind: "textarea", label: "Text" },
      { key: "hideIcon", kind: "boolean", label: "Hide the icon", optional: true },
      { key: "dismissible", kind: "boolean", label: "Visitors can dismiss it", optional: true },
      {
        key: "dismissLabel",
        kind: "text",
        label: "Dismiss button name",
        optional: true,
        message: "What screen readers call the close button. Leave it empty for Dismiss.",
      },
    ],
  },
  build: (node, attrs) => {
    const { variant, title, text, hideIcon, dismissible, dismissLabel } = node.props;
    const body: VNode[] = [];
    if (title?.trim())
      body.push({ tag: "p", attrs: { class: "emvb-alert-title" }, children: [title] });
    if (text.trim()) body.push({ tag: "p", attrs: { class: "emvb-alert-text" }, children: [text] });
    const children: (VNode | string)[] = [];
    if (!hideIcon) children.push(strokeSvg("emvb-alert-icon", 20, ALERT_ICONS[variant]));
    children.push({ tag: "div", attrs: { class: "emvb-alert-body" }, children: body });
    if (dismissible) {
      children.push({
        tag: "button",
        attrs: {
          type: "button",
          class: "emvb-alert-dismiss",
          "data-emvb-alert-dismiss": "",
          "aria-label": dismissLabel?.trim() || "Dismiss",
        },
        children: [
          strokeSvg("emvb-alert-close", 16, [
            { tag: "path", attrs: { d: "M18 6 6 18M6 6l12 12" }, children: [] },
          ]),
        ],
      });
    }
    return {
      tag: "div",
      attrs: {
        ...attrs,
        class: `${attrs["class"] ?? ""} emvb-alert-${variant}`.trim(),
        role: "note",
      },
      children,
    };
  },
};

type MediaBoxProps = {
  title: string;
  titleLevel?: number | undefined;
  text: string;
  position?: (typeof MEDIA_BOX_POSITIONS)[number] | undefined;
  href?: string | undefined;
  newTab?: boolean | undefined;
};

/**
 * W-1020 / W-1021: the shared layout of an icon box and an image box: the media, then a heading
 * and text. With a safe link the title is the one link, stretched over the box so the whole box
 * is clickable while screen readers hear a single named link.
 */
function mediaBox(
  props: MediaBoxProps,
  attrs: Record<string, string>,
  media: VNode | undefined,
): VNode {
  const position = props.position ?? "top";
  const safe = props.href?.trim() ? sanitizeHref(props.href) : undefined;
  const title = props.title.trim()
    ? safe
      ? {
          tag: "a",
          attrs: {
            class: "emvb-media-box-link",
            href: safe,
            ...(props.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}),
          },
          children: [props.title],
        }
      : props.title
    : undefined;
  const content: VNode[] = [];
  if (title)
    content.push({
      tag: `h${props.titleLevel ?? 3}`,
      attrs: { class: "emvb-media-box-title" },
      children: [title],
    });
  if (props.text.trim())
    content.push({ tag: "p", attrs: { class: "emvb-media-box-text" }, children: [props.text] });
  const children: VNode[] = [];
  if (media)
    children.push({ tag: "div", attrs: { class: "emvb-media-box-media" }, children: [media] });
  children.push({ tag: "div", attrs: { class: "emvb-media-box-content" }, children: content });
  return {
    tag: "div",
    attrs: {
      ...attrs,
      class:
        `${attrs["class"] ?? ""} emvb-media-box emvb-media-box-${position}${safe ? " emvb-media-box-linked" : ""}`.trim(),
    },
    children,
  };
}

/** Base rules the icon box and image box share. */
const MEDIA_BOX_CSS =
  '.emvb-media-box{display:flex;flex-direction:column;gap:1em;min-width:0}.emvb-media-box-left{flex-direction:row;align-items:flex-start}.emvb-media-box-right{flex-direction:row-reverse;align-items:flex-start}.emvb-media-box-media{flex:none;line-height:0}.emvb-media-box-content{flex:1;min-width:0}.emvb-media-box-title{margin:0 0 0.5em;font-size:1.25em}.emvb-media-box-text{margin:0;white-space:pre-line}.emvb-media-box-linked{position:relative}.emvb-media-box-link{color:inherit;text-decoration:none}.emvb-media-box-link::after{content:"";position:absolute;inset:0}.emvb-media-box-link:focus-visible{outline:none}.emvb-media-box-linked:has(.emvb-media-box-link:focus-visible){outline:2px solid currentColor;outline-offset:4px}';

const POSITION_OPTIONS = [
  { value: "top", label: "Above" },
  { value: "left", label: "Before the text" },
  { value: "right", label: "After the text" },
];

/** The title, text, layout and link fields of an icon box and an image box. */
const MEDIA_BOX_FIELDS = [
  { key: "title", kind: "text" as const, label: "Title" },
  {
    key: "titleLevel",
    kind: "select" as const,
    label: "Title level",
    optional: true,
    options: [2, 3, 4, 5, 6].map((level) => ({ value: level, label: `H${level}` })),
  },
  { key: "text", kind: "textarea" as const, label: "Text" },
  {
    key: "position",
    kind: "select" as const,
    label: "Position",
    optional: true,
    options: POSITION_OPTIONS,
  },
  {
    key: "href",
    kind: "href" as const,
    label: "Link",
    optional: true,
    message: "Use a full URL such as https://example.com or a path such as /pricing.",
  },
  { key: "newTab", kind: "boolean" as const, label: "Open in a new tab", optional: true },
];

export const iconBox: ElementDefinition<IconBoxNode> = {
  baseCss: `${MEDIA_BOX_CSS}.emvb-icon-box .emvb-media-box-media svg{display:block;max-width:100%}`,
  defaults: () => ({
    type: "icon-box",
    props: {
      iconId: "star",
      title: "A clear benefit",
      text: "One or two sentences that explain it.",
    },
  }),
  descriptor: {
    type: "icon-box",
    name: "Icon box",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "iconId", kind: "icon", label: "Icon" },
      { key: "iconSize", kind: "int", label: "Icon size (px)", optional: true, min: 8, max: 512 },
      ...MEDIA_BOX_FIELDS,
    ],
  },
  build: (node, attrs) =>
    mediaBox(
      node.props,
      attrs,
      iconGlyph(node.props, node.props.iconSize ?? 48, { "aria-hidden": "true" }),
    ),
};

/** W-1021: the picture of an image box, or undefined when it has no safe address. */
function boxImage(props: ImageBoxNode["props"]): VNode | undefined {
  const src = props.src.trim() ? sanitizeMediaUrl(props.src.trim()) : undefined;
  if (!src) return undefined;
  return {
    tag: "img",
    attrs: {
      src,
      alt: props.decorative ? "" : props.alt,
      ...(props.width ? { width: String(props.width) } : {}),
      ...(props.height ? { height: String(props.height) } : {}),
      loading: "lazy",
      decoding: "async",
    },
    children: [],
  };
}

export const imageBox: ElementDefinition<ImageBoxNode> = {
  baseCss: `${MEDIA_BOX_CSS}.emvb-image-box .emvb-media-box-media img{display:block;width:100%;height:auto}.emvb-image-box.emvb-media-box-top .emvb-media-box-media{width:100%}.emvb-image-box:is(.emvb-media-box-left,.emvb-media-box-right) .emvb-media-box-media{flex-basis:40%;max-width:40%}.emvb-image-box.emvb-image-box-small:is(.emvb-media-box-left,.emvb-media-box-right) .emvb-media-box-media{flex-basis:25%;max-width:25%}.emvb-image-box.emvb-image-box-large:is(.emvb-media-box-left,.emvb-media-box-right) .emvb-media-box-media{flex-basis:60%;max-width:60%}.emvb-image-box.emvb-image-box-full:is(.emvb-media-box-left,.emvb-media-box-right) .emvb-media-box-media{flex-basis:100%;max-width:100%}`,
  defaults: () => ({
    type: "image-box",
    props: {
      src: "",
      alt: "Image",
      title: "A clear benefit",
      text: "One or two sentences that explain it.",
    },
  }),
  descriptor: {
    type: "image-box",
    name: "Image box",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "src", kind: "media", label: "Image" },
      { key: "alt", kind: "text", label: "Alt text" },
      { key: "decorative", kind: "boolean", label: "Decorative", optional: true },
      {
        key: "imageSize",
        kind: "select",
        label: "Image width beside the text",
        optional: true,
        options: [
          { value: "small", label: "Small (25%)" },
          { value: "medium", label: "Medium (40%)" },
          { value: "large", label: "Large (60%)" },
          { value: "full", label: "Full" },
        ],
      },
      ...MEDIA_BOX_FIELDS,
    ],
  },
  build: (node, attrs) => {
    const box = mediaBox(node.props, attrs, boxImage(node.props));
    const size = node.props.imageSize;
    if (size && size !== "medium")
      box.attrs["class"] = `${box.attrs["class"]} emvb-image-box-${size}`;
    return box;
  },
};

export const testimonial: ElementDefinition<TestimonialNode> = {
  baseCss: `${rating.baseCss}.emvb-testimonial{display:flex;flex-direction:column;gap:1em;margin:0}.emvb-testimonial-quote{margin:0;font-size:1.125em}.emvb-testimonial-quote p{margin:0;white-space:pre-line}.emvb-testimonial-caption{display:flex;align-items:center;gap:0.75em}.emvb-testimonial-photo{flex:none;width:48px;height:48px;border-radius:50%;object-fit:cover}.emvb-testimonial-who{display:flex;flex-direction:column}.emvb-testimonial-name{font-weight:600}.emvb-testimonial-role{opacity:0.8}.emvb-testimonial .emvb-rating{color:#b45309}`,
  defaults: () => ({
    type: "testimonial",
    props: {
      quote: "It changed how our team works. We ship pages in an afternoon now.",
      name: "Sam Rivera",
      role: "Head of Marketing",
    },
  }),
  descriptor: {
    type: "testimonial",
    name: "Testimonial",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "quote", kind: "textarea", label: "Quote" },
      { key: "name", kind: "text", label: "Name" },
      { key: "role", kind: "text", label: "Role or company", optional: true },
      { key: "src", kind: "media", label: "Photo" },
      {
        key: "rating",
        kind: "decimal",
        label: "Rating",
        optional: true,
        min: 0,
        max: 5,
        maxProp: "ratingMax",
        message: "Enter a number from 0 up to the number of stars, or leave it empty for none.",
      },
      {
        key: "ratingMax",
        kind: "int",
        label: "Stars",
        optional: true,
        max: MAX_RATING,
        message: `From 1 to ${MAX_RATING} stars.`,
      },
    ],
  },
  build: (node, attrs) => {
    const { quote, name, role, rating: value, ratingMax } = node.props;
    const children: VNode[] = [];
    if (value !== undefined)
      children.push(ratingStars({ value, max: ratingMax ?? 5 }, { class: "emvb-rating" }));
    children.push({
      tag: "blockquote",
      attrs: { class: "emvb-testimonial-quote" },
      children: [{ tag: "p", attrs: {}, children: [quote] }],
    });
    const src = node.props.src?.trim() ? sanitizeMediaUrl(node.props.src.trim()) : undefined;
    const caption: VNode[] = [];
    if (src)
      caption.push({
        tag: "img",
        attrs: {
          class: "emvb-testimonial-photo",
          src,
          alt: "",
          width: "48",
          height: "48",
          loading: "lazy",
          decoding: "async",
        },
        children: [],
      });
    const who: VNode[] = [];
    if (name.trim())
      who.push({ tag: "span", attrs: { class: "emvb-testimonial-name" }, children: [name] });
    if (role?.trim())
      who.push({ tag: "span", attrs: { class: "emvb-testimonial-role" }, children: [role] });
    if (who.length > 0)
      caption.push({ tag: "span", attrs: { class: "emvb-testimonial-who" }, children: who });
    if (caption.length > 0)
      children.push({
        tag: "figcaption",
        attrs: { class: "emvb-testimonial-caption" },
        children: caption,
      });
    return { tag: "figure", attrs, children };
  },
};

type Network = SocialLinkNode["props"]["network"];

/** W-1024: what screen readers call each network's link, unless the link has its own label. */
export const SOCIAL_NAMES: Record<Network, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  threads: "Threads",
  github: "GitHub",
  pinterest: "Pinterest",
  whatsapp: "WhatsApp",
  discord: "Discord",
  twitch: "Twitch",
  reddit: "Reddit",
  dribbble: "Dribbble",
  behance: "Behance",
  telegram: "Telegram",
  spotify: "Spotify",
  email: "Email",
  rss: "RSS feed",
  website: "Website",
};

/** W-1024: each network's own colour, used when Brand colours is on. */
export const SOCIAL_COLORS: Record<Network, string> = {
  facebook: "#1877f2",
  instagram: "#e4405f",
  x: "#000000",
  linkedin: "#0a66c2",
  youtube: "#ff0000",
  tiktok: "#000000",
  bluesky: "#1185fe",
  mastodon: "#6364ff",
  threads: "#000000",
  github: "#181717",
  pinterest: "#bd081c",
  whatsapp: "#25d366",
  discord: "#5865f2",
  twitch: "#9146ff",
  reddit: "#ff4500",
  dribbble: "#ea4c89",
  behance: "#1769ff",
  telegram: "#26a5e4",
  spotify: "#1db954",
  email: "#555555",
  rss: "#ee802f",
  website: "#555555",
};

/** A preset's icon as an aria-hidden SVG one em square. */
function socialSvg(network: Network): VNode | undefined {
  const icon = SOCIAL_ICONS[network];
  const svg = sanitizeSvgMarkup(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}">${icon.body}</svg>`,
  );
  if (!svg) return undefined;
  return {
    ...svg,
    attrs: {
      ...svg.attrs,
      class: "emvb-social-svg",
      fill: "currentColor",
      "aria-hidden": "true",
      focusable: "false",
    },
  };
}

export const socialIcons: ElementDefinition<SocialIconsNode> = {
  baseCss:
    ".emvb-social-icons{display:flex;flex-wrap:wrap;align-items:center;gap:0.5em;margin:0;padding:0;list-style:none;font-size:1.5em}.emvb-social-link{display:flex}.emvb-social-link>a,.emvb-social-link>span{display:inline-flex;align-items:center;justify-content:center;color:inherit;text-decoration:none}.emvb-social-svg{display:block;width:1em;height:1em}.emvb-social-brand.emvb-social-plain .emvb-social-link>*{color:var(--emvb-social,currentColor)}.emvb-social-icons:not(.emvb-social-plain) .emvb-social-link>*{width:2em;height:2em;background:var(--emvb-social,currentColor)}.emvb-social-icons:not(.emvb-social-plain) .emvb-social-svg{width:1.1em;height:1.1em;color:#fff}.emvb-social-circle .emvb-social-link>*{border-radius:50%}.emvb-social-rounded .emvb-social-link>*{border-radius:0.4em}.emvb-social-link>a:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-social-empty{opacity:0.4}" +
    SOCIAL_NETWORKS.map(
      (network) =>
        `.emvb-social-brand .emvb-social-${network}{--emvb-social:${SOCIAL_COLORS[network]}}`,
    ).join(""),
  defaults: () => ({ type: "social-icons", props: {}, children: [] }),
  descriptor: {
    type: "social-icons",
    name: "Social icons",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "label",
        kind: "text",
        label: "List name",
        optional: true,
        message: "What screen readers call the list. Leave it empty for Social media.",
      },
      {
        key: "shape",
        kind: "select",
        label: "Shape",
        optional: true,
        options: [
          { value: "plain", label: "Icon only" },
          { value: "circle", label: "Circle" },
          { value: "rounded", label: "Rounded square" },
          { value: "square", label: "Square" },
        ],
      },
      { key: "brandColors", kind: "boolean", label: "Brand colours", optional: true },
    ],
  },
  build: (node, attrs, children) => ({
    tag: "ul",
    attrs: {
      ...attrs,
      class:
        `${attrs["class"] ?? ""} emvb-social-${node.props.shape ?? "plain"}${node.props.brandColors ? " emvb-social-brand" : ""}`.trim(),
      "aria-label": node.props.label?.trim() || "Social media",
    },
    children,
  }),
};

export const socialLink: ElementDefinition<SocialLinkNode> = {
  baseCss: "",
  defaults: () => ({
    type: "social-link",
    props: { network: "facebook", href: "https://facebook.com/", newTab: true },
  }),
  descriptor: {
    type: "social-link",
    name: "Social link",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "network",
        kind: "select",
        label: "Network",
        options: SOCIAL_NETWORKS.map((value) => ({ value, label: SOCIAL_NAMES[value] })),
      },
      {
        key: "href",
        kind: "href",
        label: "Profile address",
        message: "Use a full URL such as https://instagram.com/yourname, or mailto: for email.",
      },
      {
        key: "label",
        kind: "text",
        label: "Name for screen readers",
        optional: true,
        message: "Leave it empty to use the network's name.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
    ],
  },
  build: (node, attrs) => {
    const { network, href, label, newTab } = node.props;
    const icon = socialSvg(network);
    const safe = href.trim() ? sanitizeHref(href) : undefined;
    const name = label?.trim() || SOCIAL_NAMES[network];
    const className =
      `${attrs["class"] ?? ""} emvb-social-${network}${safe ? "" : " emvb-social-empty"}`.trim();
    const inner: VNode = safe
      ? {
          tag: "a",
          attrs: {
            href: safe,
            "aria-label": name,
            ...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}),
          },
          children: icon ? [icon] : [],
        }
      : { tag: "span", attrs: { "aria-hidden": "true" }, children: icon ? [icon] : [] };
    return { tag: "li", attrs: { ...attrs, class: className }, children: [inner] };
  },
};

export const gallery: ElementDefinition<GalleryNode> = {
  baseCss:
    ".emvb-gallery{display:grid;gap:0.5em;margin:0;padding:0;list-style:none;grid-template-columns:repeat(var(--emvb-gallery-cols,3),minmax(0,1fr))}.emvb-gallery-image{margin:0;min-width:0}.emvb-gallery-image figure{margin:0}.emvb-gallery-image img{display:block;width:100%;height:auto}.emvb-gallery-grid .emvb-gallery-image img{aspect-ratio:1;object-fit:cover}.emvb-gallery-image figcaption{margin-top:0.25em;font-size:0.875em}.emvb-gallery-masonry{display:block;columns:var(--emvb-gallery-cols,3);column-gap:0.5em}.emvb-gallery-masonry .emvb-gallery-image{break-inside:avoid;margin-bottom:0.5em}.emvb-gallery-open{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in}.emvb-gallery-open:focus-visible{outline:2px solid currentColor;outline-offset:2px}" +
    [1, 2, 3, 4, 5, 6].map((n) => `.emvb-gallery-cols-${n}{--emvb-gallery-cols:${n}}`).join("") +
    "@media (max-width:1024px){.emvb-gallery:is(.emvb-gallery-cols-3,.emvb-gallery-cols-4,.emvb-gallery-cols-5,.emvb-gallery-cols-6){--emvb-gallery-cols:2}}@media (max-width:767px){.emvb-gallery{--emvb-gallery-cols:1}}" +
    ".emvb-lightbox{max-width:min(96vw,1400px);max-height:96vh;padding:0;border:0;background:#111;color:#fff}.emvb-lightbox::backdrop{background:rgb(0 0 0/0.85)}.emvb-lightbox-figure{margin:0;display:flex;flex-direction:column;align-items:center}.emvb-lightbox img{display:block;max-width:100%;max-height:calc(96vh - 4em);object-fit:contain}.emvb-lightbox-bar{display:flex;align-items:center;gap:0.5em;width:100%;padding:0.5em}.emvb-lightbox-caption{flex:1;text-align:center}.emvb-lightbox button{min-width:2.75em;min-height:2.75em;border:0;border-radius:4px;background:rgb(255 255 255/0.15);color:#fff;font:inherit;cursor:pointer}.emvb-lightbox button:focus-visible{outline:2px solid #fff;outline-offset:2px}",
  defaults: () => ({ type: "gallery", props: {}, children: [] }),
  descriptor: {
    type: "gallery",
    name: "Gallery",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "layout",
        kind: "select",
        label: "Layout",
        optional: true,
        options: [
          { value: "grid", label: "Grid of squares" },
          { value: "masonry", label: "Masonry" },
        ],
      },
      { key: "columns", kind: "int", label: "Columns", optional: true, max: 6 },
      {
        key: "lightbox",
        kind: "boolean",
        label: "Open pictures large (lightbox)",
        optional: true,
      },
      {
        key: "label",
        kind: "text",
        label: "Gallery name",
        optional: true,
        message: "What screen readers call the gallery, such as Project photos.",
      },
    ],
  },
  build: (node, attrs, children) => ({
    tag: "ul",
    attrs: {
      ...attrs,
      class:
        `${attrs["class"] ?? ""} emvb-gallery-${node.props.layout ?? "grid"} emvb-gallery-cols-${node.props.columns ?? 3}`.trim(),
      ...(node.props.label?.trim() ? { "aria-label": node.props.label.trim() } : {}),
      ...(node.props.lightbox ? { "data-emvb-lightbox": "" } : {}),
    },
    children,
  }),
};

export const galleryImage: ElementDefinition<GalleryImageNode> = {
  baseCss: "",
  defaults: () => ({ type: "gallery-image", props: { src: "", alt: "Image" } }),
  descriptor: {
    type: "gallery-image",
    name: "Gallery image",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "src", kind: "media", label: "Image" },
      { key: "alt", kind: "text", label: "Alt text" },
      { key: "decorative", kind: "boolean", label: "Decorative", optional: true },
      { key: "caption", kind: "text", label: "Caption", optional: true },
    ],
  },
  build: (node, attrs) => {
    const src = node.props.src.trim() ? sanitizeMediaUrl(node.props.src.trim()) : undefined;
    const caption = node.props.caption?.trim();
    const figure: VNode[] = [];
    if (src)
      figure.push({
        tag: "img",
        attrs: {
          src,
          alt: node.props.decorative ? "" : node.props.alt,
          ...(node.props.width ? { width: String(node.props.width) } : {}),
          ...(node.props.height ? { height: String(node.props.height) } : {}),
          loading: "lazy",
          decoding: "async",
        },
        children: [],
      });
    if (caption) figure.push({ tag: "figcaption", attrs: {}, children: [caption] });
    return { tag: "li", attrs, children: [{ tag: "figure", attrs: {}, children: figure }] };
  },
};

export const carousel: ElementDefinition<CarouselNode> = {
  baseCss:
    ".emvb-carousel{position:relative;min-width:0}.emvb-carousel-track{display:flex;gap:var(--emvb-carousel-gap,1em);overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scrollbar-width:thin}.emvb-carousel-track:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-carousel-slide{flex:0 0 calc((100% - (var(--emvb-carousel-per,1) - 1) * var(--emvb-carousel-gap,1em)) / var(--emvb-carousel-per,1));min-width:0;scroll-snap-align:start;display:flex;flex-direction:column}" +
    [1, 2, 3, 4].map((n) => `.emvb-carousel-per-${n}{--emvb-carousel-per:${n}}`).join("") +
    "@media (max-width:1024px){.emvb-carousel:is(.emvb-carousel-per-3,.emvb-carousel-per-4){--emvb-carousel-per:2}}@media (max-width:767px){.emvb-carousel{--emvb-carousel-per:1}}@media (prefers-reduced-motion:no-preference){.emvb-carousel-track{scroll-behavior:smooth}}" +
    '.emvb-carousel-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0.5em;margin-top:0.75em}.emvb-carousel-controls button{display:inline-flex;align-items:center;justify-content:center;min-width:2.75em;min-height:2.75em;padding:0 0.75em;border:1px solid currentColor;border-radius:999px;background:none;color:inherit;font:inherit;cursor:pointer}.emvb-carousel-controls button:disabled{opacity:0.4;cursor:default}.emvb-carousel-controls button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-carousel-dots{display:flex;gap:0.25em}.emvb-carousel-dots button{min-width:2.75em;padding:0}.emvb-carousel-dots button::before{content:"";width:0.6em;height:0.6em;border-radius:50%;background:currentColor;opacity:0.35}.emvb-carousel-dots button[aria-current=true]::before{opacity:1}',
  defaults: () => ({ type: "carousel", props: {}, children: [] }),
  descriptor: {
    type: "carousel",
    name: "Carousel",
    group: "layout",
    defaultTab: "content",
    fields: [
      {
        key: "label",
        kind: "text",
        label: "Carousel name",
        optional: true,
        message:
          "What screen readers call it, such as Customer stories. Leave it empty for Carousel.",
      },
      { key: "perView", kind: "int", label: "Slides shown at once", optional: true, max: 4 },
      { key: "arrows", kind: "boolean", label: "Previous and Next buttons", optional: true },
      { key: "dots", kind: "boolean", label: "Slide buttons (dots)", optional: true },
      { key: "loop", kind: "boolean", label: "Go round from the last slide", optional: true },
      { key: "autoplay", kind: "boolean", label: "Play automatically", optional: true },
      {
        key: "interval",
        kind: "int",
        label: "Seconds per slide",
        optional: true,
        min: 3,
        max: 30,
        message: "From 3 to 30 seconds. Leave it empty for 6.",
      },
    ],
  },
  build: (node, attrs, children) => {
    const { label, perView, arrows, dots, autoplay, interval, loop } = node.props;
    const total = children.length;
    // Each slide is named by its place unless it has its own name.
    const slides = children.map((slide, i) =>
      slide.attrs["aria-label"]
        ? slide
        : { ...slide, attrs: { ...slide.attrs, "aria-label": `${i + 1} of ${total}` } },
    );
    const options: Record<string, string> = {};
    if (arrows) options["data-emvb-arrows"] = "";
    if (dots) options["data-emvb-dots"] = "";
    if (autoplay) options["data-emvb-autoplay"] = String(interval ?? 6);
    if (loop) options["data-emvb-loop"] = "";
    return {
      tag: "section",
      attrs: {
        ...attrs,
        class: `${attrs["class"] ?? ""} emvb-carousel-per-${perView ?? 1}`.trim(),
        "aria-roledescription": "carousel",
        "aria-label": label?.trim() || "Carousel",
        ...options,
      },
      children: [
        {
          tag: "div",
          attrs: {
            class: "emvb-carousel-track",
            tabindex: "0",
            "aria-live": autoplay ? "off" : "polite",
          },
          children: slides,
        },
      ],
    };
  },
};

export const carouselSlide: ElementDefinition<CarouselSlideNode> = {
  baseCss: "",
  defaults: () => ({ type: "carousel-slide", props: {}, children: [] }),
  descriptor: {
    type: "carousel-slide",
    name: "Slide",
    group: "layout",
    defaultTab: "content",
    fields: [
      {
        key: "label",
        kind: "text",
        label: "Slide name",
        optional: true,
        message:
          "What screen readers call this slide. Leave it empty for its place, such as 2 of 5.",
      },
    ],
  },
  build: (node, attrs, children) => ({
    tag: "div",
    attrs: {
      ...attrs,
      role: "group",
      "aria-roledescription": "slide",
      ...(node.props.label?.trim() ? { "aria-label": node.props.label.trim() } : {}),
    },
    children,
  }),
};
