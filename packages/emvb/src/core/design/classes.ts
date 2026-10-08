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

/**
 * Move a class one step in the site list. Later classes win when they set the same property,
 * because their CSS rule comes later. Out of range is a no-op. Pure.
 */
export function moveDesignClass(
  design: DesignSystem,
  classId: string,
  delta: -1 | 1,
): DesignSystem {
  const classes = [...(design.classes ?? [])];
  const index = classes.findIndex((cls) => cls.id === classId);
  const j = index + delta;
  if (index < 0 || j < 0 || j >= classes.length) return design;
  const next = classes.slice();
  const at = next[index];
  const swap = next[j];
  if (at === undefined || swap === undefined) return design;
  next[index] = swap;
  next[j] = at;
  return { ...design, classes: next };
}

const filled = (style: object | undefined) =>
  !!style && Object.values(style).some((value) => value !== undefined);

/** Whether an element has local styles: base, hover/focus/active or tablet/mobile (W-134). */
export function hasLocalStyles(node: LayoutNode): boolean {
  return (
    filled(node.style) ||
    Object.values(node.states ?? {}).some(filled) ||
    Object.values(node.devices ?? {}).some(filled)
  );
}

/** Why "Save local styles as class" can't run, or null when it can (W-134). */
/** Most classes a site may have; the design schema refuses more (W-218). */
export const MAX_CLASSES = 100;

/** A class name as saved: control characters gone, trimmed, at most 60 characters (W-218). */
export function cleanClassName(name: string): string {
  const spaced = Array.from(name, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 ? " " : ch;
  }).join("");
  return spaced.replace(/ {2,}/g, " ").trim().slice(0, 60).trim();
}

export function localToClassRefusal(design: DesignSystem, node: LayoutNode): string | null {
  if (!hasLocalStyles(node)) return "This element has no local styles to save.";
  if ((design.classes ?? []).length >= MAX_CLASSES)
    return "This site already has 100 classes, the most allowed.";
  if ((node.classes ?? []).length >= 20) return "20 classes is the most one element can have.";
  return null;
}

/**
 * Moves an element's local, state and tablet/mobile styles into a new class, applied last on the
 * element and added last in Site styles, so it wins over the element's other classes as the local
 * styles did (W-134). Visibility (`hiddenOn`) stays on the element. Null when it can't run. Pure.
 */
export function localStylesToClass(
  design: DesignSystem,
  node: LayoutNode,
  name: string,
): { design: DesignSystem; node: LayoutNode; classId: string } | null {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed || localToClassRefusal(design, node)) return null;
  const classes = design.classes ?? [];
  const base = slugify(trimmed).slice(0, 34) || "class";
  const taken = new Set(classes.map((c) => c.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  const cls = {
    id,
    name: trimmed,
    style: structuredClone(node.style ?? {}) as StyleProps,
    ...(node.states ? { states: structuredClone(node.states) } : {}),
    ...(node.devices ? { devices: structuredClone(node.devices) } : {}),
  };
  const { style: _style, states: _states, devices: _devices, ...rest } = node;
  return {
    design: { ...design, classes: [...classes, cls] },
    node: { ...rest, classes: addClassId(node.classes ?? [], id) } as LayoutNode,
    classId: id,
  };
}

/** Duplicate a design class with a new id/name, deep-copying all its styles. Pure (W-071, W-135). */
export function duplicateClass(
  design: DesignSystem,
  classId: string,
  randomSuffix?: string,
): DesignSystem {
  const classes = design.classes ?? [];
  const source = classes.find((c) => c.id === classId);
  // At the cap the copy would make the design invalid and the save fail (W-218).
  if (!source || classes.length >= MAX_CLASSES) return design;
  // W-277: "Card copy", then "Card copy 2"…, so the copy's name is free too.
  const stem = `${source.name.slice(0, 52).trim()} copy`;
  let baseName = stem;
  for (let n = 2; n <= MAX_CLASSES && classNameTaken(design, baseName); n++) {
    baseName = `${stem} ${n}`;
  }
  const base = slugify(baseName).slice(0, 34) || "class";
  const taken = new Set(classes.map((c) => c.id));
  let id = randomSuffix ? `${base}-${randomSuffix}`.slice(0, 40) : base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`.slice(0, 40);
  // Every part of the class, tablet and mobile styles and Hide on included (W-135).
  const copy = { ...structuredClone(source), id, name: baseName };
  return { ...design, classes: [...classes, copy] };
}

/**
 * W-277: whether another class already has this name (case-insensitive). Two classes with one
 * name can't be told apart in the class picker or the Site styles list.
 */
export function classNameTaken(design: DesignSystem, name: string, exceptId?: string): boolean {
  const wanted = cleanClassName(name).toLowerCase();
  return (design.classes ?? []).some((c) => c.id !== exceptId && c.name.toLowerCase() === wanted);
}

/** The message shown when a new or renamed class would take another class's name (W-277). */
export const classNameTakenMessage = (name: string) =>
  `A class named "${cleanClassName(name)}" already exists. Pick another name.`;

/**
 * Rename a design class; the id (and so its `.emvb-k-<id>` selector) stays. A name another class
 * has is refused (W-277). Pure (W-087).
 */
export function renameClass(design: DesignSystem, classId: string, name: string): DesignSystem {
  const trimmed = cleanClassName(name);
  const classes = design.classes ?? [];
  if (!trimmed || !classes.some((c) => c.id === classId)) return design;
  if (classNameTaken(design, trimmed, classId)) return design;
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
