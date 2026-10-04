import type { Layout, LayoutNode, StyleProps } from "../../../core/index.ts";
import { findNode, isParentNode, parentOf } from "../../../core/index.ts";

export type Rect = { top: number; left: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Direction = NonNullable<StyleProps["flexDirection"]>;

/** The MIME type an Add tile puts on `dataTransfer`, carrying the element type. */
export const NEW_ELEMENT_MIME = "application/x-emvb-new-element";

/** MIME for dragging an existing canvas/Layers element (carries its id). */
export const EXISTING_ELEMENT_MIME = "application/x-emvb-element-id";

/** Which EmVB drag payloads a `DataTransfer` carries. */
export const transferKinds = (transfer: DataTransfer | null) => {
  if (!transfer) return { neu: false, existing: false };
  const types = new Set(transfer.types);
  return {
    neu: types.has(NEW_ELEMENT_MIME),
    existing: types.has(EXISTING_ELEMENT_MIME),
  };
};

/** The `data-emvb-id` an event target belongs to, if any. */
export const idAt = (target: EventTarget | null): string | null => {
  const element = target as Element | null;
  const hit = element?.closest?.("[data-emvb-id]");
  return hit?.getAttribute("data-emvb-id") ?? null;
};

type Span = { start: number; end: number };

const along = (rect: Rect, row: boolean): Span =>
  row
    ? { start: rect.left, end: rect.left + rect.width }
    : { start: rect.top, end: rect.top + rect.height };

const middle = (span: Span) => (span.start + span.end) / 2;

/**
 * Splits children (in document order) into flex lines: a new line starts when a child no longer
 * overlaps the current line on the cross axis. Without wrapping there is exactly one line.
 */
function lines(rects: Rect[], row: boolean): number[][] {
  const result: number[][] = [];
  let cross: Span | null = null;
  for (const [i, rect] of rects.entries()) {
    const span = along(rect, !row);
    const current = result.at(-1);
    if (current && cross && span.start < cross.end && span.end > cross.start) {
      current.push(i);
      cross = { start: Math.min(cross.start, span.start), end: Math.max(cross.end, span.end) };
    } else {
      result.push([i]);
      cross = span;
    }
  }
  return result;
}

/**
 * The insertion index for a pointer over a flex container, given its children's rects in document
 * order: before the first child whose middle (along the main axis) is past the pointer.
 */
export function dropIndex(direction: Direction, children: Rect[], point: Point): number {
  if (children.length === 0) return 0;
  const row = direction.startsWith("row");
  const reverse = direction.endsWith("reverse");
  const pointer = row ? point.x : point.y;
  const crossPointer = row ? point.y : point.x;
  const groups = lines(children, row);
  const distance = (group: number[]) => {
    const spans = group.map((i) => along(children[i] as Rect, !row));
    const start = Math.min(...spans.map((s) => s.start));
    const end = Math.max(...spans.map((s) => s.end));
    return crossPointer < start ? start - crossPointer : Math.max(0, crossPointer - end);
  };
  const group = groups.reduce((best, next) => (distance(next) < distance(best) ? next : best));
  const before = group.find((i) => {
    const mid = middle(along(children[i] as Rect, row));
    return reverse ? pointer > mid : pointer < mid;
  });
  return before ?? (group.at(-1) as number) + 1;
}

/** Whether `parent` takes the element being dragged (usually `canDrop` for the known source). */
export type Accepts = (parent: LayoutNode) => boolean;

const anyParent: Accepts = (parent) => isParentNode(parent);

/**
 * The element a drop over `hoveredId` goes into (W-128): the nearest element at or above it that
 * takes the dragged element. A non-panel dropped on Tabs goes into its active panel
 * (`activePanel`, else the first panel). Falls back to the page's root.
 */
export function dropContainer(
  layout: Layout,
  hoveredId: string | null,
  accepts: Accepts = anyParent,
  activePanel?: (tabsId: string) => string | undefined,
): LayoutNode {
  let current: LayoutNode | undefined = hoveredId ? findNode(layout, hoveredId) : undefined;
  while (current) {
    if (isParentNode(current)) {
      if (accepts(current)) return current;
      if (current.type === "tabs") {
        const wanted = activePanel?.(current.id);
        const panel = current.children.find((child) => child.id === wanted) ?? current.children[0];
        if (panel && accepts(panel)) return panel;
      }
    }
    const parentId = parentOf(layout, current.id);
    current = parentId ? findNode(layout, parentId) : undefined;
  }
  return layout.root;
}

/** How close to a container's edge, along its parent's main axis, a drop goes beside it. */
const EDGE_ZONE = 10;

/**
 * Before/after edge zones (W-128): a pointer within `EDGE_ZONE` px (at most a quarter of its size)
 * of `container`'s start or end edge, along its parent's main axis, drops beside it in the
 * parent instead of inside it. Null when the pointer is in the middle, for the root, or when the
 * parent doesn't take the element.
 */
export function edgeDrop(
  layout: Layout,
  container: LayoutNode,
  rect: Rect,
  point: Point,
  accepts: Accepts = anyParent,
): { parentId: string; index: number } | null {
  const parentId = parentOf(layout, container.id);
  const parent = parentId ? findNode(layout, parentId) : undefined;
  if (!parent || !isParentNode(parent) || !accepts(parent)) return null;
  const direction = parent.style?.flexDirection ?? "column";
  const row = direction.startsWith("row");
  const span = along(rect, row);
  const zone = Math.min(EDGE_ZONE, (span.end - span.start) / 4);
  const pointer = row ? point.x : point.y;
  const index = parent.children.findIndex((child) => child.id === container.id);
  const reverse = direction.endsWith("reverse");
  if (pointer < span.start + zone)
    return { parentId: parent.id, index: reverse ? index + 1 : index };
  if (pointer > span.end - zone) return { parentId: parent.id, index: reverse ? index : index + 1 };
  return null;
}
