import { holdsChildren } from "./extensions/slot-rules.ts";
import {
  isContainerNode,
  isParentNode,
  type ContainerNode,
  type Layout,
  type LayoutNode,
  LAYOUT_SCHEMA_VERSION,
} from "./schema/layout.ts";

/** Children of a parent node (container/form), or of an unknown node that carried children (W-022). */
export const nodeChildren = (node: LayoutNode): LayoutNode[] => {
  if (isParentNode(node)) return node.children;
  if ("children" in node && Array.isArray(node.children)) return node.children as LayoutNode[];
  return [];
};

/**
 * Whether the editor treats `node` as a parent: a built-in container, or (extensionApi 1.5) an
 * extension element that declares a slot. Drops, moves and the Layers tree all ask this.
 */
export const canParent = (node: LayoutNode): boolean =>
  isParentNode(node) || holdsChildren(node.type);
/** Children of a known parent only. Unknown nodes are not descended into (W-353). */
export const knownChildren = (node: LayoutNode): readonly LayoutNode[] =>
  isParentNode(node) ? node.children : [];

/** Visit `node` and every node under it. Pass `knownChildren` to skip unknown nodes. */
export function forEachNode(
  node: LayoutNode,
  visit: (node: LayoutNode) => void,
  children: (node: LayoutNode) => readonly LayoutNode[] = nodeChildren,
): void {
  visit(node);
  for (const child of children(node)) forEachNode(child, visit, children);
}

/** True when `test` matches `node` or anything under it. Same descent choice as `forEachNode`. */
export function someNode(
  node: LayoutNode,
  test: (node: LayoutNode) => boolean,
  children: (node: LayoutNode) => readonly LayoutNode[] = nodeChildren,
): boolean {
  return test(node) || children(node).some((child) => someNode(child, test, children));
}

export type LayoutIndex = {
  byId: Map<string, LayoutNode>;
  /** Parent id for a node under a container or form. A child of an unknown node has none. */
  parentOf: Map<string, string>;
};

const indexes = new WeakMap<Layout, LayoutIndex>();

/**
 * One walk for later id and parent lookups. The same layout object keeps the result, so a render
 * that asks many times walks once. A page stays within 2000 elements and 24 levels.
 */
export function indexLayout(layout: Layout): LayoutIndex {
  const cached = indexes.get(layout);
  if (cached) return cached;
  const byId = new Map<string, LayoutNode>();
  const parents = new Map<string, string>();
  const seen = new Set<LayoutNode>();
  const walk = (node: LayoutNode, parentId: string | undefined) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (!byId.has(node.id)) {
      byId.set(node.id, node);
      if (parentId) parents.set(node.id, parentId);
    }
    const nextParent = canParent(node) ? node.id : undefined;
    for (const child of nodeChildren(node)) walk(child, nextParent);
  };
  walk(layout.root, undefined);
  const index: LayoutIndex = { byId, parentOf: parents };
  indexes.set(layout, index);
  return index;
}

/** Where a removed node was, so it can be put back exactly (the Restore toast, D-025). */
export type Removed = { node: LayoutNode; parentId: string; index: number };

export function findNode(layout: Layout, id: string): LayoutNode | undefined {
  const walk = (node: LayoutNode): LayoutNode | undefined => {
    if (node.id === id) return node;
    for (const child of nodeChildren(node)) {
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  };
  return walk(layout.root);
}

function mapTree(node: LayoutNode, fn: (node: LayoutNode) => LayoutNode): LayoutNode {
  const mapped = fn(node);
  const kids = nodeChildren(mapped);
  if (kids.length === 0 && !isParentNode(mapped)) return mapped;
  if (isParentNode(mapped)) {
    return { ...mapped, children: mapped.children.map((child) => mapTree(child, fn)) };
  }
  if ("children" in mapped && Array.isArray(mapped.children)) {
    return {
      ...mapped,
      children: (mapped.children as LayoutNode[]).map((child) => mapTree(child, fn)),
    };
  }
  return mapped;
}

/** Replaces the node with `id` by `update(node)`. Pure: the input layout is not changed. */
export function updateNode(
  layout: Layout,
  id: string,
  update: (node: LayoutNode) => LayoutNode,
): Layout {
  const root = mapTree(layout.root, (node) => (node.id === id ? update(node) : node));
  return { ...layout, root: root as ContainerNode };
}

/** Removes a node (never the root) and reports where it was. */
export function removeNode(layout: Layout, id: string): { layout: Layout; removed?: Removed } {
  if (layout.root.id === id) return { layout };
  let removed: Removed | undefined;
  const root = mapTree(layout.root, (node) => {
    if (!canParent(node)) return node;
    const children = nodeChildren(node);
    const index = children.findIndex((child) => child.id === id);
    if (index === -1) return node;
    removed = { node: children[index] as LayoutNode, parentId: node.id, index };
    return { ...node, children: children.filter((child) => child.id !== id) } as LayoutNode;
  });
  return removed ? { layout: { ...layout, root: root as ContainerNode }, removed } : { layout };
}

/** Inserts `node` into container `parentId` at `index` (clamped). Unknown parents leave it unchanged. */
export function insertNode(
  layout: Layout,
  parentId: string,
  index: number,
  node: LayoutNode,
): Layout {
  return updateNode(layout, parentId, (parent) => {
    if (!canParent(parent)) return parent;
    const children = nodeChildren(parent);
    const at = Math.max(0, Math.min(index, children.length));
    return {
      ...parent,
      children: [...children.slice(0, at), node, ...children.slice(at)],
    } as LayoutNode;
  });
}

/**
 * The id of the node a validation path points at, for example `root.children[0].props.level`.
 * Used to select the element at fault when the server rejects a save (IA, 422 handling).
 */
export function nodeIdAtPath(layout: Layout, path: string): string | undefined {
  if (!path.startsWith("root")) return undefined;
  let node: LayoutNode = layout.root;
  for (const match of path.slice(4).matchAll(/\.children\[(\d+)\]/g)) {
    const kids = nodeChildren(node);
    if (kids.length === 0 && !isContainerNode(node)) break;
    const next: LayoutNode | undefined = kids[Number(match[1])];
    if (!next) break;
    node = next;
  }
  return node.id;
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A short random node id (A-06). */
export function newNodeId(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 8; i++) id += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)];
  return id;
}

/** The S1 page every new page starts from: a column container with the title as its heading. */
export function starterLayout(title: string, random?: () => number): Layout {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: newNodeId(random),
      type: "container",
      props: {},
      style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
      children: [{ id: newNodeId(random), type: "heading", props: { text: title, level: 1 } }],
    },
  };
}

/**
 * W-554: a page's URL slug from its title, made the way EmDash makes entry slugs: NFKC,
 * lowercase, spaces and underscores to hyphens, and letters, digits and marks of any script
 * kept, cut to 80 characters as people see them. Empty when nothing usable is left (EmDash
 * would then name it `untitled-…`). Class and variable ids keep `slugify`'s ASCII.
 */
export function pageSlug(text: string, max = 80): string {
  const slug = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}\p{M}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/[\p{L}\p{N}]/u.test(slug)) return "";
  let out = "";
  let count = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
    slug,
  )) {
    if (count >= max) break;
    out += segment;
    count++;
  }
  return out.replace(/-+$/g, "");
}

/** A URL slug from a title: lowercase ASCII letters, digits and single hyphens. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
