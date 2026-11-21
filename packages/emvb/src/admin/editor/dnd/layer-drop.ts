import {
  canDrop,
  findNode,
  isParentNode,
  parentOf,
  type DragSource,
  type Layout,
} from "../../../core/index.ts";

/** W-1080: hovering a collapsed row this long during a drag opens it. */
export const EXPAND_DELAY_MS = 600;
/** W-1080: hovering the Layers tab this long during a drag from Add switches to it. */
export const TAB_SPRING_MS = 500;

/** Which part of a Layers row the pointer is over. */
export type LayerZone = "before" | "inside" | "after";

/**
 * A row's top quarter drops before it and its bottom quarter after it; the middle half drops
 * inside an element that holds others. Rows that hold nothing split in two. The page row always
 * takes the drop inside.
 */
export function layerZone(
  offsetY: number,
  height: number,
  holdsOthers: boolean,
  isRoot: boolean,
): LayerZone {
  if (isRoot) return "inside";
  const part = height > 0 ? offsetY / height : 0.5;
  if (!holdsOthers) return part < 0.5 ? "before" : "after";
  return part < 0.25 ? "before" : part > 0.75 ? "after" : "inside";
}

/** The deepest level whose indent the pointer has passed (`x` from the row's left edge). */
export function depthAtX(x: number, indent: (depth: number) => number, maxDepth: number): number {
  let depth = 0;
  while (depth < maxDepth && x >= indent(depth + 1)) depth += 1;
  return depth;
}

/** The row being hovered, as Layers shows it. */
export type LayerRowView = {
  id: string;
  depth: number;
  /** Expanded with its children shown below it. */
  open: boolean;
};

export type LayerPlace = {
  parentId: string;
  index: number;
  /** The depth the drop line is drawn at (the new element's depth). */
  depth: number;
  /** Line above or below the hovered row; null when the row itself is highlighted (inside). */
  edge: "top" | "bottom" | null;
};

const siblingsOf = (layout: Layout, id: string) => {
  const parentId = parentOf(layout, id);
  const parent = parentId ? findNode(layout, parentId) : undefined;
  return parent && isParentNode(parent)
    ? { parent, index: parent.children.findIndex((child) => child.id === id) }
    : null;
};

/**
 * Where a drop on `row` in `zone` goes. "after" an open element goes first inside it (the line
 * sits between it and its first child). "after" the last child can climb out `outdent` levels,
 * as the pointer moves left, to drop after its parent instead. Null when the row is gone.
 */
export function layerPlace(
  layout: Layout,
  row: LayerRowView,
  zone: LayerZone,
  outdent = 0,
): LayerPlace | null {
  const node = findNode(layout, row.id);
  if (!node) return null;
  if (zone === "inside" || row.id === layout.root.id) {
    if (!isParentNode(node)) return null;
    return { parentId: node.id, index: node.children.length, depth: row.depth + 1, edge: null };
  }
  if (zone === "before") {
    const at = siblingsOf(layout, row.id);
    return at ? { parentId: at.parent.id, index: at.index, depth: row.depth, edge: "top" } : null;
  }
  if (row.open && isParentNode(node) && node.children.length > 0) {
    return { parentId: node.id, index: 0, depth: row.depth + 1, edge: "bottom" };
  }
  let depth = row.depth;
  let at = siblingsOf(layout, row.id);
  while (at && outdent > 0 && at.index === at.parent.children.length - 1) {
    const up = siblingsOf(layout, at.parent.id);
    if (!up) break;
    depth -= 1;
    outdent -= 1;
    at = up;
  }
  if (!at) return null;
  return { parentId: at.parent.id, index: at.index + 1, depth, edge: "bottom" };
}

export type LayerDrop =
  | { ok: true; place: LayerPlace }
  | { ok: false; reason: string; place: LayerPlace };

/**
 * A Layers drop, checked with the canvas's own rule (`canDrop`): into itself or a descendant,
 * a parent that refuses the child, full Tabs and the like are refused with the canvas's reason.
 * An unknown source (the browser hides it until drop) is allowed provisionally; the drop checks
 * again.
 */
export function resolveLayerDrop(
  layout: Layout,
  row: LayerRowView,
  zone: LayerZone,
  source: DragSource | null,
  outdent = 0,
): LayerDrop | null {
  const place = layerPlace(layout, row, zone, outdent);
  if (!place) return null;
  if (!source) return { ok: true, place };
  const allowed = canDrop(layout, source, place.parentId);
  return allowed.ok ? { ok: true, place } : { ok: false, reason: allowed.reason, place };
}

/** Pixels to scroll the panel by for a pointer near its top or bottom edge during a drag. */
export function autoScrollStep(
  pointerY: number,
  top: number,
  bottom: number,
  edge = 32,
  max = 14,
): number {
  if (bottom - top < edge * 3) return 0;
  const speed = (into: number) => Math.ceil(max * Math.min(1, into / edge));
  if (pointerY < top + edge) return -speed(top + edge - pointerY);
  if (pointerY > bottom - edge) return speed(pointerY - (bottom - edge));
  return 0;
}
