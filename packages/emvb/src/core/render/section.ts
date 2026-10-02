import { ELEMENTS } from "../elements/index.ts";
import type { SectionNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

const MAX_SECTION_DEPTH = 8;

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
    return ELEMENTS.section.build(node as never, attrs, ctx.children(node.children, dynamic));
  }
  if (!template || stack.includes(partId) || stack.length >= MAX_SECTION_DEPTH) {
    if (ctx.mode !== "editor") return ELEMENTS.section.build(node as never, attrs, []);
    return { tag: "div", attrs, children: ["Synced section"] };
  }
  const templateNodes = template.root.children;
  const next: ThemeDynamicData = { ...dynamic, sectionStack: [...stack, partId] };
  return ELEMENTS.section.build(node as never, attrs, ctx.children(templateNodes, next));
}
