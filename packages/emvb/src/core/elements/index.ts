import type {
  ButtonNode,
  ContainerNode,
  DivBlockNode,
  LayoutSectionNode,
  FlexboxNode,
  GridNode,
  SvgNode,
  TabsNode,
  TabPanelNode,
  AccordionNode,
  AccordionItemNode,
  DividerNode,
  HeadingNode,
  IconNode,
  ImageNode,
  LabelNode,
  LinkNode,
  ListNode,
  SpacerNode,
  TextNode,
  VideoNode,
} from "../schema/layout.ts";
import { CONTAINER_TAGS, TEXT_TAGS } from "../schema/layout.ts";
import type { ElementDescriptor } from "../schema/descriptors.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeSvgMarkup } from "../sanitize/svg.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { getBundledIcon } from "../icons/catalog.ts";
import { resolveEmbedUrl } from "../sanitize/embed-url.ts";
import type { VNode } from "../render/vnode.ts";

import type { ElementDefinition } from "./definition.ts";
import { menu, menuItem } from "./menu.ts";
import { checkbox, form, radio, selectEl, submit, textInput, textareaEl } from "./form-elements.ts";
import {
  loop,
  loopEmpty,
  pagination,
  section,
  postContent,
  postExcerpt,
  postImage,
  postLink,
  postTitle,
  postDate,
  postAuthor,
} from "./dynamic-elements.ts";

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const newTabAttrs = (newTab: boolean | undefined): Record<string, string> =>
  newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

const LINK_MESSAGE = "Use a full URL such as https://example.com or a path such as /pricing.";

/** Optional Link and new-tab fields for elements that wrap their content in a link (W-141). */
const INNER_LINK_FIELDS = [
  { key: "href", kind: "href" as const, label: "Link", optional: true, message: LINK_MESSAGE },
  { key: "newTab", kind: "boolean" as const, label: "Open in a new tab", optional: true },
];

/** The safe link for an optional href, or undefined when there is none or it is refused. */
const innerLink = (
  href: string | undefined,
  newTab: boolean | undefined,
  className: string,
  children: VNode["children"],
  extra: Record<string, string> = {},
): VNode | undefined => {
  const safe = href?.trim() ? sanitizeHref(href) : undefined;
  if (!safe) return undefined;
  return {
    tag: "a",
    attrs: { class: className, href: safe, ...newTabAttrs(newTab), ...extra },
    children,
  };
};

const heading: ElementDefinition<HeadingNode> = {
  baseCss: ".emvb-heading{margin:0}.emvb-heading-link{color:inherit;text-decoration:inherit}",
  defaults: () => ({ type: "heading", props: { text: "Heading", level: 2 } }),
  descriptor: {
    type: "heading",
    name: "Heading",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "text", label: "Text" },
      {
        key: "level",
        kind: "select",
        label: "Level",
        options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `H${n}` })),
      },
      ...INNER_LINK_FIELDS,
    ],
  },
  build: (node, attrs) => {
    const linked = innerLink(node.props.href, node.props.newTab, "emvb-heading-link", [
      node.props.text,
    ]);
    return {
      tag: HEADING_TAGS[node.props.level - 1] ?? "h2",
      attrs,
      children: [linked ?? node.props.text],
    };
  },
};

/** A box link is checked like any link, so a bad URL gets an inline error, not a silent drop (W-176). */
const BOX_LINK_FIELDS = [
  { key: "href", kind: "href" as const, label: "Link", optional: true, message: LINK_MESSAGE },
  { key: "newTab", kind: "boolean" as const, label: "Open in new tab", optional: true },
];

const container: ElementDefinition<ContainerNode> = {
  // W-299: a word longer than the line (a pasted URL) breaks instead of widening the page on a phone.
  baseCss:
    ".emvb-container{display:flex;flex-direction:column;min-width:0;overflow-wrap:break-word}",
  defaults: () => ({ type: "container", props: {}, children: [] }),
  descriptor: {
    type: "container",
    name: "Container",
    group: "layout",
    defaultTab: "style",
    fields: [
      {
        key: "tag",
        kind: "select",
        label: "HTML tag",
        optional: true,
        options: CONTAINER_TAGS.map((tag) => ({ value: tag, label: tag })),
        message: "Pick a landmark or div.",
      },
      ...BOX_LINK_FIELDS,
    ],
  },
  build: (node, attrs, children) => {
    const tag = node.props.tag ?? "div";
    const safe = (CONTAINER_TAGS as readonly string[]).includes(tag) ? tag : "div";
    return { tag: safe, attrs, children };
  },
};

const spacer: ElementDefinition<SpacerNode> = {
  baseCss: ".emvb-spacer{flex-shrink:0}",
  defaults: () => ({ type: "spacer", props: { height: { value: 24, unit: "px" } } }),
  descriptor: {
    type: "spacer",
    name: "Spacer",
    group: "layout",
    defaultTab: "style",
    fields: [
      {
        key: "height",
        kind: "number",
        label: "Height",
        message: "Height can't be negative. Enter 0 or more.",
      },
    ],
  },
  build: (_node, attrs) => ({
    tag: "div",
    attrs: { ...attrs, "aria-hidden": "true" },
    children: [],
  }),
};

const divider: ElementDefinition<DividerNode> = {
  // W-266: full width by default; an <hr> has no content width, so in a centred column it was 0 wide.
  baseCss:
    // W-270: a Divider is its top border. Border style on the other sides stays none (the tag in
    // the selector outranks an element's class), so "dashed" draws a dashed line, not a box.
    ".emvb-divider{border:0;border-top:1px solid currentColor;margin:0}:where(.emvb-divider){width:100%}hr.emvb-divider{border-right-style:none;border-bottom-style:none;border-left-style:none}",
  defaults: () => ({ type: "divider", props: {} }),
  descriptor: {
    type: "divider",
    name: "Divider",
    group: "layout",
    defaultTab: "style",
    fields: [],
  },
  build: (_node, attrs) => ({ tag: "hr", attrs, children: [] }),
};

const text: ElementDefinition<TextNode> = {
  // W-264: a paragraph's line breaks show (pre-line), in :where() so classes and styles win.
  baseCss: ".emvb-text{margin:0}:where(.emvb-text){white-space:pre-line}",
  defaults: () => ({ type: "text", props: { text: "Text" } }),
  descriptor: {
    type: "text",
    name: "Text",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "textarea", label: "Text" },
      {
        key: "tag",
        kind: "select",
        label: "HTML tag",
        optional: true,
        options: TEXT_TAGS.map((tag) => ({ value: tag, label: tag })),
      },
    ],
  },
  build: (node, attrs) => {
    const tag = node.props.tag ?? "p";
    const safe = (TEXT_TAGS as readonly string[]).includes(tag) ? tag : "p";
    return { tag: safe, attrs, children: [node.props.text] };
  },
};

const label: ElementDefinition<LabelNode> = {
  baseCss: ".emvb-label{display:inline}",
  defaults: () => ({ type: "label", props: { text: "Label" } }),
  descriptor: {
    type: "label",
    name: "Label",
    group: "content",
    defaultTab: "content",
    fields: [{ key: "text", kind: "text", label: "Text" }],
  },
  build: (node, attrs) => ({ tag: "span", attrs, children: [node.props.text] }),
};

const link: ElementDefinition<LinkNode> = {
  baseCss: ".emvb-link{}",
  defaults: () => ({ type: "link", props: { text: "Link", href: "/" } }),
  descriptor: {
    type: "link",
    name: "Link",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "text", label: "Text" },
      {
        key: "href",
        kind: "href",
        label: "URL",
        message: "Use a full URL such as https://example.com or a path such as /pricing.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
    ],
  },
  build: (node, attrs) => {
    const safe = sanitizeHref(node.props.href);
    // W-276: without a usable URL the link falls back to "#", which mustn't open a new tab.
    return {
      tag: "a",
      attrs: { ...attrs, href: safe ?? "#", ...(safe ? newTabAttrs(node.props.newTab) : {}) },
      children: [node.props.text],
    };
  },
};

const button: ElementDefinition<ButtonNode> = {
  baseCss:
    // The look sits in :where() so site tag defaults, classes and local styles all win (W-148).
    ".emvb-button{display:inline-flex;align-items:center;justify-content:center;margin:0;font:inherit;text-decoration:none;cursor:pointer}:where(.emvb-button){color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px;padding:0.625em 1.25em;line-height:1.2}",
  defaults: () => ({ type: "button", props: { text: "Button" } }),
  descriptor: {
    type: "button",
    name: "Button",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "text", label: "Text" },
      {
        key: "href",
        kind: "href",
        label: "URL",
        optional: true,
        message: "Use a full URL such as https://example.com or a path such as /pricing.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
    ],
  },
  build: (node, attrs) => {
    const href = node.props.href !== undefined ? sanitizeHref(node.props.href) : undefined;
    if (href) {
      return {
        tag: "a",
        attrs: { ...attrs, href, ...newTabAttrs(node.props.newTab) },
        children: [node.props.text],
      };
    }
    return {
      tag: "button",
      attrs: { ...attrs, type: "button" },
      children: [node.props.text],
    };
  },
};

const list: ElementDefinition<ListNode> = {
  baseCss: ".emvb-list{margin:0;padding-inline-start:1.25em}.emvb-list li{margin:0}",
  defaults: () => ({ type: "list", props: { items: ["Item"] } }),
  descriptor: {
    type: "list",
    name: "List",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "ordered", kind: "boolean", label: "Numbered list", optional: true },
      { key: "items", kind: "list-items", label: "Items" },
    ],
  },
  build: (node, attrs) => ({
    tag: node.props.ordered ? "ol" : "ul",
    attrs,
    // W-275: blank items would be empty bullets on the page; a list of only blanks has none.
    children: node.props.items
      .filter((item) => item.trim() !== "")
      .map((item) => ({ tag: "li", attrs: {}, children: [item] })),
  }),
};

const image: ElementDefinition<ImageNode> = {
  // W-269: natural size, at most the container's width. A container's default stretch made a
  // 400 px image 1184 px wide (blurry); a Width (px) attribute or a style width still sets it.
  baseCss:
    ".emvb-image{display:block;max-width:100%;height:auto}:where(img.emvb-image:not([width])){width:fit-content}",
  defaults: () => ({
    type: "image",
    props: { src: "", alt: "Image", decorative: false },
  }),
  descriptor: {
    type: "image",
    name: "Image",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "src",
        kind: "media",
        label: "Image",
        message:
          "Use a full URL such as https://example.com/photo.jpg or a path such as /uploads/photo.jpg.",
      },
      { key: "alt", kind: "text", label: "Alt text" },
      {
        key: "decorative",
        kind: "boolean",
        label: "Decorative (empty alt)",
        optional: true,
      },
      // The first big image people see (hero, LCP) shouldn't wait for lazy loading (W-226).
      { key: "priority", kind: "boolean", label: "Load right away", optional: true },
      {
        key: "width",
        kind: "int",
        label: "Width (px)",
        optional: true,
        message: "Width must be a positive whole number.",
      },
      {
        key: "height",
        kind: "int",
        label: "Height (px)",
        optional: true,
        message: "Height must be a positive whole number.",
      },
    ],
  },
  build: (node, attrs) => {
    const src = sanitizeMediaUrl(node.props.src);
    if (!src) {
      return {
        tag: "span",
        attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-image-missing`.trim() },
        children: [],
      };
    }
    const decorative = node.props.decorative === true;
    const imgAttrs: Record<string, string> = {
      ...attrs,
      src,
      alt: decorative ? "" : node.props.alt,
      ...(node.props.priority === true
        ? { loading: "eager", fetchpriority: "high" }
        : { loading: "lazy", decoding: "async" }),
    };
    if (decorative) imgAttrs.role = "presentation";
    if (node.props.width !== undefined) imgAttrs.width = String(node.props.width);
    if (node.props.height !== undefined) imgAttrs.height = String(node.props.height);
    return { tag: "img", attrs: imgAttrs, children: [] };
  },
};

/** Root stroke widths the Stroke width control can override (W-237); Lucide and Tabler use 2. */
const ICON_STROKE_WIDTHS = ["1", "1.5", "2", "2.5", "3"] as const;

const icon: ElementDefinition<IconNode> = {
  baseCss:
    // W-237: the glyph reads the wrapper's icon custom properties (rotate, flip, shadow, loop,
    // stroke); unset they change nothing. The svg inherits the wrapper's transition for hover.
    ".emvb-icon{display:inline-flex;align-items:center;justify-content:center;line-height:0;color:inherit}.emvb-icon-link{display:inline-flex;color:inherit}.emvb-icon svg{display:block;rotate:var(--emvb-icon-rotate,0deg);scale:var(--emvb-icon-flip,1 1);filter:var(--emvb-icon-shadow,none);animation:var(--emvb-icon-animation,none);transition:inherit}" +
    ICON_STROKE_WIDTHS.map(
      (width) =>
        `.emvb-icon-sw${width.replace(".", "_")}{stroke-width:var(--emvb-icon-stroke,${width})}`,
    ).join("") +
    "@keyframes emvb-icon-spin{to{transform:rotate(360deg)}}@keyframes emvb-icon-pulse{from{transform:scale(1)}to{transform:scale(1.15)}}@media (prefers-reduced-motion: reduce){.emvb-icon svg{animation:none}}.emvb-icon-missing{min-width:1em;min-height:1em;background:var(--color-kumo-tint,#eee)}",
  defaults: () => ({
    type: "icon",
    props: { iconId: "star", title: "Star", decorative: false, size: 24 },
  }),
  descriptor: {
    type: "icon",
    name: "Icon",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "iconId", kind: "icon", label: "Icon" },
      { key: "title", kind: "text", label: "Title" },
      {
        key: "decorative",
        kind: "boolean",
        label: "Decorative (hide from assistive tech)",
        optional: true,
      },
      {
        key: "size",
        kind: "int",
        label: "Size (px)",
        optional: true,
        message: "Size must be a positive whole number.",
      },
      ...INNER_LINK_FIELDS,
    ],
  },
  build: (node, attrs) => {
    // W-234: a picked library icon carries its own SVG; the allowlist checks it on every render.
    const picked = node.props.iconSvg ? sanitizeSvgMarkup(node.props.iconSvg) : undefined;
    const bundled = picked ? undefined : getBundledIcon(node.props.iconId);
    if (!picked && !bundled) {
      // Never treat iconId as a URL or raw HTML (R-032 / R-033).
      return {
        tag: "span",
        attrs: {
          ...attrs,
          class: `${attrs.class ?? ""} emvb-icon-missing`.trim(),
          "aria-hidden": "true",
        },
        children: [],
      };
    }
    const decorative = node.props.decorative === true;
    const size = node.props.size ?? 24;
    const svgAttrs: Record<string, string> = picked
      ? {
          ...pickedIconAttrs(picked.attrs),
          width: String(size),
          height: String(size),
          focusable: "false",
        }
      : {
          xmlns: "http://www.w3.org/2000/svg",
          width: String(size),
          height: String(size),
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          focusable: "false",
        };
    if (decorative) {
      svgAttrs["aria-hidden"] = "true";
    } else {
      svgAttrs.role = "img";
      if (node.props.title) svgAttrs["aria-label"] = node.props.title;
    }
    const children: (VNode | string)[] = picked
      ? picked.children
      : (bundled?.children ?? []).map((child) => ({
          tag: child.tag,
          attrs: { ...child.attrs },
          children: [],
        }));
    strokeClass(svgAttrs);
    const single = picked !== undefined && node.props.singleColor === true;
    if (single) monochromeRoot(svgAttrs);
    const svg: VNode = {
      tag: "svg",
      attrs: svgAttrs,
      children: single ? monochrome(children) : children,
    };
    // A linked icon is named by its title on the link, so the svg inside is hidden.
    const title = node.props.title?.trim();
    const { role: _role, "aria-label": _label, ...plain } = svgAttrs;
    const hidden: VNode = { ...svg, attrs: { ...plain, "aria-hidden": "true" } };
    const linked = title
      ? innerLink(node.props.href, node.props.newTab, "emvb-icon-link", [hidden], {
          "aria-label": title,
        })
      : undefined;
    return { tag: "span", attrs, children: [linked ?? svg] };
  },
};

/**
 * W-237: a stroke icon's root `stroke-width` moves into a class whose CSS reads the wrapper's
 * `--emvb-icon-stroke` with the original width as fallback; any other width stays as it was.
 */
function strokeClass(svgAttrs: Record<string, string>): void {
  const width = svgAttrs["stroke-width"];
  if (!width || !(ICON_STROKE_WIDTHS as readonly string[]).includes(width)) return;
  if (!svgAttrs.stroke || svgAttrs.stroke === "none") return;
  delete svgAttrs["stroke-width"];
  const cls = `emvb-icon-sw${width.replace(".", "_")}`;
  svgAttrs.class = svgAttrs.class ? `${svgAttrs.class} ${cls}` : cls;
}

/** Whether an icon's SVG is stroke-drawn with an adjustable width (the panel shows the control). */
export function iconHasAdjustableStroke(svg: string | undefined): boolean {
  if (!svg) return true; // bundled Lucide
  const picked = sanitizeSvgMarkup(svg);
  if (!picked) return false;
  const attrs = pickedIconAttrs(picked.attrs);
  const before = attrs["stroke-width"];
  strokeClass(attrs);
  return before !== undefined && attrs["stroke-width"] === undefined;
}

/** Paint attributes a multi-colour SVG sets its colours with (W-238). */
const PAINT_ATTRS = ["fill", "stroke", "stop-color"] as const;

const ownColor = (value: string | undefined) =>
  value !== undefined && value !== "none" && value.toLowerCase() !== "currentcolor";

/** W-238: every fill, stroke and gradient stop becomes the icon's colour; `none` stays none. */
function monochrome(nodes: (VNode | string)[]): (VNode | string)[] {
  return nodes.map((child) => {
    if (typeof child === "string") return child;
    const attrs = { ...child.attrs };
    for (const name of PAINT_ATTRS) if (ownColor(attrs[name])) attrs[name] = "currentColor";
    return { ...child, attrs, children: monochrome(child.children) };
  });
}

/** The root too; without a fill, SVG paints black, so it gets the icon's colour. */
function monochromeRoot(attrs: Record<string, string>): void {
  if (attrs.fill === undefined || ownColor(attrs.fill)) attrs.fill = "currentColor";
  if (ownColor(attrs.stroke)) attrs.stroke = "currentColor";
}

/**
 * Whether an icon's SVG paints with its own colours (W-238): any fill, stroke or stop other than
 * `none`/`currentColor`, or a root without a fill (SVG's default is black). The panel offers
 * Force single colour only then. Bundled Lucide icons follow the icon's colour already.
 */
export function iconHasOwnColors(svg: string | undefined): boolean {
  if (!svg) return false;
  const picked = sanitizeSvgMarkup(svg);
  if (!picked) return false;
  if (picked.attrs.fill === undefined || PAINT_ATTRS.some((name) => ownColor(picked.attrs[name])))
    return true;
  const walk = (nodes: (VNode | string)[]): boolean =>
    nodes.some(
      (child) =>
        typeof child !== "string" &&
        (PAINT_ATTRS.some((name) => ownColor(child.attrs[name])) || walk(child.children)),
    );
  return walk(picked.children);
}

/** A picked icon's root attributes minus what the element sets itself (size, name, id). */
function pickedIconAttrs(attrs: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = { xmlns: "http://www.w3.org/2000/svg" };
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "width" || name === "height" || name === "id" || name === "role") continue;
    if (name.startsWith("aria-") || name === "focusable") continue;
    kept[name] = value;
  }
  if (!kept.viewBox) kept.viewBox = "0 0 24 24";
  return kept;
}

const video: ElementDefinition<VideoNode> = {
  baseCss:
    // W-266: the iframe or <video> is the .emvb-video element itself, so the 16:9 size sits on it
    // (the old descendant rule matched nothing: players were 300×150). :where() lets styles win.
    ".emvb-video{display:block;max-width:100%;border:0}:where(.emvb-video){box-sizing:border-box;width:100%;aspect-ratio:16/9;background:#000}.emvb-video-missing,.emvb-video-preview{display:flex;align-items:center;justify-content:center;min-height:120px;padding:12px;text-align:center;color:var(--text-color-kumo-subtle,#666);background:var(--color-kumo-tint,#eee)}",
  defaults: () => ({
    type: "video",
    props: { url: "", title: "Video" },
  }),
  descriptor: {
    type: "video",
    name: "Video",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "url",
        kind: "href",
        label: "Video URL",
        message:
          "Use a YouTube or Vimeo link, or a media file path such as /_emdash/api/media/file/….",
      },
      { key: "title", kind: "text", label: "Title" },
    ],
  },
  build: (node, attrs) => {
    const target = resolveEmbedUrl(node.props.url);
    if (!target) {
      return {
        tag: "span",
        attrs: {
          ...attrs,
          class: `${attrs.class ?? ""} emvb-video-missing`.trim(),
          "aria-hidden": "true",
        },
        children: [],
      };
    }
    if (target.kind === "iframe") {
      return {
        tag: "iframe",
        attrs: {
          ...attrs,
          src: target.src,
          title: node.props.title,
          loading: "lazy",
          referrerpolicy: "strict-origin-when-cross-origin",
          allow: "encrypted-media; picture-in-picture; fullscreen",
        },
        children: [],
      };
    }
    return {
      tag: "video",
      attrs: {
        ...attrs,
        src: target.src,
        title: node.props.title,
        controls: "",
        preload: "metadata",
      },
      children: [],
    };
  },
};

const DEFAULT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>';

const SVG_WSP = String.raw`[ \t\r\n]`;
const SVG_NUM = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const SVG_SEP = `(?:${SVG_WSP}*,${SVG_WSP}*|${SVG_WSP}+)`;
/** Four SVG numbers split by SVG whitespace and/or one comma; captures the width and height. */
const VIEW_BOX = new RegExp(
  `^${SVG_WSP}*${SVG_NUM}${SVG_SEP}${SVG_NUM}${SVG_SEP}(${SVG_NUM})${SVG_SEP}(${SVG_NUM})${SVG_WSP}*$`,
);

/** The SVG fits the Size square: a valid non-square viewBox keeps its ratio, longer side at Size. */
function svgBox(size: number, viewBox: string | undefined): { width: string; height: string } {
  const match = VIEW_BOX.exec(viewBox ?? "");
  const vbWidth = Number(match?.[1]);
  const vbHeight = Number(match?.[2]);
  const across = vbWidth / vbHeight;
  const down = vbHeight / vbWidth;
  const valid = vbWidth > 0 && [across, down].every((ratio) => Number.isFinite(ratio) && ratio > 0);
  if (!valid) return { width: String(size), height: String(size) };
  const side = (ratio: number) => String(Math.max(1, Math.round(size * Math.min(1, ratio))));
  return { width: side(across), height: side(down) };
}

const svgEl: ElementDefinition<SvgNode> = {
  baseCss:
    ".emvb-svg{display:inline-flex;align-items:center;justify-content:center;line-height:0;color:inherit}.emvb-svg svg{display:block}.emvb-svg-missing{min-width:1em;min-height:1em;background:var(--color-kumo-tint,#eee)}",
  defaults: () => ({
    type: "svg",
    props: { markup: DEFAULT_SVG, title: "SVG", decorative: false, size: 48 },
  }),
  descriptor: {
    type: "svg",
    name: "SVG",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "markup",
        kind: "textarea",
        label: "SVG markup",
        message: "Paste safe SVG only (no scripts or external links).",
      },
      { key: "title", kind: "text", label: "Title", optional: true },
      {
        key: "decorative",
        kind: "boolean",
        label: "Decorative (hide from assistive tech)",
        optional: true,
      },
      {
        key: "size",
        kind: "int",
        label: "Size (px)",
        optional: true,
        message: "Size must be a positive whole number.",
      },
    ],
  },
  build: (node, attrs) => {
    const tree = sanitizeSvgMarkup(node.props.markup);
    if (!tree) {
      return {
        tag: "span",
        attrs: {
          ...attrs,
          class: `${attrs.class ?? ""} emvb-svg-missing`.trim(),
          "aria-hidden": "true",
        },
        children: [],
      };
    }
    const size = node.props.size ?? 48;
    const decorative = node.props.decorative === true;
    const svgAttrs: Record<string, string> = {
      ...tree.attrs,
      xmlns: tree.attrs.xmlns ?? "http://www.w3.org/2000/svg",
      ...svgBox(size, tree.attrs.viewBox),
      focusable: "false",
    };
    if (!svgAttrs.fill && !svgAttrs.stroke) {
      svgAttrs.fill = "currentColor";
    }
    if (decorative) {
      svgAttrs["aria-hidden"] = "true";
    } else {
      svgAttrs.role = "img";
      if (node.props.title) svgAttrs["aria-label"] = node.props.title;
    }
    return {
      tag: "span",
      attrs,
      children: [{ tag: "svg", attrs: svgAttrs, children: tree.children }],
    };
  },
};

const tabPanel: ElementDefinition<TabPanelNode> = {
  baseCss: "",
  defaults: () => ({
    type: "tab-panel",
    props: { label: "Tab" },
    children: [],
  }),
  descriptor: {
    type: "tab-panel",
    name: "Tab panel",
    group: "layout",
    defaultTab: "content",
    fields: [{ key: "label", kind: "text", label: "Tab label" }],
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

const tabs: ElementDefinition<TabsNode> = {
  baseCss:
    ".emvb-tabs{display:flex;flex-direction:column;min-width:0;gap:0}.emvb-tab-input{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}.emvb-tab-list{display:flex;flex-wrap:wrap;gap:0;border-bottom:1px solid currentColor;margin:0;padding:0}.emvb-tab-label{display:inline-block;padding:8px 12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}.emvb-tab-panels{min-width:0}.emvb-tab-panel{display:none;padding-top:12px;min-width:0}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(1):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(1){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(1):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(1){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(2):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(2){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(2):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(2){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(3):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(3){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(3):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(3){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(4):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(4){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(4):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(4){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(5):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(5){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(5):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(5){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(6):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(6){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(6):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(6){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(7):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(7){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(7):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(7){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(8):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(8){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(8):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(8){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(9):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(9){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(9):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(9){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(10):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(10){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(10):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(10){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(11):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(11){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(11):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(11){display:block}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(12):checked) > .emvb-tab-list > .emvb-tab-label:nth-of-type(12){border-bottom-color:currentColor;font-weight:600}.emvb-tabs:has(> .emvb-tab-input:nth-of-type(12):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(12){display:block}",
  defaults: () => ({
    type: "tabs",
    props: {},
    children: [],
  }),
  descriptor: {
    type: "tabs",
    name: "Tabs",
    group: "layout",
    defaultTab: "content",
    fields: [],
  },
  // Real markup is assembled in render (needs panel labels from nodes).
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

const divBlock: ElementDefinition<DivBlockNode> = {
  baseCss: ".emvb-div-block{display:block;min-width:0}",
  defaults: () => ({ type: "div-block", props: {}, children: [] }),
  descriptor: {
    type: "div-block",
    name: "Div Block",
    group: "layout",
    defaultTab: "style",
    fields: BOX_LINK_FIELDS,
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

/**
 * A layout Section (W-156, D-045): a full-width band (background and padding on it) whose
 * contents sit in a centred inner box at most the content width wide. The width is a custom
 * property set by the renderer; each section resets it so a nested one doesn't inherit it.
 */
const layoutSection: ElementDefinition<LayoutSectionNode> = {
  baseCss:
    ".emvb-layout-section{--emvb-content-width:1140px;display:block;min-width:0}.emvb-layout-section-inner{box-sizing:border-box;width:100%;max-width:var(--emvb-content-width);margin-inline:auto;min-width:0}",
  defaults: () => ({
    type: "layout-section",
    props: {},
    style: {
      paddingTop: { value: 64, unit: "px" },
      paddingRight: { value: 24, unit: "px" },
      paddingBottom: { value: 64, unit: "px" },
      paddingLeft: { value: 24, unit: "px" },
    },
    children: [],
  }),
  descriptor: {
    type: "layout-section",
    name: "Section",
    group: "layout",
    defaultTab: "content",
    fields: [
      {
        key: "contentWidth",
        kind: "number",
        label: "Content width",
        optional: true,
        message: "Content width can't be negative. Leave it empty for 1140 px.",
      },
      { key: "fullWidth", kind: "boolean", label: "Full-width content", optional: true },
      {
        key: "tag",
        kind: "select",
        label: "HTML tag",
        optional: true,
        options: CONTAINER_TAGS.map((tag) => ({ value: tag, label: tag })),
        message: "Pick a landmark or div. A section is a section by default.",
      },
    ],
  },
  build: (node, attrs, children) => {
    const tag = node.props.tag ?? "section";
    const safe = (CONTAINER_TAGS as readonly string[]).includes(tag) ? tag : "section";
    const inner: VNode = { tag: "div", attrs: { class: "emvb-layout-section-inner" }, children };
    return { tag: safe, attrs, children: [inner] };
  },
};

const grid: ElementDefinition<GridNode> = {
  baseCss: ".emvb-grid{display:grid;min-width:0}",
  defaults: () => ({ type: "grid", props: { columns: 3 }, children: [] }),
  descriptor: {
    type: "grid",
    name: "Grid",
    group: "layout",
    defaultTab: "content",
    fields: [
      {
        key: "columns",
        kind: "select",
        label: "Columns",
        devices: { tablet: "columnsTablet", mobile: "columnsMobile" },
        options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({
          value: n,
          label: String(n),
        })),
      },
      ...BOX_LINK_FIELDS,
    ],
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

const flexbox: ElementDefinition<FlexboxNode> = {
  baseCss:
    ".emvb-flexbox{display:flex;flex-direction:row;flex-wrap:wrap;align-items:stretch;min-width:0;gap:16px}",
  defaults: () => ({
    type: "flexbox",
    props: {},
    style: { flexDirection: "row", flexWrap: "wrap", gap: { value: 16, unit: "px" } },
    children: [],
  }),
  descriptor: {
    type: "flexbox",
    name: "Flexbox",
    group: "layout",
    defaultTab: "style",
    fields: BOX_LINK_FIELDS,
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

const accordion: ElementDefinition<AccordionNode> = {
  baseCss:
    ".emvb-accordion{display:flex;flex-direction:column;min-width:0}.emvb-accordion-item{border-bottom:1px solid currentColor}.emvb-accordion-item>summary{cursor:pointer;padding:12px 0;font-weight:600}.emvb-accordion-body{padding:0 0 12px}",
  defaults: () => ({ type: "accordion", props: {}, children: [] }),
  descriptor: {
    type: "accordion",
    name: "Accordion",
    group: "layout",
    defaultTab: "content",
    fields: [],
  },
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

const accordionItem: ElementDefinition<AccordionItemNode> = {
  baseCss: "",
  defaults: () => ({ type: "accordion-item", props: { summary: "Title" }, children: [] }),
  descriptor: {
    type: "accordion-item",
    name: "Accordion item",
    group: "layout",
    defaultTab: "content",
    fields: [
      { key: "summary", kind: "text", label: "Title" },
      { key: "open", kind: "boolean", label: "Open", optional: true },
    ],
  },
  build: (node, attrs, children) => {
    const summary: VNode = { tag: "summary", attrs: {}, children: [node.props.summary] };
    const body: VNode = { tag: "div", attrs: { class: "emvb-accordion-body" }, children };
    return {
      tag: "details",
      attrs: node.props.open ? { ...attrs, open: "" } : attrs,
      children: [summary, body],
    };
  },
};

export const ELEMENTS = {
  heading,
  container,
  "layout-section": layoutSection,
  spacer,
  divider,
  text,
  label,
  link,
  button,
  list,
  image,
  icon,
  video,
  form,
  "text-input": textInput,
  textarea: textareaEl,
  select: selectEl,
  checkbox,
  radio,
  submit,
  "post-title": postTitle,
  "post-excerpt": postExcerpt,
  "post-content": postContent,
  "post-image": postImage,
  "post-link": postLink,
  "post-date": postDate,
  "post-author": postAuthor,
  loop,
  "loop-empty": loopEmpty,
  pagination,
  section,
  "div-block": divBlock,
  flexbox,
  grid,
  svg: svgEl,
  tabs,
  "tab-panel": tabPanel,
  accordion,
  "accordion-item": accordionItem,
  menu,
  "menu-item": menuItem,
} as const;

export type ElementType = keyof typeof ELEMENTS;

export const ELEMENT_DESCRIPTORS: ElementDescriptor[] = Object.values(ELEMENTS).map(
  (el) => el.descriptor,
);

export function defaultElement<T extends ElementType>(
  type: T,
  id: string,
): (typeof ELEMENTS)[T] extends ElementDefinition<infer N> ? N : never {
  const base = ELEMENTS[type].defaults() as { type: string };
  return { id, ...base } as never;
}
