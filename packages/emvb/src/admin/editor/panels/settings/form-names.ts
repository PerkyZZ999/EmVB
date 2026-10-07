import {
  findNode,
  isFormNode,
  parentOf,
  type Layout,
  type LayoutNode,
} from "../../../../core/index.ts";

const fieldOf = (node: LayoutNode): string => {
  const value = (node.props as Record<string, unknown> | undefined)?.field;
  return typeof value === "string" ? value.trim() : "";
};

/**
 * W-194: true when another control in the same form submits under this node's field name, so
 * one value would overwrite the other. Controls outside any form are not checked.
 */
export function duplicateFieldName(layout: Layout, nodeId: string): boolean {
  const self = findNode(layout, nodeId);
  const name = self ? fieldOf(self) : "";
  if (!name) return false;
  let current = parentOf(layout, nodeId);
  while (current) {
    const form = findNode(layout, current);
    if (form && isFormNode(form)) {
      let count = 0;
      const walk = (node: LayoutNode) => {
        if (node.id !== form.id && fieldOf(node) === name) count += 1;
        if ("children" in node && Array.isArray(node.children))
          for (const child of node.children) walk(child);
      };
      walk(form);
      return count > 1;
    }
    current = parentOf(layout, current);
  }
  return false;
}
