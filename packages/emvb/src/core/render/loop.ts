import { ELEMENTS } from "../elements/index.ts";
import type { LayoutNode, LoopNode } from "../schema/layout.ts";
import {
  resolvePostsForLoop,
  type ThemeDynamicData,
  type ThemePostFields,
} from "../theme/dynamic.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

/** Entries a collection Loop shows when the Loop doesn't say (W-308). */
const DEFAULT_LOOP_LIMIT = 6;

/** Editor stand-ins for a collection Loop before its entries load (W-308). */
const sampleEntries = (collection: string, count: number): ThemePostFields[] =>
  Array.from({ length: Math.min(count, 3) }, (_, i) => ({
    id: `sample-${i + 1}`,
    slug: `sample-${i + 1}`,
    title: `${collection} entry ${i + 1}`,
    excerpt: "Entry excerpt…",
    content: "",
    permalink: "#",
  }));

/** The entries a Loop lists: a collection's (W-308) or the archive's posts. */
function entriesFor(
  node: LoopNode,
  dynamic: ThemeDynamicData | undefined,
  mode: "public" | "editor",
): ThemePostFields[] {
  const collection = node.props.collection;
  if (!collection) return resolvePostsForLoop(dynamic, mode);
  const limit = node.props.limit ?? DEFAULT_LOOP_LIMIT;
  const found = dynamic?.collections?.[node.id];
  if (found) return found.slice(0, limit);
  return mode === "editor" ? sampleEntries(collection, limit) : [];
}

/**
 * One item per entry, from the chosen loop-item part or the loop's own children. A Loop's Empty
 * state child (W-308) is left out of the item design and shows when there are no entries; the
 * editor shows it under the items too, so it can be designed.
 */
export function renderLoop(
  node: LoopNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode | undefined {
  const posts = entriesFor(node, dynamic, ctx.mode);
  const itemPartId = node.props.itemPartId?.trim() ?? "";
  const templateLayout =
    itemPartId && dynamic?.loopTemplates ? dynamic.loopTemplates[itemPartId] : undefined;
  const own = node.children.filter((child) => child.type !== "loop-empty");
  const emptyNodes = node.children.filter((child) => child.type === "loop-empty");
  const templateNodes: LayoutNode[] = templateLayout ? templateLayout.root.children : own;
  // Items don't get the archive's page data: a Pagination belongs after the Loop (W-228).
  const { pagination: _pagination, ...rest } = dynamic ?? {};
  const empty = () => ctx.children(emptyNodes, rest);
  if (posts.length === 0) {
    const designed = empty();
    if (designed.length > 0) return ELEMENTS.loop.build(node as never, attrs, designed);
  }
  // Editor mode always has a sample post, so an empty item template would paint a zero-height box.
  if (posts.length === 0 || (ctx.mode === "editor" && templateNodes.length === 0)) {
    if (ctx.mode !== "editor") return undefined;
    return {
      tag: "div",
      attrs: { ...attrs, "data-emvb-loop-empty": "" },
      children: [
        ...ctx.children(emptyNodes, rest),
        "Choose a Loop Item, or add elements here to design the item.",
      ],
    };
  }
  const children: VNode[] = [];
  // A loop item part is another layout, so its ids may match the page's (W-250).
  const itemDynamic = templateLayout
    ? { ...rest, idOrigin: `${rest.idOrigin ?? ""}/l:${itemPartId}` }
    : rest;
  for (const post of posts) {
    children.push({
      tag: "div",
      attrs: { class: "emvb-loop-item", "data-emvb-loop-item": post.id },
      children: ctx.children(templateNodes, { ...itemDynamic, post, inLoopItem: true }),
    });
  }
  if (ctx.mode === "editor") children.push(...empty());
  return ELEMENTS.loop.build(node as never, attrs, children);
}
