import { ELEMENTS } from "../elements/index.ts";
import type { LayoutNode, LoopNode } from "../schema/layout.ts";
import { resolvePostsForLoop, type ThemeDynamicData } from "../theme/dynamic.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

/** One item per post, from the chosen loop-item part or the loop's own children. */
export function renderLoop(
  node: LoopNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode | undefined {
  const posts = resolvePostsForLoop(dynamic, ctx.mode);
  const itemPartId = node.props.itemPartId?.trim() ?? "";
  const templateLayout =
    itemPartId && dynamic?.loopTemplates ? dynamic.loopTemplates[itemPartId] : undefined;
  const templateNodes: LayoutNode[] = templateLayout ? templateLayout.root.children : node.children;
  if (posts.length === 0) {
    if (ctx.mode !== "editor") return undefined;
    return {
      tag: "div",
      attrs: { ...attrs, "data-emvb-loop-empty": "" },
      children: ["Loop — add posts on the public archive to see items."],
    };
  }
  const children: VNode[] = [];
  for (const post of posts) {
    children.push({
      tag: "div",
      attrs: { class: "emvb-loop-item", "data-emvb-loop-item": post.id },
      children: ctx.children(templateNodes, { ...dynamic, post }),
    });
  }
  return ELEMENTS.loop.build(node as never, attrs, children);
}
