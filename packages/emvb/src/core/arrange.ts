import { MAX_DEPTH, MAX_NODES } from "./limits.ts";
import type { ContainerNode, Layout, LayoutNode } from "./schema/layout.ts";
import { findNode, insertNode, newNodeId, removeNode } from "./tree-ops.ts";

/** A refused operation, with the reason shown or announced to the user (R-003). */
export type Refusal = { ok: false; reason: string };
export type Arranged = { ok: true; layout: Layout; selected: string } | Refusal;
export type Allowed = { ok: true } | Refusal;

/** What is being dropped: an element already on the page, or a new one from the Add panel. */
export type DragSource = { kind: "existing"; id: string } | { kind: "new"; node: LayoutNode };

export type Place = { parentId: string; index: number };

type Located = { node: LayoutNode; parent?: ContainerNode; index: number; depth: number };

export const REASONS = {
  intoItself: "A container can't go inside itself.",
  notContainer: "Only containers can hold other elements.",
  rootFixed: "The page's outer container can't be moved.",
  rootCopy: "The page's outer container can't be duplicated.",
  missing: "That element is no longer on the page.",
  tooDeep: `Elements can be nested at most ${MAX_DEPTH} levels deep.`,
  tooMany: `A page can have at most ${MAX_NODES} elements.`,
  first: "It's already first in its container.",
  last: "It's already last in its container.",
  top: "It's already at the top level.",
  noContainerAbove: "There's no container just above it to move into.",
} as const;

const refuse = (reason: string): Refusal => ({ ok: false, reason });

const isContainer = (node: LayoutNode): node is ContainerNode => node.type === "container";

function locate(layout: Layout, id: string): Located | undefined {
  const walk = (
    node: LayoutNode,
    parent: ContainerNode | undefined,
    index: number,
    depth: number,
  ): Located | undefined => {
    if (node.id === id) return { node, parent, index, depth };
    if (!isContainer(node)) return undefined;
    for (const [i, child] of node.children.entries()) {
      const found = walk(child, node, i, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return walk(layout.root, undefined, 0, 1);
}

const size = (node: LayoutNode): number =>
  1 + (isContainer(node) ? node.children.reduce((n, child) => n + size(child), 0) : 0);

const height = (node: LayoutNode): number =>
  1 + (isContainer(node) ? Math.max(0, ...node.children.map(height)) : 0);

const contains = (node: LayoutNode, id: string): boolean =>
  node.id === id || (isContainer(node) && node.children.some((child) => contains(child, id)));

/** Whether `source` may go into container `parentId` (R-003 invalid drops). */
export function canDrop(layout: Layout, source: DragSource, parentId: string): Allowed {
  const target = locate(layout, parentId);
  if (!target) return refuse(REASONS.missing);
  let node: LayoutNode;
  if (source.kind === "existing") {
    const moving = locate(layout, source.id);
    if (!moving) return refuse(REASONS.missing);
    if (!moving.parent) return refuse(REASONS.rootFixed);
    if (contains(moving.node, parentId)) return refuse(REASONS.intoItself);
    node = moving.node;
  } else {
    node = source.node;
  }
  if (!isContainer(target.node)) return refuse(REASONS.notContainer);
  if (target.depth + height(node) > MAX_DEPTH) return refuse(REASONS.tooDeep);
  if (source.kind === "new" && size(layout.root) + size(node) > MAX_NODES)
    return refuse(REASONS.tooMany);
  return { ok: true };
}

/**
 * Moves an element into `parentId` at `index`, where `index` counts the target's children as they
 * are before the move (what a drop indicator points at).
 */
export function moveNode(layout: Layout, id: string, parentId: string, index: number): Arranged {
  const allowed = canDrop(layout, { kind: "existing", id }, parentId);
  if (!allowed.ok) return allowed;
  const from = locate(layout, id) as Located & { parent: ContainerNode };
  const sameParent = from.parent.id === parentId;
  const at = sameParent && from.index < index ? index - 1 : index;
  const { layout: without, removed } = removeNode(layout, id);
  if (!removed) return refuse(REASONS.missing);
  return { ok: true, layout: insertNode(without, parentId, at, removed.node), selected: id };
}

/** Adds a new element (from the Add panel) into `parentId` at `index`. */
export function addNode(layout: Layout, node: LayoutNode, place: Place): Arranged {
  const allowed = canDrop(layout, { kind: "new", node }, place.parentId);
  if (!allowed.ok) return allowed;
  return {
    ok: true,
    layout: insertNode(layout, place.parentId, place.index, node),
    selected: node.id,
  };
}

function withNewIds(node: LayoutNode, taken: Set<string>, random: () => number): LayoutNode {
  let id = newNodeId(random);
  while (taken.has(id)) id = newNodeId(random);
  taken.add(id);
  if (!isContainer(node)) return { ...structuredClone(node), id };
  return {
    ...structuredClone(node),
    id,
    children: node.children.map((child) => withNewIds(child, taken, random)),
  };
}

function allIds(node: LayoutNode, into = new Set<string>()): Set<string> {
  into.add(node.id);
  if (isContainer(node)) for (const child of node.children) allIds(child, into);
  return into;
}

/** A deep copy with new unique ids, inserted right after the original and selected. */
export function duplicateNode(
  layout: Layout,
  id: string,
  random: () => number = Math.random,
): Arranged {
  const found = locate(layout, id);
  if (!found) return refuse(REASONS.missing);
  if (!found.parent) return refuse(REASONS.rootCopy);
  if (size(layout.root) + size(found.node) > MAX_NODES) return refuse(REASONS.tooMany);
  const copy = withNewIds(found.node, allIds(layout.root), random);
  return {
    ok: true,
    layout: insertNode(layout, found.parent.id, found.index + 1, copy),
    selected: copy.id,
  };
}

/** Where click-to-add puts a new element: into a selected container, after a selected element, or at the end. */
export function insertionPoint(layout: Layout, selectedId: string | null): Place {
  const found = selectedId ? locate(layout, selectedId) : undefined;
  if (found && isContainer(found.node))
    return { parentId: found.node.id, index: found.node.children.length };
  if (found?.parent) return { parentId: found.parent.id, index: found.index + 1 };
  return { parentId: layout.root.id, index: layout.root.children.length };
}

/** Alt+↑: one place earlier among its siblings. */
export function moveUp(layout: Layout, id: string): Arranged {
  const found = locate(layout, id);
  if (!found) return refuse(REASONS.missing);
  if (!found.parent) return refuse(REASONS.rootFixed);
  if (found.index === 0) return refuse(REASONS.first);
  return moveNode(layout, id, found.parent.id, found.index - 1);
}

/** Alt+↓: one place later among its siblings. */
export function moveDown(layout: Layout, id: string): Arranged {
  const found = locate(layout, id);
  if (!found) return refuse(REASONS.missing);
  if (!found.parent) return refuse(REASONS.rootFixed);
  if (found.index === found.parent.children.length - 1) return refuse(REASONS.last);
  return moveNode(layout, id, found.parent.id, found.index + 2);
}

/** Alt+←: out of its container, right after it. */
export function moveOut(layout: Layout, id: string): Arranged {
  const found = locate(layout, id);
  if (!found) return refuse(REASONS.missing);
  if (!found.parent) return refuse(REASONS.rootFixed);
  const parent = locate(layout, found.parent.id);
  if (!parent?.parent) return refuse(REASONS.top);
  return moveNode(layout, id, parent.parent.id, parent.index + 1);
}

/** Alt+→: into the container just above it, as its last child. */
export function moveIn(layout: Layout, id: string): Arranged {
  const found = locate(layout, id);
  if (!found) return refuse(REASONS.missing);
  if (!found.parent) return refuse(REASONS.rootFixed);
  const above = found.parent.children[found.index - 1];
  if (!above || !isContainer(above)) return refuse(REASONS.noContainerAbove);
  return moveNode(layout, id, above.id, above.children.length);
}

function documentOrder(layout: Layout): string[] {
  const ids: string[] = [];
  const walk = (node: LayoutNode) => {
    ids.push(node.id);
    if (isContainer(node)) node.children.forEach(walk);
  };
  walk(layout.root);
  return ids;
}

/** ↓ on the canvas: the next element in document order, or the same one at the end. */
export function nextInOrder(layout: Layout, id: string): string {
  const ids = documentOrder(layout);
  const at = ids.indexOf(id);
  return at === -1 ? layout.root.id : (ids[at + 1] ?? id);
}

/** ↑ on the canvas: the previous element in document order, or the same one at the start. */
export function previousInOrder(layout: Layout, id: string): string {
  const ids = documentOrder(layout);
  const at = ids.indexOf(id);
  return at === -1 ? layout.root.id : (ids[at - 1] ?? id);
}

/** Enter: the first child of a container, if it has one. */
export function firstChild(layout: Layout, id: string): string | undefined {
  const node = findNode(layout, id);
  return node && isContainer(node) ? node.children[0]?.id : undefined;
}

/** Shift+Enter: the parent container, if any. */
export function parentOf(layout: Layout, id: string): string | undefined {
  return locate(layout, id)?.parent?.id;
}

/** Who gets the selection after `id` is deleted: the next sibling, else the previous one, else the parent. */
export function selectionAfterDelete(layout: Layout, id: string): string | null {
  const found = locate(layout, id);
  if (!found?.parent) return null;
  const siblings = found.parent.children;
  return (siblings[found.index + 1] ?? siblings[found.index - 1] ?? found.parent).id;
}

/** How many elements a deletion removes (the element plus everything inside it). */
export function subtreeSize(layout: Layout, id: string): number {
  const node = findNode(layout, id);
  return node ? size(node) : 0;
}
