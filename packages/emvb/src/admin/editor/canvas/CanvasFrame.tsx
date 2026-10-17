import { createPortal } from "react-dom";
import { isMultilineText, type Layout, type PopupDevice, type VNode } from "../../../core/index.ts";
import type { PasteRefusal } from "../useClipboardActions.ts";
import { CanvasTextEdit } from "./CanvasTextEdit.tsx";
import { type CanvasZoom } from "./canvas-scale.ts";
import { SelectionOverlay, type Box, type InvalidDrop } from "./SelectionOverlay.tsx";
import type { StatePreview } from "./state-preview.ts";
import { useCanvasDnD } from "./use-canvas-dnd.ts";
import { useCanvasSession, type CanvasSelection } from "./use-canvas-session.ts";

export { canvasScale, type CanvasZoom } from "./canvas-scale.ts";
export { dropLineBox } from "./drop-line.ts";
export type { CanvasSelection } from "./use-canvas-session.ts";

const SRCDOC =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body></body></html>';

/** Element types that hold other elements and show the empty drop placeholder (W-128). */
const DROP_BOXES = ["container", "div-block", "flexbox", "grid", "section", "form", "loop-empty"]
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
  // UX-019: an empty page fills the canvas, so the whole stage takes a drop and says how to start.
  ":where(.emvb-root:empty){min-height:100vh}" +
  '.emvb-root:empty::after{content:"Drag an element here from Add to start this page";font-size:18px}' +
  `:where(${DROP_BODIES}){min-height:48px}` +
  `:is(${DROP_BODIES}){outline:1px dashed #94a3b8;outline-offset:-1px}` +
  `:is(${DROP_BODIES})::after{content:"Drop elements here";display:block;line-height:48px;text-align:center;${HINT}}` +
  `:where(${NO_ITEMS}){min-height:48px}` +
  `:is(${NO_ITEMS}){outline:1px dashed #94a3b8;outline-offset:-1px}` +
  `:is(${NO_ITEMS})::after{content:"No items yet: add them in this element's Content settings";display:block;line-height:48px;text-align:center;${HINT}}` +
  ".emvb-image-missing{display:inline-block;min-width:48px;min-height:48px;background:var(--color-kumo-tint, #eee)}[data-emvb-editing]{color:transparent !important}" +
  // W-307: a bound element shows a thin violet underline so live values read as live.
  "[data-emvb-bound]{text-decoration-line:underline;text-decoration-style:dotted;text-decoration-color:#7c3aed;text-underline-offset:3px}" +
  // W-312: every A/B arm shows on the canvas, outlined so it's clear visitors see only one.
  "[data-emvb-variant]{outline:1px dashed #d97706;outline-offset:2px}" +
  // W-313: visitor-aware elements show on the canvas, outlined in teal.
  "[data-emvb-audience]{outline:1px dashed #0d9488;outline-offset:2px}" +
  // W-308: the Loop's Empty state shows under its items in the editor, marked as such.
  ".emvb-loop-item~.emvb-loop-empty{outline:1px dashed #94a3b8;outline-offset:2px;position:relative}" +
  `.emvb-loop-item~.emvb-loop-empty::before{content:"Empty state: shown when there are no entries";display:block;${HINT}}`;

/**
 * Tablet and Mobile previews scroll without a visible scrollbar (W-140), as phones and tablets
 * do, so the scrollbar doesn't take width from the previewed page.
 */
const PREVIEW_SCROLL_CSS = "html{scrollbar-width:none}html::-webkit-scrollbar{display:none}";

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

/**
 * The canvas: a sandboxed `srcdoc` iframe without `allow-scripts` (D-011, D-014).
 * W-015/W-019: Add-tile and existing-element drops (native HTML5 DnD, K16).
 */
export function CanvasFrame({
  vnode,
  css,
  canvasStyles = [],
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
  /** The host's stylesheets, loaded before EmVB's CSS (W-327). */
  canvasStyles?: readonly string[];
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
  const session = useCanvasSession({
    vnode,
    canvasStyles,
    layout,
    selection,
    statePreview,
    device,
    zoom,
    onScale,
    refusal,
  });
  const { dropLine, dropTarget, invalid } = useCanvasDnD({
    doc: session.doc,
    frame: session.frame,
    handlers: session.handlers,
    layoutRef: session.layoutRef,
    setHoverId: session.setHoverId,
    scaleRef: session.scaleRef,
    onDropNew,
    onMove,
  });
  const {
    stage,
    pageWidth,
    scale,
    frame,
    onLoad,
    editingId,
    editingText,
    editingBox,
    editingEl,
    editingNode,
    setEditingId,
    boxes,
    selectedId,
    refused,
    doc,
    pageTree,
  } = session;

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
