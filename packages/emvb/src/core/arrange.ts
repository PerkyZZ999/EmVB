import { MAX_DEPTH, MAX_NODES } from "./limits.ts";
import {
  isContainerNode,
  isFormFieldType,
  isFormNode,
  isParentNode,
  isLayoutParentNode,
  LAYOUT_SCHEMA_VERSION,
  type ContainerNode,
  type FormNode,
  type LoopNode,
  type Layout,
  type LayoutNode,
} from "./schema/layout.ts";
import {
  findNode,
  insertNode,
  newNodeId,
  nodeChildren,
  removeNode,
  starterLayout,
} from "./tree-ops.ts";

/** A refused operation, with the reason shown or announced to the user (R-003). */
export type Refusal = { ok: false; reason: string };
export type Arranged = { ok: true; layout: Layout; selected: string } | Refusal;
export type Allowed = { ok: true } | Refusal;

/** What is being dropped: an element already on the page, or a new one from the Add panel. */
export type DragSource = { kind: "existing"; id: string } | { kind: "new"; node: LayoutNode };

export type Place = { parentId: string; index: number };

type Located = {
  node: LayoutNode;
  parent?: ContainerNode | FormNode | LoopNode;
  index: number;
  depth: number;
};

export const REASONS = {
  intoItself: "A container can't go inside itself.",
  notContainer: "Only layout containers, forms, and loops can hold other elements.",
  rootFixed: "The page's outer container can't be moved.",
  rootCopy: "The page's outer container can't be duplicated.",
  missing: "That element is no longer on the page.",
  tooDeep: `Elements can be nested at most ${MAX_DEPTH} levels deep.`,
  tooMany: `A page can have at most ${MAX_NODES} elements.`,
  first: "It's already first in its container.",
  last: "It's already last in its container.",
  top: "It's already at the top level.",
  noContainerAbove: "There's no container just above it to move into.",
  nestedForm: "A form can't go inside another form.",
  fieldOutsideForm: "Form fields must be placed inside a form.",
  formIntoField: "A form can only go inside a layout container.",
  tabOutsideTabs: "Tab panels can only go inside Tabs.",
  onlyTabPanels: "Tabs can only hold tab panels.",
} as const;

const refuse = (reason: string): Refusal => ({ ok: false, reason });

const isContainer = (node: LayoutNode): node is ContainerNode => node.type === "container";

function locate(layout: Layout, id: string): Located | undefined {
  const walk = (
    node: LayoutNode,
    parent: ContainerNode | FormNode | LoopNode | undefined,
    index: number,
    depth: number,
  ): Located | undefined => {
    if (node.id === id) return { node, parent, index, depth };
    // Containers and forms are drop/arrange parents. Still descend into unknown
    // children so nested ids can be found (they are not rearrangeable).
    if (isParentNode(node)) {
      for (const [i, child] of node.children.entries()) {
        const found = walk(child, node as ContainerNode, i, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    for (const child of nodeChildren(node)) {
      const found = walk(child, undefined, -1, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return walk(layout.root, undefined, 0, 1);
}

const size = (node: LayoutNode): number =>
  1 + nodeChildren(node).reduce((n, child) => n + size(child), 0);

const height = (node: LayoutNode): number => {
  const kids = nodeChildren(node);
  return 1 + (kids.length > 0 ? Math.max(...kids.map(height)) : 0);
};

const contains = (node: LayoutNode, id: string): boolean =>
  node.id === id || nodeChildren(node).some((child) => contains(child, id));

/** Whether `parentId` is a form or sits inside one. */
function underForm(layout: Layout, parentId: string): boolean {
  let current: string | undefined = parentId;
  while (current) {
    const found = locate(layout, current);
    if (!found) return false;
    if (isFormNode(found.node)) return true;
    current = found.parent?.id;
  }
  return false;
}

type Drop = { layout: Layout; node: LayoutNode; into: Located; isNew: boolean };

/** Placement rules in the order their reasons take precedence (R-003, W-034, W-074). */
const DROP_RULES: [breaks: (drop: Drop) => boolean, reason: string][] = [
  [
    ({ node, into }) => node.type === "tab-panel" && into.node.type !== "tabs",
    REASONS.tabOutsideTabs,
  ],
  [
    ({ node, into }) => into.node.type === "tabs" && node.type !== "tab-panel",
    REASONS.onlyTabPanels,
  ],
  [
    ({ node, into, layout }) => isFormNode(node) && underForm(layout, into.node.id),
    REASONS.nestedForm,
  ],
  [({ node, into }) => isFormNode(node) && !isLayoutParentNode(into.node), REASONS.formIntoField],
  [
    ({ node, into, layout }) => isFormFieldType(node.type) && !underForm(layout, into.node.id),
    REASONS.fieldOutsideForm,
  ],
  [({ node, into }) => into.depth + height(node) > MAX_DEPTH, REASONS.tooDeep],
  [
    ({ node, layout, isNew }) => isNew && size(layout.root) + size(node) > MAX_NODES,
    REASONS.tooMany,
  ],
];

/** The node being dragged, or why an existing one can't move into `parentId`. */
function dragged(
  layout: Layout,
  source: DragSource,
  parentId: string,
): { ok: true; node: LayoutNode } | Refusal {
  if (source.kind === "new") return { ok: true, node: source.node };
  const moving = locate(layout, source.id);
  if (!moving) return refuse(REASONS.missing);
  if (!moving.parent) return refuse(REASONS.rootFixed);
  if (contains(moving.node, parentId)) return refuse(REASONS.intoItself);
  return { ok: true, node: moving.node };
}

/** Whether `source` may go into parent `parentId` (R-003 invalid drops). */
export function canDrop(layout: Layout, source: DragSource, parentId: string): Allowed {
  const into = locate(layout, parentId);
  if (!into) return refuse(REASONS.missing);
  const moving = dragged(layout, source, parentId);
  if (!moving.ok) return moving;
  if (!isParentNode(into.node)) return refuse(REASONS.notContainer);
  const drop: Drop = { layout, node: moving.node, into, isNew: source.kind === "new" };
  const broken = DROP_RULES.find(([breaks]) => breaks(drop));
  return broken ? refuse(broken[1]) : { ok: true };
}

/**
 * Moves an element into `parentId` at `index`, where `index` counts the target's children as they
 * are before the move (what a drop indicator points at).
 */
export function moveNode(layout: Layout, id: string, parentId: string, index: number): Arranged {
  const allowed = canDrop(layout, { kind: "existing", id }, parentId);
  if (!allowed.ok) return allowed;
  const from = locate(layout, id) as Located & { parent: ContainerNode | FormNode | LoopNode };
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
  const kids = nodeChildren(node);
  const copy = { ...structuredClone(node), id } as LayoutNode;
  if (kids.length === 0) return copy;
  return { ...copy, children: kids.map((child) => withNewIds(child, taken, random)) } as LayoutNode;
}

function allIds(node: LayoutNode, into = new Set<string>()): Set<string> {
  into.add(node.id);
  for (const child of nodeChildren(node)) allIds(child, into);
  return into;
}

/** A deep copy of `node` whose ids (its own and every descendant's) are new and unused on `layout`. */
export const withFreshIds = (
  layout: Layout,
  node: LayoutNode,
  random: () => number = Math.random,
): LayoutNode => withNewIds(node, allIds(layout.root), random);

/**
 * A new page from a Page template theme part.
 * Ids are fresh, so editing the page does not rewrite the template or other pages.
 */
export function layoutFromPageTemplate(source: Layout, random: () => number = Math.random): Layout {
  if (!isContainerNode(source.root)) return starterLayout("Page", random);
  const blank: Layout = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: { id: "tplblank", type: "container", props: {}, children: [] },
  };
  const root = withFreshIds(blank, source.root, random);
  if (!isContainerNode(root)) return starterLayout("Page", random);
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, root };
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
  if (found && isParentNode(found.node))
    return { parentId: found.node.id, index: found.node.children.length };
  if (found?.parent) return { parentId: found.parent.id, index: found.index + 1 };
  return { parentId: layout.root.id, index: layout.root.children.length };
}

type Child = Located & { parent: NonNullable<Located["parent"]> };

/** Moves a non-root element to where `place` says, or returns the first refusal. */
function moveChild(layout: Layout, id: string, place: (found: Child) => Place | Refusal): Arranged {
  const found = locate(layout, id);
  if (!found) return refuse(REASONS.missing);
  if (!found.parent) return refuse(REASONS.rootFixed);
  const to = place(found as Child);
  return "ok" in to ? to : moveNode(layout, id, to.parentId, to.index);
}

/** Alt+↑: one place earlier among its siblings. */
export const moveUp = (layout: Layout, id: string): Arranged =>
  moveChild(layout, id, ({ parent, index }) =>
    index === 0 ? refuse(REASONS.first) : { parentId: parent.id, index: index - 1 },
  );

/** Alt+↓: one place later among its siblings. */
export const moveDown = (layout: Layout, id: string): Arranged =>
  moveChild(layout, id, ({ parent, index }) =>
    index === parent.children.length - 1
      ? refuse(REASONS.last)
      : { parentId: parent.id, index: index + 2 },
  );

/** Alt+←: out of its container, right after it. */
export const moveOut = (layout: Layout, id: string): Arranged =>
  moveChild(layout, id, ({ parent }) => {
    const outer = locate(layout, parent.id);
    return outer?.parent
      ? { parentId: outer.parent.id, index: outer.index + 1 }
      : refuse(REASONS.top);
  });

/** Alt+→: into the container just above it, as its last child. */
export const moveIn = (layout: Layout, id: string): Arranged =>
  moveChild(layout, id, ({ parent, index }) => {
    const above = parent.children[index - 1];
    return above && isContainer(above)
      ? { parentId: above.id, index: above.children.length }
      : refuse(REASONS.noContainerAbove);
  });

function documentOrder(layout: Layout): string[] {
  const ids: string[] = [];
  const walk = (node: LayoutNode) => {
    ids.push(node.id);
    nodeChildren(node).forEach(walk);
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
