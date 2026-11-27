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
 * - An author id that is not a plain id, or that would replace a browser global (`isShadowingId`,
 *   S-12), is dropped, like a reference to it. An author id that starts with `emvb` never gets here:
 *   the markup node refuses it (markup.ts) and a built-in output node carries no author id at all
 *   (safe-nodes.ts keeps only `id`, `type`, `props` and `children`).
 * - An `emvb-` id on a node of this output is one EmVB generated for it (a form control or its
 *   label). It is kept as it is, with the references to it that sit in the same output, since it is
 *   unique on the page already. A reference to an `emvb-` id that is not in this output is dropped.
 * - The first element to use an id owns it; a later one with the same id loses its `id` attribute.
 * - An id that ends the way `uniqueId` ends a repeat (`-r2`) is dropped: `a-r2` in one copy and `a`
 *   in a second would both come out as `ext-a-r2`. (A theme part's `-t<hash>` ending cannot be
 *   told from a word such as `-title`, so it is not refused; it needs an author id that equals
 *   another id plus a 32-bit hash.)
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
  "aria-flowto",
]);
/** `aria-activedescendant` takes one id, so it is handled with the single-id attributes. */
const ID_ATTRS_ARIA = "aria-activedescendant";
/** SVG paint attributes that point at an id as `url(#id)`: gradients, patterns, clip paths, masks. */
const URL_REF_ATTRS: ReadonlySet<string> = new Set(["fill", "stroke", "clip-path", "mask"]);
const URL_REF = /url\(\s*#([^)\s]+)\s*\)/g;
/** The ending `uniqueId` adds to the second copy of an id. */
const GENERATED_ENDING = /-r\d+$/;

const usableId = (value: string): boolean =>
  ID_RULE.test(value) &&
  !isShadowingId(value) &&
  !value.startsWith("emvb") &&
  !GENERATED_ENDING.test(value);

/**
 * Every id the tree owns, in document order, mapped to its page-unique id. An `emvb-` id on a node
 * of this tree is one EmVB generated for it (a form control and its label): an author id that
 * starts with `emvb` is refused before it gets here (markup.ts) and never comes from a built-in
 * node's `htmlId`. It is unique on the page already, so it maps to itself. A reference to an
 * `emvb-` id that is not on a node of this tree is not in the map, so it is dropped.
 */
function ownedIds(root: VNode, uniqueId: (base: string) => string): Map<string, string> {
  const owned = new Map<string, string>();
  const visit = (node: VNode): void => {
    const id = node.attrs.id;
    if (id !== undefined && !owned.has(id)) {
      if (id.startsWith("emvb")) owned.set(id, id);
      else if (usableId(id)) owned.set(id, uniqueId(`${ID_BASE}${id}`));
    }
    for (const child of node.children) if (typeof child !== "string") visit(child);
  };
  visit(root);
  return owned;
}

/**
 * Where a reference to `id` points after scoping: an id this tree owns (renamed, or an `emvb-` id
 * EmVB generated inside it), or nothing: any other id is foreign and the reference is dropped.
 */
const targetOf = (owned: ReadonlyMap<string, string>, id: string): string | undefined =>
  owned.get(id);

/**
 * A paint value with every `url(#id)` renamed, or `undefined` when one of them points at an id the
 * element does not own (the attribute is then dropped, like any other reference to a foreign id).
 */
function scopeUrlRefs(value: string, owned: ReadonlyMap<string, string>): string | undefined {
  let foreign = false;
  const out = value.replace(URL_REF, (_all, id: string) => {
    const mapped = targetOf(owned, id);
    if (mapped === undefined) foreign = true;
    return `url(#${mapped ?? id})`;
  });
  return foreign ? undefined : out;
}

/** One id-list attribute (`aria-labelledby`): its ids that the element owns, or undefined if none. */
function scopedIdList(value: string, owned: ReadonlyMap<string, string>): string | undefined {
  const mapped = value
    .split(/\s+/)
    .map((id) => targetOf(owned, id))
    .filter((id): id is string => id !== undefined);
  return mapped.length > 0 ? mapped.join(" ") : undefined;
}

/**
 * One attribute's value after scoping, or undefined to drop the attribute. `seen` holds the ids
 * already written, so a repeated id keeps only its first use.
 */
function scopedValue(
  name: string,
  value: string,
  owned: ReadonlyMap<string, string>,
  seen: Set<string>,
): string | undefined {
  if (name === "id") return scopedOwnId(value, owned, seen);
  if (ID_ATTRS.has(name) || name === ID_ATTRS_ARIA) return targetOf(owned, value);
  if (ID_LIST_ATTRS.has(name)) return scopedIdList(value, owned);
  if (URL_REF_ATTRS.has(name) && value.includes("url(")) return scopeUrlRefs(value, owned);
  if ((name === "href" || name === "xlink:href") && value.startsWith("#")) {
    return scopedFragment(value, owned);
  }
  return value;
}

/** An element's own id: its renamed id, the first time only (a duplicate id is invalid HTML). */
function scopedOwnId(
  value: string,
  owned: ReadonlyMap<string, string>,
  seen: Set<string>,
): string | undefined {
  const mapped = targetOf(owned, value);
  if (mapped === undefined || seen.has(mapped)) return undefined;
  seen.add(mapped);
  return mapped;
}

/** An in-page link (`#id`), pointing at the renamed id, or undefined when the target is foreign. */
function scopedFragment(value: string, owned: ReadonlyMap<string, string>): string | undefined {
  const mapped = targetOf(owned, value.slice(1));
  return mapped === undefined ? undefined : `#${mapped}`;
}

function rewrite(node: VNode, owned: ReadonlyMap<string, string>, seen: Set<string>): VNode {
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    const scoped = scopedValue(name, value, owned, seen);
    if (scoped !== undefined) attrs[name] = scoped;
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
