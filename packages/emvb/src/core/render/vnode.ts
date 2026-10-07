import { escapeAttr, escapeText } from "../sanitize/escape.ts";

export type VNode = { tag: string; attrs: Record<string, string>; children: (VNode | string)[] };

const TAGS = new Set([
  "div",
  "section",
  "header",
  "footer",
  "main",
  "article",
  "aside",
  "nav",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "button",
  "ul",
  "ol",
  "li",
  "hr",
  "img",
  "iframe",
  "video",
  "form",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "fieldset",
  "legend",
  "details",
  "summary",
  "time",
  // Lucide icon primitives (W-025 / A-04)
  "svg",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "g",
  "title",
  "desc",
  "defs",
  "symbol",
  "use",
  "image",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "marker",
  "text",
  "tspan",
]);
const VOID = new Set(["hr", "img", "input"]);
// iframe/video are not void — they need closing tags.
const ATTR_NAME =
  /^(?:class|id|href|src|alt|width|height|loading|decoding|fetchpriority|dir|role|type|checked|target|rel|aria-[a-z][a-z0-9-]*|title|allow|referrerpolicy|preload|controls|allowfullscreen|xmlns|viewBox|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-dasharray|stroke-opacity|fill-opacity|opacity|transform|focusable|d|cx|cy|r|x|y|x1|y1|x2|y2|points|rx|ry|xlink:href|preserveAspectRatio|gradientUnits|gradientTransform|offset|stop-color|stop-opacity|clipPathUnits|maskUnits|maskContentUnits|patternUnits|patternContentUnits|patternTransform|markerUnits|markerWidth|markerHeight|refX|refY|orient|font-size|font-family|font-weight|text-anchor|dominant-baseline|dx|dy|clip-path|method|action|name|value|placeholder|for|tabindex|autocomplete|open|datetime|muted|loop|playsinline|autoplay|data-[a-z][a-z0-9-]*)$/;

export const isAllowedTag = (tag: string) => TAGS.has(tag);
export const isAllowedAttr = (name: string) => ATTR_NAME.test(name);

/** Serializes a VNode tree. Text and attribute values are always escaped; tags and attribute names are allowlisted. */
export function serialize(node: VNode | string): string {
  if (typeof node === "string") return escapeText(node);
  if (!TAGS.has(node.tag)) throw new Error(`EmVB: tag "${node.tag}" is not allowed`);
  let attrs = "";
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!ATTR_NAME.test(name)) throw new Error(`EmVB: attribute "${name}" is not allowed`);
    attrs += ` ${name}="${escapeAttr(value)}"`;
  }
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(serialize).join("")}</${node.tag}>`;
}
