import * as React from "react";
import { createPortal } from "react-dom";
import {
  isParentNode,
  canDrop,
  type Layout,
  type LayoutNode,
  type VNode,
} from "../../../core/index.ts";
import {
  dropContainer,
  dropIndex,
  EXISTING_ELEMENT_MIME,
  idAt,
  NEW_ELEMENT_MIME,
  transferKinds,
  type Rect,
} from "../dnd/drop-target.ts";
import { newElement } from "../dnd/new-element.ts";
import { useCanvasEvents } from "./canvas-events.ts";
import { SelectionOverlay, type Box, type InvalidDrop } from "./SelectionOverlay.tsx";
import { vnodeToReact } from "./vnode-react.tsx";

const SRCDOC =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body></body></html>';

/** Canvas-only: empty containers are droppable. Never emitted into the saved page CSS. */
const EDITOR_CANVAS_CSS =
  ".emvb-container:empty{min-height:48px}.emvb-image-missing{display:inline-block;min-width:48px;min-height:48px;background:var(--color-kumo-tint, #eee)}";

const boxOf = (doc: Document, id: string | null): Box | null => {
  if (!id) return null;
  const element = doc.querySelector(`[data-emvb-id="${CSS.escape(id)}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
};

const rectOf = (doc: Document, id: string): Rect | null => {
  const box = boxOf(doc, id);
  return box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null;
};

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);

const directionOf = (node: LayoutNode) =>
  (isParentNode(node) ? node.style?.flexDirection : undefined) ?? "column";

const childrenOf = (node: LayoutNode): LayoutNode[] => (isParentNode(node) ? node.children : []);

/** Insertion line for the drop index inside a container (DESIGN: brand accent). */
export function dropLineBox(
  direction: string,
  container: Rect,
  children: Rect[],
  index: number,
): Box {
  const row = direction.startsWith("row");
  const first = children[0];
  const last = children.at(-1);
  const before = index > 0 ? children[index - 1] : undefined;
  const after = index < children.length ? children[index] : undefined;
  if (row) {
    let x = container.left;
    if (first && index <= 0) x = first.left;
    else if (last && index >= children.length) x = last.left + last.width;
    else if (before && after) x = (before.left + before.width + after.left) / 2;
    return { top: container.top, left: x - 1, width: 2, height: container.height };
  }
  let y = container.top;
  if (first && index <= 0) y = first.top;
  else if (last && index >= children.length) y = last.top + last.height;
  else if (before && after) y = (before.top + before.height + after.top) / 2;
  return { top: y - 1, left: container.left, width: container.width, height: 2 };
}

export type CanvasSelection = {
  selectedId: string | null;
  labelFor: (id: string) => string;
  canDelete: (id: string) => boolean;
  canMove: (id: string) => boolean;
  canDuplicate: (id: string) => boolean;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

/**
 * The canvas: a sandboxed `srcdoc` iframe without `allow-scripts` (D-011, D-014).
 * W-015/W-019: Add-tile and existing-element drops (native HTML5 DnD, K16).
 */
export function CanvasFrame({
  vnode,
  css,
  layout,
  selection,
  onDropNew,
  onMove,
}: {
  vnode: VNode | null;
  css: string;
  layout: Layout | null;
  selection: CanvasSelection;
  onDropNew: (elementType: string, parentId: string, index: number) => void;
  onMove: (id: string, parentId: string, index: number) => void;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = React.useState<Document | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [dropLine, setDropLine] = React.useState<Box | null>(null);
  const [invalid, setInvalid] = React.useState<InvalidDrop | null>(null);
  const [boxes, setBoxes] = React.useState<{ hover: Box | null; selected: Box | null }>({
    hover: null,
    selected: null,
  });
  const handlers = React.useRef(selection);
  handlers.current = selection;
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  const dropRef = React.useRef(onDropNew);
  dropRef.current = onDropNew;
  const moveRef = React.useRef(onMove);
  moveRef.current = onMove;
  const cancelled = React.useRef(false);

  const clearDrag = React.useCallback(() => {
    setDropLine(null);
    setInvalid(null);
  }, []);

  const onLoad = React.useCallback(() => {
    const loaded = frame.current?.contentDocument;
    if (loaded?.body) setDoc(loaded);
  }, []);

  const resolveDrop = React.useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      const current = layoutRef.current;
      const currentDoc = frame.current?.contentDocument;
      if (!current || !currentDoc) return null;
      const container = dropContainer(current, idAt(target));
      const direction = directionOf(container);
      const kids = childrenOf(container);
      const rects = kids.map((child) => {
        const rect = rectOf(currentDoc, child.id);
        return rect ?? { top: clientY, left: clientX, width: 0, height: 0 };
      });
      const index = dropIndex(direction, rects, { x: clientX, y: clientY });
      const containerBox = rectOf(currentDoc, container.id);
      return {
        parentId: container.id,
        index,
        line: containerBox ? dropLineBox(direction, containerBox, rects, index) : null,
        outline: containerBox,
      };
    },
    [],
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
      const next = resolveDrop(clientX, clientY, target);
      if (!next) {
        clearDrag();
        return true;
      }
      let source: Parameters<typeof canDrop>[1];
      if (kinds.existing) {
        // Chromium may omit getData until drop; types still list the MIME.
        const id =
          transfer?.getData(EXISTING_ELEMENT_MIME) ||
          (transfer as DataTransfer & { emvbId?: string }).emvbId ||
          "";
        // During dragover getData is often empty; use a session stash.
        const stashed = sessionStorage.getItem("emvb-drag-id") ?? id;
        if (!stashed) {
          // Still show a provisional line; canDrop checked on drop.
          setDropLine(next.line);
          setInvalid(null);
          return true;
        }
        source = { kind: "existing", id: stashed };
      } else {
        const type =
          transfer?.getData(NEW_ELEMENT_MIME) || sessionStorage.getItem("emvb-drag-type") || "";
        const node = type ? newElement(type) : null;
        if (!node) {
          setDropLine(next.line);
          setInvalid(null);
          return true;
        }
        source = { kind: "new", node };
      }
      const allowed = canDrop(current, source, next.parentId);
      if (!allowed.ok) {
        setDropLine(null);
        if (next.outline) {
          setInvalid({
            outline: next.outline,
            label: { x: clientX, y: clientY, reason: allowed.reason },
          });
        } else {
          setInvalid(null);
        }
        if (transfer) transfer.dropEffect = "none";
        return true;
      }
      setInvalid(null);
      setDropLine(next.line);
      if (transfer) transfer.dropEffect = kinds.existing ? "move" : "copy";
      return true;
    },
    [clearDrag, resolveDrop],
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
  });

  const { selectedId } = selection;
  React.useEffect(() => {
    if (!doc) return;
    let frameId = 0;
    const track = () => {
      const hover = hoverId === selectedId ? null : boxOf(doc, hoverId);
      const selected = boxOf(doc, selectedId);
      setBoxes((current) =>
        sameBox(current.hover, hover) && sameBox(current.selected, selected)
          ? current
          : { hover, selected },
      );
      frameId = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frameId);
  }, [doc, hoverId, selectedId]);

  return (
    <div className="emvb-stage">
      <iframe
        ref={frame}
        title="Page canvas"
        data-emvb-canvas=""
        srcDoc={SRCDOC}
        sandbox="allow-same-origin"
        onLoad={onLoad}
      />
      <SelectionOverlay
        hover={boxes.hover}
        selected={boxes.selected}
        selectedId={selectedId}
        selection={selection}
        dropLine={dropLine}
        invalid={invalid}
      />
      {doc && createPortal(<style data-emvb-canvas-css="">{css}</style>, doc.head)}
      {doc &&
        createPortal(<style data-emvb-editor-canvas-css="">{EDITOR_CANVAS_CSS}</style>, doc.head)}
      {doc && vnode && createPortal(vnodeToReact(vnode), doc.body)}
    </div>
  );
}
