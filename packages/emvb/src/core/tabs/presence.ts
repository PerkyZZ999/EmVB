import { isTabsNode, type Layout, type LayoutNode } from "../schema/layout.ts";
import { nodeChildren } from "../tree-ops.ts";

function walk(node: LayoutNode, visit: (node: LayoutNode) => void): void {
  visit(node);
  for (const child of nodeChildren(node)) walk(child, visit);
}

/** True when the layout includes at least one Tabs element (optional public runtime). */
export function layoutHasTabs(layout: Layout): boolean {
  let found = false;
  walk(layout.root, (node) => {
    if (isTabsNode(node)) found = true;
  });
  return found;
}
