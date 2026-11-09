import { ELEMENTS } from "../elements/index.ts";
import type { SectionNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

const MAX_SECTION_DEPTH = 8;

const sizes = new WeakMap<object, number>();
/** Elements in a part's layout, counted once per layout object. */
function partSize(nodes: readonly object[]): number {
  const cached = sizes.get(nodes);
  if (cached !== undefined) return cached;
  let count = 0;
  const stack: unknown[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop() as { children?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    count++;
    if (Array.isArray(node.children)) for (const child of node.children) stack.push(child);
  }
  sizes.set(nodes, count);
  return count;
}

/**
 * A section with `partId` renders that theme part's children.
 * A missing part stays empty on the public site (local children would drift from the source).
 */
export function renderSection(
  node: SectionNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode {
  const partId = node.props.partId?.trim() ?? "";
  const stack = dynamic?.sectionStack ?? [];
  const template =
    partId && dynamic?.sectionTemplates ? dynamic.sectionTemplates[partId] : undefined;
  if (!partId) {
    return ELEMENTS["part-ref"].build(node as never, attrs, ctx.children(node.children, dynamic));
  }
  if (!template || stack.includes(partId) || stack.length >= MAX_SECTION_DEPTH) {
    if (ctx.mode !== "editor") return ELEMENTS["part-ref"].build(node as never, attrs, []);
    return { tag: "div", attrs, children: ["Synced section"] };
  }
  // W-653: past the render's budget a copy renders like a missing part. W-657: the editor
  // says why, instead of the same placeholder a deleted part shows.
  if (ctx.takeSectionBudget && !ctx.takeSectionBudget(partSize(template.root.children))) {
    if (ctx.mode !== "editor") return ELEMENTS["part-ref"].build(node as never, attrs, []);
    return {
      tag: "div",
      attrs,
      children: ["Synced section not shown: this page already holds too many synced copies."],
    };
  }
  const templateNodes = template.root.children;
  const next: ThemeDynamicData = {
    ...dynamic,
    sectionStack: [...stack, partId],
    idOrigin: `${dynamic?.idOrigin ?? ""}/s:${partId}`,
  };
  return ELEMENTS["part-ref"].build(node as never, attrs, ctx.children(templateNodes, next));
}
