import * as React from "react";
import { isAllowedAttr, isAllowedTag, type VNode } from "../../../core/index.ts";

/** HTML/SVG attr names React expects in camelCase (avoids DOM-property console warnings). */
const REACT_ATTR: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  autocomplete: "autoComplete",
  allowfullscreen: "allowFullScreen",
  referrerpolicy: "referrerPolicy",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
};

/**
 * Turns the core's VNode tree into React elements for the canvas (A-08). It applies the same tag
 * and attribute allowlists as `serialize`, so the canvas and the public page get the same markup
 * (R-005). Text stays text: React escapes it.
 */
export function vnodeToReact(node: VNode | string, key?: React.Key): React.ReactNode {
  if (typeof node === "string") return node;
  if (!isAllowedTag(node.tag)) return null;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!isAllowedAttr(name)) continue;
    props[REACT_ATTR[name] ?? name] = value;
  }
  return React.createElement(
    node.tag,
    props,
    ...node.children.map((child, index) => vnodeToReact(child, index)),
  );
}
