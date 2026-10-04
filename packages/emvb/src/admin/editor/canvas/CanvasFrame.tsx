import * as React from "react";
import { createPortal } from "react-dom";
import {
  isParentNode,
  canDrop,
  findNode,
  isPlainTextNode,
  isMultilineText,
  plainTextOf,
  REASONS,
  type DragSource,
  type Layout,
  type LayoutNode,
  type VNode,
} from "../../../core/index.ts";
import {
  dropContainer,
  dropIndex,
  edgeDrop,
  EXISTING_ELEMENT_MIME,
  idAt,
  NEW_ELEMENT_MIME,
  transferKinds,
  type Rect,
} from "../dnd/drop-target.ts";
import { dragStash } from "../dnd/drag-stash.ts";
import { newElement } from "../dnd/new-element.ts";
import { useCanvasEvents } from "./canvas-events.ts";
import {
  SelectionOverlay,
  type Box,
  type DropTarget,
  type InvalidDrop,
} from "./SelectionOverlay.tsx";
import { applyStatePreview, type StatePreview } from "./state-preview.ts";
import { revealInTabs } from "./tab-reveal.ts";
import { CanvasTextEdit } from "./CanvasTextEdit.tsx";
import { vnodeToReact } from "./vnode-react.tsx";
import type { ClipboardActions, PasteRefusal } from "../useClipboardActions.ts";

const SRCDOC =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body></body></html>';

/** Element types that hold other elements and show the empty drop placeholder (W-128). */
const DROP_BOXES = [
  "container",
  "div-block",
  "flexbox",
  "grid",
  "section",
  "form",
  "tab-panel",
  "accordion-item",
]
  .map((type) => `.emvb-${type}:empty`)
  .join(",");

/**
 * Canvas-only: empty containers are droppable and say so (W-128). Never emitted into the saved
 * page CSS.
 */
export const EDITOR_CANVAS_CSS =
  `:is(${DROP_BOXES}){min-height:48px;outline:1px dashed #94a3b8;outline-offset:-1px;display:flex;align-items:center;justify-content:center}` +
  `:is(${DROP_BOXES})::after{content:"Drop elements here";color:#64748b;font:13px/1.4 system-ui,sans-serif;pointer-events:none}` +
  ".emvb-image-missing{display:inline-block;min-width:48px;min-height:48px;background:var(--color-kumo-tint, #eee)}[data-emvb-editing]{color:transparent !important}";

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

/** Refusals that end the walk to an accepting ancestor, so the user sees why (W-128). */
const STOPS = new Set<string>([REASONS.intoItself, REASONS.tooDeep, REASONS.tooMany]);

/** Insertion line for the drop index inside a container (DESIGN: brand accent). */
export function dropLineBox(
  direction: string,
  container: Rect,
  children: Rect[],
  index: number,
): Box {
  const row = direction.startsWith("row");
  const [start, size] = row ? (["left", "width"] as const) : (["top", "height"] as const);
  const first = children[0];
  const last = children.at(-1);
  const before = index > 0 ? children[index - 1] : undefined;
  const after = index < children.length ? children[index] : undefined;
  let at = container[start];
  if (first && index <= 0) at = first[start];
  else if (last && index >= children.length) at = last[start] + last[size];
  else if (before && after) at = (before[start] + before[size] + after[start]) / 2;
  return row
    ? { top: container.top, left: at - 1, width: 2, height: container.height }
    : { top: at - 1, left: container.left, width: container.width, height: 2 };
}

/** What is being dragged over the canvas, or null while the browser still hides it. */
function draggedSource(transfer: DataTransfer | null, existing: boolean): DragSource | null {
  if (existing) {
    // Chromium may omit getData until drop, so the session stash wins during dragover.
    const id =
      dragStash.id() ??
      (transfer?.getData(EXISTING_ELEMENT_MIME) ||
        (transfer as DataTransfer & { emvbId?: string }).emvbId ||
        "");
    return id ? { kind: "existing", id } : null;
  }
  const type = transfer?.getData(NEW_ELEMENT_MIME) || dragStash.type() || "";
  const node = type ? newElement(type) : null;
  return node ? { kind: "new", node } : null;
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
  /** Copy and paste in the quick actions (W-093). */
  clipboard?: ClipboardActions;
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
  statePreview = null,
  previewWidth = null,
  refusal = null,
  onDropNew,
  onMove,
  onCommitText,
}: {
  vnode: VNode | null;
  css: string;
  layout: Layout | null;
  selection: CanvasSelection;
  /** The style state chosen in the Style tab, shown on the selected element (W-089). */
  statePreview?: StatePreview | null;
  /** Tablet or mobile preview width in px. Desktop is the full canvas (W-096, no zoom). */
  previewWidth?: number | null;
  /** A refused paste, outlined on its target with the reason like an invalid drop (W-093). */
  refusal?: PasteRefusal | null;
  onDropNew: (elementType: string, parentId: string, index: number) => void;
  onMove: (id: string, parentId: string, index: number) => void;
  /** Stores a canvas plain-text edit (W-097). */
  onCommitText: (id: string, text: string) => void;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = React.useState<Document | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [dropLine, setDropLine] = React.useState<Box | null>(null);
  const [invalid, setInvalid] = React.useState<InvalidDrop | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const [boxes, setBoxes] = React.useState<{ hover: Box | null; selected: Box | null }>({
    hover: null,
    selected: null,
  });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const handlers = React.useRef<CanvasSelection & { onEditText?: (id: string) => void }>(selection);
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  handlers.current = {
    ...selection,
    onEditText: (id) => {
      const node = layoutRef.current ? findNode(layoutRef.current, id) : undefined;
      if (node && isPlainTextNode(node) && plainTextOf(node) !== null) {
        selection.onSelect(id);
        setEditingId(id);
      }
    },
  };
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

  const onLoad = React.useCallback(() => {
    const loaded = frame.current?.contentDocument;
    if (loaded?.body) setDoc(loaded);
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
          ? edgeDrop(current, hovered, hoveredBox, point, (parent) => verdict(parent).ok)
          : null;
      const container = (edge && findNode(current, edge.parentId)) || hovered;
      const direction = directionOf(container);
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

  const [refused, setRefused] = React.useState<InvalidDrop | null>(null);
  React.useEffect(() => {
    const box = doc && refusal ? boxOf(doc, refusal.id) : null;
    setRefused(
      box && refusal
        ? { outline: box, label: { x: box.left, y: box.top, reason: refusal.reason } }
        : null,
    );
  }, [doc, refusal]);

  const { selectedId } = selection;
  const editingNode = editingId && layout ? findNode(layout, editingId) : undefined;
  const editingText = editingNode ? plainTextOf(editingNode) : null;
  const editingBox = doc && editingId && editingText !== null ? boxOf(doc, editingId) : null;
  const editingEl =
    doc && editingId && editingText !== null
      ? doc.querySelector(`[data-emvb-id="${CSS.escape(editingId)}"]`)
      : null;
  React.useEffect(() => {
    if (doc) revealInTabs(doc, selectedId);
  }, [doc, selectedId, vnode]);
  const previewId = statePreview?.id === selectedId ? statePreview.id : null;
  const previewState = previewId ? statePreview?.state : undefined;
  React.useEffect(() => {
    if (doc)
      applyStatePreview(
        doc,
        previewId && previewState ? { id: previewId, state: previewState } : null,
      );
  }, [doc, previewId, previewState, vnode]);

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
      <div
        className="emvb-stage-frame"
        style={previewWidth ? { width: previewWidth, maxWidth: "100%" } : undefined}
      >
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
          dropTarget={invalid ? null : dropTarget}
          invalid={invalid ?? refused}
        />
        {editingId && editingText !== null && editingBox && editingEl?.nodeType === 1 && (
          <CanvasTextEdit
            element={editingEl}
            box={editingBox}
            text={editingText}
            multiline={editingNode ? isMultilineText(editingNode) : false}
            onCommit={(text) => {
              onCommitText(editingId, text);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        )}
      </div>
      {doc && createPortal(<style data-emvb-canvas-css="">{css}</style>, doc.head)}
      {doc &&
        createPortal(<style data-emvb-editor-canvas-css="">{EDITOR_CANVAS_CSS}</style>, doc.head)}
      {doc && vnode && createPortal(vnodeToReact(vnode), doc.body)}
    </div>
  );
}
