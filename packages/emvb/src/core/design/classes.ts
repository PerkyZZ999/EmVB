import type { Layout, LayoutNode } from "../schema/layout.ts";
import { nodeChildren, updateNode } from "../tree-ops.ts";

/** Reorder an applied class-id list. Out-of-range moves are no-ops. Pure (W-031). */
export function moveClassId(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const next = [...ids];
  const j = index + delta;
  if (index < 0 || index >= next.length || j < 0 || j >= next.length) return [...ids];
  const at = next[index];
  const swap = next[j];
  if (at === undefined || swap === undefined) return [...ids];
  next[index] = swap;
  next[j] = at;
  return next;
}

/** Add a class id if missing (max 20 — layout schema). Preserves order. */
export function addClassId(ids: readonly string[], id: string): string[] {
  if (ids.includes(id) || ids.length >= 20) return [...ids];
  return [...ids, id];
}

/** Remove a class id; missing id is a silent no-op. */
export function removeClassId(ids: readonly string[], id: string): string[] {
  return ids.filter((entry) => entry !== id);
}

function walk(node: LayoutNode, visit: (node: LayoutNode) => void): void {
  visit(node);
  for (const child of nodeChildren(node)) walk(child, visit);
}

/** Nodes that list `classId` in `node.classes` (W-032 delete dialog). */
export function findClassUsages(layout: Layout, classId: string): { nodeId: string }[] {
  const usages: { nodeId: string }[] = [];
  walk(layout.root, (node) => {
    if (node.classes?.includes(classId)) usages.push({ nodeId: node.id });
  });
  return usages;
}

/** Drop a class id from every node that lists it. Pure. */
export function clearClassRefs(layout: Layout, classId: string): Layout {
  let next = layout;
  for (const { nodeId } of findClassUsages(layout, classId)) {
    next = updateNode(next, nodeId, (node) => {
      const classes = (node.classes ?? []).filter((id) => id !== classId);
      if (classes.length === (node.classes ?? []).length) return node;
      if (classes.length === 0) {
        const { classes: _drop, ...rest } = node;
        return rest as LayoutNode;
      }
      return { ...node, classes };
    });
  }
  return next;
}
