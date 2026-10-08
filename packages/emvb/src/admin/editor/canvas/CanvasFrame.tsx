import * as React from "react";
import { createPortal } from "react-dom";
import {
  isParentNode,
  canDrop,
  findNode,
  isPlainTextNode,
  isMultilineText,
  plainTextOf,
  DEVICE_PREVIEW_PX,
  REASONS,
  type DragSource,
  type PopupDevice,
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
import { revealInAccordions, revealInMenus, revealInTabs } from "./tab-reveal.ts";
import { CanvasTextEdit } from "./CanvasTextEdit.tsx";
import { vnodeToReact } from "./vnode-react.tsx";
import type { ClipboardActions, PasteRefusal } from "../useClipboardActions.ts";

const SRCDOC =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body></body></html>';

/** Element types that hold other elements and show the empty drop placeholder (W-128). */
const DROP_BOXES = ["container", "div-block", "flexbox", "grid", "section", "form"]
  .map((type) => `.emvb-${type}:empty`)
  .join(",");
/**
 * Empty boxes whose display the page controls (a hidden tab panel stays hidden), so the
 * placeholder must not set it (W-130).
 */
const DROP_BODIES =
  ".emvb-tab-panel:empty,.emvb-accordion-body:empty,.emvb-layout-section-inner:empty";
/** An Accordion or Tabs with no items: only items go in, so it points at the item list (W-130). */
const NO_ITEMS = ".emvb-accordion:empty,.emvb-tabs:not(:has(.emvb-tab-panel)),.emvb-list:empty";
const HINT = "color:#64748b;font:13px/1.4 system-ui,sans-serif;pointer-events:none";

/**
 * Canvas-only: empty containers are droppable and say so (W-128). Never emitted into the saved
 * page CSS.
 */
const EDITOR_CANVAS_CSS =
  // The 48 px floor is in :where() so a min-height the user set always wins (W-145).
  `:where(${DROP_BOXES}){min-height:48px}` +
  `:is(${DROP_BOXES}){outline:1px dashed #94a3b8;outline-offset:-1px;display:flex;align-items:center;justify-content:center}` +
  `:is(${DROP_BOXES})::after{content:"Drop elements here";${HINT}}` +
  `:where(${DROP_BODIES}){min-height:48px}` +
  `:is(${DROP_BODIES}){outline:1px dashed #94a3b8;outline-offset:-1px}` +
  `:is(${DROP_BODIES})::after{content:"Drop elements here";display:block;line-height:48px;text-align:center;${HINT}}` +
  `:where(${NO_ITEMS}){min-height:48px}` +
  `:is(${NO_ITEMS}){outline:1px dashed #94a3b8;outline-offset:-1px}` +
  `:is(${NO_ITEMS})::after{content:"No items yet: add them in this element's Content settings";display:block;line-height:48px;text-align:center;${HINT}}` +
  ".emvb-image-missing{display:inline-block;min-width:48px;min-height:48px;background:var(--color-kumo-tint, #eee)}[data-emvb-editing]{color:transparent !important}";

/**
 * Tablet and Mobile previews scroll without a visible scrollbar (W-140), as phones and tablets
 * do, so the scrollbar doesn't take width from the previewed page.
 */
const PREVIEW_SCROLL_CSS = "html{scrollbar-width:none}html::-webkit-scrollbar{display:none}";

/** Fit scales the canvas down to the stage; Actual shows it at 100% and scrolls (W-158). */
export type CanvasZoom = "fit" | "actual";

/**
 * The canvas's page width and on-screen scale (W-158, D-046). Desktop lays the page out at least
 * 1280 px wide (wider when the stage is), Tablet at 768 and Mobile at 390. Fit scales it down to
 * the stage width, never up; Actual keeps 100% and the stage scrolls sideways.
 */
export function canvasScale(
  device: PopupDevice,
  stageWidth: number,
  zoom: CanvasZoom,
): { width: number; scale: number } {
  const base = DEVICE_PREVIEW_PX[device];
  const width = device === "desktop" ? Math.max(base, Math.floor(stageWidth)) : base;
  if (zoom === "actual" || stageWidth <= 0) return { width, scale: 1 };
  return { width, scale: Math.min(1, stageWidth / width) };
}

/** A box measured inside the canvas page, in the overlay's on-screen pixels (W-158). */
export const zoomBox = (box: Box, scale: number): Box =>
  scale === 1
    ? box
    : {
        top: box.top * scale,
        left: box.left * scale,
        width: box.width * scale,
        height: box.height * scale,
      };

const zoomOrNull = (box: Box | null, scale: number) => (box ? zoomBox(box, scale) : null);

const zoomInvalid = (drop: InvalidDrop | null, scale: number): InvalidDrop | null =>
  drop && {
    outline: zoomBox(drop.outline, scale),
    label: { ...drop.label, x: drop.label.x * scale, y: drop.label.y * scale },
  };

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
  device = "desktop",
  zoom = "fit",
  onScale,
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
  /** The previewed device (W-096): its page width, scaled to the stage (W-158, D-046). */
  device?: PopupDevice;
  /** Fit to the stage or show at 100% (W-158). */
  zoom?: CanvasZoom;
  /** Told the on-screen scale whenever it changes, for the zoom readout (W-158). */
  onScale?: (scale: number) => void;
  /** A refused paste, outlined on its target with the reason like an invalid drop (W-093). */
  refusal?: PasteRefusal | null;
  onDropNew: (elementType: string, parentId: string, index: number) => void;
  onMove: (id: string, parentId: string, index: number) => void;
  /** Stores a canvas plain-text edit (W-097). */
  onCommitText: (id: string, text: string) => void;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const stage = React.useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setStageWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { width: pageWidth, scale } = canvasScale(device, stageWidth, zoom);
  const scaleRef = React.useRef(scale);
  scaleRef.current = scale;
  const scaleReport = React.useRef(onScale);
  scaleReport.current = onScale;
  React.useEffect(() => scaleReport.current?.(scale), [scale]);
  const [doc, setDoc] = React.useState<Document | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  // W-268: the page's React tree is built once per render of the layout, not on every hover,
  // selection or overlay change. With the same element objects React skips the whole canvas
  // subtree; rebuilding it walked every element on each mouse move (300+ elements: ~20 ms a move).
  const pageTree = React.useMemo(() => (vnode ? vnodeToReact(vnode) : null), [vnode]);
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
    scale: scaleRef,
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
    if (!doc) return;
    revealInTabs(doc, selectedId);
    revealInAccordions(doc, selectedId, (itemId) => {
      const item = layout ? findNode(layout, itemId) : undefined;
      return item?.type === "accordion-item" && item.props.open === true;
    });
    revealInMenus(doc, selectedId);
  }, [doc, selectedId, vnode, layout]);
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
    <div className="emvb-stage" ref={stage} data-emvb-zoom={zoom}>
      <div
        className="emvb-stage-frame"
        data-emvb-canvas-width={pageWidth}
        data-emvb-canvas-scale={scale}
        style={{ width: pageWidth * scale }}
      >
        {/* W-158: the page is laid out at the device width and scaled as a whole, so clicks,
            drags and text editing inside it keep page coordinates. The overlay stays unscaled
            (readable labels and toolbar) and gets its boxes scaled instead. */}
        <div
          className="emvb-stage-scaler"
          style={{
            width: pageWidth,
            height: `${100 / scale}%`,
            transform: scale === 1 ? undefined : `scale(${scale})`,
          }}
        >
          <iframe
            ref={frame}
            title="Page canvas"
            data-emvb-canvas=""
            srcDoc={SRCDOC}
            sandbox="allow-same-origin"
            onLoad={onLoad}
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
        <SelectionOverlay
          hover={zoomOrNull(boxes.hover, scale)}
          selected={zoomOrNull(boxes.selected, scale)}
          selectedId={selectedId}
          selection={selection}
          dropLine={zoomOrNull(dropLine, scale)}
          dropTarget={
            invalid || !dropTarget
              ? null
              : { ...dropTarget, outline: zoomBox(dropTarget.outline, scale) }
          }
          invalid={zoomInvalid(invalid ?? refused, scale)}
          editing={!!editingId && editingId === selectedId}
        />
      </div>
      {doc && createPortal(<style data-emvb-canvas-css="">{css}</style>, doc.head)}
      {doc &&
        createPortal(<style data-emvb-editor-canvas-css="">{EDITOR_CANVAS_CSS}</style>, doc.head)}
      {doc &&
        device !== "desktop" &&
        createPortal(<style data-emvb-preview-css="">{PREVIEW_SCROLL_CSS}</style>, doc.head)}
      {doc && pageTree && createPortal(pageTree, doc.body)}
    </div>
  );
}
