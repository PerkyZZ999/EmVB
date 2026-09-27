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
  // Lucide icon primitives (W-025 / A-04)
  "svg",
  "path",
  "circle",
  "line",
  "polyline",
  "polygon",
  "rect",
  "g",
]);
const VOID = new Set(["hr", "img"]);
const ATTR_NAME =
  /^(?:class|id|href|src|alt|width|height|loading|decoding|role|type|target|rel|aria-hidden|aria-label|xmlns|viewBox|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|focusable|d|cx|cy|r|x|y|x1|y1|x2|y2|points|rx|ry|data-[a-z][a-z0-9-]*)$/;

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
