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
/** Loops inside loop items, at most this deep (W-654). */
const MAX_LOOP_DEPTH = 4;

function countNodes(nodes: readonly LayoutNode[]): number {
  let count = 0;
  const stack: LayoutNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as LayoutNode;
    count++;
    const kids = (node as { children?: LayoutNode[] }).children;
    if (Array.isArray(kids)) for (const child of kids) stack.push(child);
  }
  return count;
}

export function renderLoop(
  node: LoopNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode | undefined {
  const posts = entriesFor(node, dynamic, ctx.mode);
  const itemPartId = node.props.itemPartId?.trim() ?? "";
  const loopStack = dynamic?.loopStack ?? [];
  // W-654: a loop item part holding a Loop that uses the same part (or one that leads back to it)
  // recursed until the stack overflowed and the page failed to render.
  const cycle = itemPartId !== "" && loopStack.includes(itemPartId);
  if (cycle || loopStack.length >= MAX_LOOP_DEPTH) {
    if (ctx.mode === "public") return undefined;
    return { tag: "div", attrs: { ...attrs, "data-emvb-loop-empty": "" }, children: ["Loop"] };
  }
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
  // W-602: on the page, no item design means nothing to list, not a row of blank items (empty
  // bordered boxes with Cards).
  if (posts.length === 0 || templateNodes.length === 0) {
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
  const itemDynamic = {
    ...(templateLayout ? { ...rest, idOrigin: `${rest.idOrigin ?? ""}/l:${itemPartId}` } : rest),
    loopStack: [...loopStack, itemPartId || node.id],
  };
  const itemSize = countNodes(templateNodes);
  for (const post of posts) {
    // W-654: nested Loops multiply like nested sections; they share the render's budget.
    if (ctx.takeSectionBudget && !ctx.takeSectionBudget(itemSize)) break;
    children.push({
      tag: "div",
      attrs: { class: "emvb-loop-item", "data-emvb-loop-item": post.id, role: "listitem" },
      children: ctx.children(templateNodes, { ...itemDynamic, post, inLoopItem: true }),
    });
  }
  // W-789: entries were bare divs, so screen readers didn't hear "list, 4 items" and a repeated
  // "Read more" had no list item to take its purpose from (WCAG 1.3.1, 2.4.4). The editor adds the
  // Empty state under the items; a list may hold only its items, so the roles go only then.
  const extras = ctx.mode === "editor" ? empty() : [];
  if (extras.length > 0) {
    for (const item of children) delete item.attrs.role;
    return ELEMENTS.loop.build(node as never, attrs, [...children, ...extras]);
  }
  return ELEMENTS.loop.build(node as never, { ...attrs, role: "list" }, children);
}
