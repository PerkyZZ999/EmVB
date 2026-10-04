import * as React from "react";
import { isAllowedAttr, isAllowedTag, type VNode } from "../../../core/index.ts";

/** Lowercase HTML attr names React spells in camelCase. */
const REACT_ATTR: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  autocomplete: "autoComplete",
  allowfullscreen: "allowFullScreen",
  referrerpolicy: "referrerPolicy",
  // The canvas never updates a radio from props, so a tab chosen there stays chosen (QA-5).
  checked: "defaultChecked",
};

/**
 * Presence attributes the core writes as `""`. React reads `""` as false for these, so a saved-open
 * accordion item rendered closed on the canvas (W-130); presence means on.
 */
const BOOLEAN_ATTRS = new Set([
  "open",
  "controls",
  "allowfullscreen",
  "muted",
  "loop",
  "playsinline",
  "autoplay",
]);

/** SVG tags the core keeps lowercase; the SVG namespace only knows their camelCase names. */
const REACT_TAG: Record<string, string> = {
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  clippath: "clipPath",
};

/** React's name for an attribute: SVG's `stop-color` and `xlink:href` become `stopColor`, `xlinkHref`. */
function reactAttr(name: string): string {
  const mapped = REACT_ATTR[name];
  if (mapped) return mapped;
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  return name.replace(/[-:]([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

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
    props[reactAttr(name)] = name === "checked" || BOOLEAN_ATTRS.has(name) ? true : value;
  }
  return React.createElement(
    REACT_TAG[node.tag] ?? node.tag,
    props,
    ...node.children.map((child, index) => vnodeToReact(child, index)),
  );
}
