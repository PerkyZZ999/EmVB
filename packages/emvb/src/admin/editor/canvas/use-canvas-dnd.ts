import * as React from "react";
import {
  canDrop,
  findNode,
  isParentNode,
  parentOf,
  REASONS,
  type DragSource,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";
import {
  dropContainer,
  dropIndex,
  edgeDrop,
  flowDirection,
  idAt,
  transferKinds,
  type Direction,
  type Rect,
} from "../dnd/drop-target.ts";
import { draggedSource } from "../dnd/dragged-source.ts";
import { useCanvasEvents } from "./canvas-events.ts";
import { dropLineBox } from "./drop-line.ts";
import type { Box, DropTarget, InvalidDrop } from "./SelectionOverlay.tsx";
import { boxOf, type CanvasSelection } from "./use-canvas-session.ts";

const ownDirection = (node: LayoutNode) =>
  (isParentNode(node) ? node.style?.flexDirection : undefined) ?? "column";

const childrenOf = (node: LayoutNode): LayoutNode[] => (isParentNode(node) ? node.children : []);

/**
 * W-559: the direction the canvas shows for `node`'s children, read from the element that
 * actually lays them out (a Section's inner box, a Menu's list), so classes, tablet and mobile
 * styles, grids and RTL count. Its own style when nothing is rendered.
 */
const directionOf = (doc: Document, node: LayoutNode): Direction => {
  const find = (id: string) => doc.querySelector(`[data-emvb-id="${CSS.escape(id)}"]`);
  const first = childrenOf(node)[0];
  const box = (first && find(first.id)?.parentElement) || find(node.id);
  const view = doc.defaultView;
  return box && view ? flowDirection(view.getComputedStyle(box)) : ownDirection(node);
};

const parentShown = (doc: Document, layout: Layout, id: string): Direction | undefined => {
  const parentId = parentOf(layout, id);
  const parent = parentId ? findNode(layout, parentId) : undefined;
  return parent ? directionOf(doc, parent) : undefined;
};

/** Refusals that end the walk to an accepting ancestor, so the user sees why (W-128). */
const STOPS = new Set<string>([REASONS.intoItself, REASONS.tooDeep, REASONS.tooMany]);

const rectOf = (doc: Document, id: string): Rect | null => {
  const box = boxOf(doc, id);
  return box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null;
};

/** Drop line, invalid outline and the canvas drag listeners. */
export function useCanvasDnD({
  doc,
  frame,
  handlers,
  layoutRef,
  setHoverId,
  scaleRef,
  onDropNew,
  onMove,
}: {
  doc: Document | null;
  frame: React.RefObject<HTMLIFrameElement | null>;
  handlers: React.RefObject<CanvasSelection & { onEditText?: (id: string) => void }>;
  layoutRef: React.RefObject<Layout | null>;
  setHoverId: (id: string | null) => void;
  scaleRef: React.RefObject<number>;
  onDropNew: (elementType: string, parentId: string, index: number) => void;
  onMove: (id: string, parentId: string, index: number) => void;
}): { dropLine: Box | null; dropTarget: DropTarget | null; invalid: InvalidDrop | null } {
  const [dropLine, setDropLine] = React.useState<Box | null>(null);
  const [invalid, setInvalid] = React.useState<InvalidDrop | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const dropRef = React.useRef(onDropNew);
  dropRef.current = onDropNew;
  const moveRef = React.useRef(onMove);
  moveRef.current = onMove;
  const cancelled = React.useRef(false);

  const clearDrag = React.useCallback(() => {
    setDropLine(null);
    setDropTarget(null);
    setInvalid(null);
  }, []);

  const resolveDrop = React.useCallback(
    (
      clientX: number,
      clientY: number,
      target: EventTarget | null,
      source: DragSource | null = null,
    ) => {
      const current = layoutRef.current;
      const currentDoc = frame.current?.contentDocument;
      if (!current || !currentDoc) return null;
      // W-128: the nearest element that takes the dragged one. A refusal the user must see
      // (into itself, too deep, too many) stops the walk so the invalid outline still shows.
      const verdict = (parent: LayoutNode) =>
        source ? canDrop(current, source, parent.id) : { ok: isParentNode(parent) };
      const accepts = (parent: LayoutNode) => {
        const result = verdict(parent);
        return result.ok || ("reason" in result && STOPS.has(result.reason as string));
      };
      const activePanel = (tabsId: string) => {
        const tabs = findNode(current, tabsId);
        return childrenOf(tabs ?? current.root).find(
          (panel) => (rectOf(currentDoc, panel.id)?.height ?? 0) > 0,
        )?.id;
      };
      const point = { x: clientX, y: clientY };
      const hovered = dropContainer(current, idAt(target), accepts, activePanel);
      const hoveredBox = rectOf(currentDoc, hovered.id);
      const edge =
        hoveredBox && hovered.id !== current.root.id
          ? edgeDrop(
              current,
              hovered,
              hoveredBox,
              point,
              (parent) => verdict(parent).ok,
              parentShown(currentDoc, current, hovered.id),
            )
          : null;
      const container = (edge && findNode(current, edge.parentId)) || hovered;
      const direction = directionOf(currentDoc, container);
      const kids = childrenOf(container);
      const rects = kids.map((child) => {
        const rect = rectOf(currentDoc, child.id);
        return rect ?? { top: clientY, left: clientX, width: 0, height: 0 };
      });
      const index = edge ? edge.index : dropIndex(direction, rects, point);
      const containerBox = edge ? rectOf(currentDoc, container.id) : hoveredBox;
      return {
        parentId: container.id,
        index,
        line: containerBox ? dropLineBox(direction, containerBox, rects, index) : null,
        outline: containerBox,
      };
    },
    [frame, layoutRef],
  );

  const paintDrag = React.useCallback(
    (
      transfer: DataTransfer | null,
      clientX: number,
      clientY: number,
      target: EventTarget | null,
    ) => {
      const kinds = transferKinds(transfer);
      if (!kinds.neu && !kinds.existing) return false;
      const current = layoutRef.current;
      if (!current) return false;
      const source = draggedSource(transfer, kinds.existing);
      const next = resolveDrop(clientX, clientY, target, source);
      if (!next) {
        clearDrag();
        return true;
      }
      // Until the source is known the line is provisional; canDrop runs again on drop.
      const allowed = source ? canDrop(current, source, next.parentId) : null;
      if (allowed && !allowed.ok) {
        setDropLine(null);
        setInvalid(
          next.outline
            ? { outline: next.outline, label: { x: clientX, y: clientY, reason: allowed.reason } }
            : null,
        );
        if (transfer) transfer.dropEffect = "none";
        return true;
      }
      setInvalid(null);
      setDropLine(next.line);
      setDropTarget(
        next.outline
          ? {
              outline: next.outline,
              // The root is the page itself, so say so rather than "Container" (W-128).
              label:
                next.parentId === current.root.id
                  ? "Inside Page"
                  : `Inside ${handlers.current.labelFor(next.parentId)}`,
            }
          : null,
      );
      if (allowed && transfer) transfer.dropEffect = kinds.existing ? "move" : "copy";
      return true;
    },
    [clearDrag, handlers, layoutRef, resolveDrop],
  );

  useCanvasEvents({
    doc,
    frame,
    handlers,
    layoutRef,
    moveRef,
    dropRef,
    cancelled,
    clearDrag,
    resolveDrop,
    paintDrag,
    setHoverId,
    scale: scaleRef,
  });

  return { dropLine, dropTarget, invalid };
}
