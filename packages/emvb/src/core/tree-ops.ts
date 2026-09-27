import {
  isContainerNode,
  isParentNode,
  type ContainerNode,
  type Layout,
  type LayoutNode,
} from "./schema/layout.ts";

/** Children of a parent node (container/form), or of an unknown node that carried children (W-022). */
export const nodeChildren = (node: LayoutNode): LayoutNode[] => {
  if (isParentNode(node)) return node.children;
  if ("children" in node && Array.isArray(node.children)) return node.children as LayoutNode[];
  return [];
};

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
    if (!isParentNode(node)) return node;
    const index = node.children.findIndex((child) => child.id === id);
    if (index === -1) return node;
    removed = { node: node.children[index] as LayoutNode, parentId: node.id, index };
    return { ...node, children: node.children.filter((child) => child.id !== id) };
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
    if (!isParentNode(parent)) return parent;
    const at = Math.max(0, Math.min(index, parent.children.length));
    return {
      ...parent,
      children: [...parent.children.slice(0, at), node, ...parent.children.slice(at)],
    };
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
    schemaVersion: 1,
    root: {
      id: newNodeId(random),
      type: "container",
      props: {},
      style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
      children: [{ id: newNodeId(random), type: "heading", props: { text: title, level: 1 } }],
    },
  };
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
