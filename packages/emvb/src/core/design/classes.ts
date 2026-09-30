import type { DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import type { StyleProps } from "../schema/style.ts";
import { nodeChildren, slugify, updateNode } from "../tree-ops.ts";

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

/** Duplicate a design class with a new id/name. Pure (W-071). */
export function duplicateClass(
  design: DesignSystem,
  classId: string,
  randomSuffix?: string,
): DesignSystem {
  const classes = design.classes ?? [];
  const source = classes.find((c) => c.id === classId);
  if (!source) return design;
  const baseName = `${source.name} copy`;
  const base = slugify(baseName).slice(0, 34) || "class";
  const taken = new Set(classes.map((c) => c.id));
  let id = randomSuffix ? `${base}-${randomSuffix}`.slice(0, 40) : base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`.slice(0, 40);
  const style = { ...source.style } as StyleProps;
  const copy = source.states
    ? { id, name: baseName, style, states: structuredClone(source.states) }
    : { id, name: baseName, style };
  return { ...design, classes: [...classes, copy] };
}

/** Rename a design class; the id (and so its `.emvb-k-<id>` selector) stays. Pure (W-087). */
export function renameClass(design: DesignSystem, classId: string, name: string): DesignSystem {
  const trimmed = name.trim();
  const classes = design.classes ?? [];
  if (!trimmed || !classes.some((c) => c.id === classId)) return design;
  return {
    ...design,
    classes: classes.map((c) => (c.id === classId ? Object.assign({}, c, { name: trimmed }) : c)),
  };
}

/** Merge `patch` into a class's style; `undefined` values clear their property. Pure (W-087). */
export function patchClassStyle(
  design: DesignSystem,
  classId: string,
  patch: Partial<StyleProps>,
): DesignSystem {
  const classes = design.classes ?? [];
  if (!classes.some((c) => c.id === classId)) return design;
  return {
    ...design,
    classes: classes.map((c) => {
      if (c.id !== classId) return c;
      const style: Record<string, unknown> = { ...c.style, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete style[key];
      return Object.assign({}, c, { style: style as StyleProps });
    }),
  };
}

/** Swap one applied class id for another in place, keeping the cascade order. Pure (W-087). */
export function replaceClassId(ids: readonly string[], from: string, to: string): string[] {
  if (ids.includes(to)) return removeClassId(ids, from);
  return ids.map((id) => (id === from ? to : id));
}
