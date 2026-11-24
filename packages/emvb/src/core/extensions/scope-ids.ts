/**
 * Ids in an extension element's output (extensionApi 1.5).
 *
 * An extension writes plain ids (`title`, `dialog`) and references to them (`for`,
 * `aria-labelledby`, `popovertarget`, `href="#title"`). Two copies of one element, or one element
 * in a header and again in the page, must not share an id, so every id the element owns is
 * renamed through the render's `uniqueId`: the same call that gives a copy in a header, footer or
 * popup its suffix (W-1077) and a repeated one its `-rN`. Every reference to it is rewritten with
 * the same mapping.
 *
 * - An id the element does not own is not a target. A reference to it is dropped, so output cannot
 *   point at the host page's own ids or at another element's.
 * - An id that is not a plain id, that starts with `emvb`, or that would replace a browser global
 *   (`isShadowingId`, S-12) is dropped, like a reference to it.
 * - The first element to use an id owns it; a later one with the same id loses its `id` attribute.
 *
 * Pure: it returns a new tree and leaves the input alone.
 */
import type { VNode } from "../render/vnode.ts";
import { isShadowingId } from "../shadowing-ids.ts";

/** A plain element id: starts with a letter, then letters, digits, `-` or `_`. */
const ID_RULE = /^[A-Za-z][\w-]{0,63}$/;
/** What an extension's ids sit under, so they cannot match an id the page itself wrote. */
const ID_BASE = "ext-";
/** Attributes whose value is one id. */
const ID_ATTRS: ReadonlySet<string> = new Set(["for", "popovertarget"]);
/** Attributes whose value is a space-separated list of ids. */
const ID_LIST_ATTRS: ReadonlySet<string> = new Set([
  "aria-labelledby",
  "aria-describedby",
  "aria-controls",
  "aria-owns",
  "aria-details",
  "aria-errormessage",
]);

const usableId = (value: string): boolean =>
  ID_RULE.test(value) && !isShadowingId(value) && !value.startsWith("emvb");

/** Every id the tree owns, in document order, mapped to its page-unique id. */
function ownedIds(root: VNode, uniqueId: (base: string) => string): Map<string, string> {
  const owned = new Map<string, string>();
  const visit = (node: VNode): void => {
    const id = node.attrs.id;
    if (id !== undefined && usableId(id) && !owned.has(id)) {
      owned.set(id, uniqueId(`${ID_BASE}${id}`));
    }
    for (const child of node.children) if (typeof child !== "string") visit(child);
  };
  visit(root);
  return owned;
}

function rewrite(node: VNode, owned: ReadonlyMap<string, string>, seen: Set<string>): VNode {
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === "id") {
      const mapped = owned.get(value);
      // Only the first element with an id keeps it; a duplicate id is invalid HTML.
      if (mapped !== undefined && !seen.has(mapped)) {
        seen.add(mapped);
        attrs.id = mapped;
      }
    } else if (ID_ATTRS.has(name)) {
      const mapped = owned.get(value);
      if (mapped !== undefined) attrs[name] = mapped;
    } else if (ID_LIST_ATTRS.has(name)) {
      const mapped = value
        .split(/\s+/)
        .map((id) => owned.get(id))
        .filter((id): id is string => id !== undefined);
      if (mapped.length > 0) attrs[name] = mapped.join(" ");
    } else if ((name === "href" || name === "xlink:href") && value.startsWith("#")) {
      const mapped = owned.get(value.slice(1));
      if (mapped !== undefined) attrs[name] = `#${mapped}`;
    } else {
      attrs[name] = value;
    }
  }
  return {
    tag: node.tag,
    attrs,
    children: node.children.map((child) =>
      typeof child === "string" ? child : rewrite(child, owned, seen),
    ),
  };
}

/**
 * Rename the ids an element's output owns through `uniqueId` and rewrite every reference to them.
 * `uniqueId` is the render context's.
 */
export function scopeIds(root: VNode, uniqueId: (base: string) => string): VNode {
  return rewrite(root, ownedIds(root, uniqueId), new Set());
}
