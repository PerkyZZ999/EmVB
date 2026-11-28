/**
 * The generic markup node of extensionApi 1.5: an output-only element with a `tag` and `attrs`.
 *
 * An extension's render() may return `{ type: "markup", props: { tag, attrs, text } }`. The tag
 * must be on the serializer's list (`isAllowedTag`, which now includes the ten table, dialog and
 * code tags a kit needs) and each attribute name on `isAllowedAttr`. A URL attribute goes through
 * the href sanitizer. Text is cleaned like a bound value and escaped by the serializer. There is no
 * raw HTML and no event handler: `on*` and `style` are not on the attribute list.
 *
 * The node is refused whole (the element shows its placeholder) when any part of it is refused. It
 * is never stored: the layout schema is unchanged, and the validated output carries its spec beside
 * the node, as extension classes do (W-1086), so it cannot be written into a saved layout.
 */
import { isAllowedAttr, isAllowedTag } from "../render/vnode.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { cleanBoundText } from "../data/bindings.ts";

/** The output-only node's `type`. It is not a stored element type. */
export const MARKUP_TYPE = "markup";

export type MarkupSpec = {
  tag: string;
  attrs: Record<string, string>;
  /** Text inside the element; a markup node with text takes no children. */
  text?: string;
};

/** Longest attribute value or text kept, in UTF-16 code units. */
const MAX_VALUE = 2000;
/** Attributes whose value is a URL. */
const URL_ATTRS: ReadonlySet<string> = new Set(["href", "src", "action", "xlink:href"]);

const MARKUP = new WeakMap<object, MarkupSpec>();

/** The spec of a validated output node that is markup, or undefined. */
export const markupOf = (node: object): MarkupSpec | undefined => MARKUP.get(node);
/** Records a validated output node's markup spec. */
export const setMarkup = (node: object, spec: MarkupSpec): void => {
  MARKUP.set(node, spec);
};

/**
 * The checked spec of a markup node's props, or undefined when it is refused: a tag or attribute
 * not on the lists, `class` (extension classes go through `extClasses`), an `id` that is not a
 * plain author id (`emvb` ids are EmVB's own), a URL that fails the href sanitizer, or an
 * over-long value.
 */
export function markupSpec(props: Record<string, unknown>): MarkupSpec | undefined {
  const { tag, attrs, text } = props;
  if (typeof tag !== "string" || !isAllowedTag(tag)) return undefined;
  const kept = checkedAttrs(attrs);
  if (kept === undefined) return undefined;
  if (text !== undefined && (typeof text !== "string" || text.length > MAX_VALUE)) return undefined;
  return {
    tag,
    attrs: kept,
    ...(typeof text === "string" ? { text: cleanBoundText(text, MAX_VALUE) } : {}),
  };
}

/** The attributes kept (`{}` when there are none), or undefined when one is refused. */
function checkedAttrs(attrs: unknown): Record<string, string> | undefined {
  if (attrs === undefined) return {};
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(attrs)) {
    const kept = checkedValue(name, value);
    if (kept === undefined) return undefined;
    out[name] = kept;
  }
  return out;
}

/** One attribute's cleaned value, or undefined when its name, value or URL is refused. */
function checkedValue(name: string, value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_VALUE) return undefined;
  if (!isAllowedAttr(name) || name === "class") return undefined;
  if (name === "id" && value.startsWith("emvb")) return undefined;
  const cleaned = cleanBoundText(value, MAX_VALUE);
  return URL_ATTRS.has(name) ? sanitizeHref(cleaned) : cleaned;
}
