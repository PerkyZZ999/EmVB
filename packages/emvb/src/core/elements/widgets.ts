/**
 * The 1.2 widgets (PLAN_1.2 part D): elements built from plain markup and CSS. Each one renders
 * without script; the few interactive extras are opt-in runtimes.
 */
import type { AlertNode, IconBoxNode, LayoutNode, RatingNode } from "../schema/layout.ts";
import { ALERT_VARIANTS, MAX_RATING, type MEDIA_BOX_POSITIONS } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
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
  build: (node, attrs) => {
    const max = node.props.max ?? 5;
    const value = Math.min(Math.max(node.props.value, 0), max);
    const size = node.props.size ?? 20;
    const stars = Array.from({ length: max }, (_, i) =>
      star(size, Math.min(Math.max(value - i, 0), 1)),
    );
    return {
      tag: "div",
      attrs: { ...attrs, role: "img", "aria-label": ratingLabel(node.props) },
      children: stars,
    };
  },
};

/** W-1025: the opt-in public scripts the 1.2 widgets use; a page loads only the ones it needs. */
export type WidgetRuntime = "alerts";

/** The widget runtime one element needs, if any: only when it opts in. */
export function nodeRuntime(node: LayoutNode): WidgetRuntime | undefined {
  if (node.type === "alert" && (node as AlertNode).props.dismissible) return "alerts";
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
