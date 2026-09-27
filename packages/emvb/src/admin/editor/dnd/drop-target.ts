import type { Layout, LayoutNode, StyleProps } from "../../../core/index.ts";
import { findNode, parentOf } from "../../../core/index.ts";

export type Rect = { top: number; left: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Direction = NonNullable<StyleProps["flexDirection"]>;

/** The MIME type an Add tile puts on `dataTransfer`, carrying the element type. */
export const NEW_ELEMENT_MIME = "application/x-emvb-new-element";

/** MIME for dragging an existing canvas/Layers element (carries its id). */
export const EXISTING_ELEMENT_MIME = "application/x-emvb-element-id";

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

/** The container a drop over `hoveredId` goes into: the element itself if it's a container, else its parent. */
export function dropContainer(layout: Layout, hoveredId: string | null): LayoutNode {
  const hovered = hoveredId ? findNode(layout, hoveredId) : undefined;
  if (!hovered) return layout.root;
  if (hovered.type === "container" || hovered.type === "loop") return hovered;
  const parentId = parentOf(layout, hovered.id);
  return (parentId && findNode(layout, parentId)) || layout.root;
}
