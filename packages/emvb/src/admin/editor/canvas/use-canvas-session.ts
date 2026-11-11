import * as React from "react";
import {
  findNode,
  isPlainTextNode,
  plainTextOf,
  type Layout,
  type EditorDevice,
  type VNode,
} from "../../../core/index.ts";
import type { PasteRefusal, ClipboardActions } from "../useClipboardActions.ts";
import { canvasScale, type CanvasZoom } from "./canvas-scale.ts";
import type { Box, InvalidDrop } from "./SelectionOverlay.tsx";
import { applyStatePreview, type StatePreview } from "./state-preview.ts";
import { revealInAccordions, revealInMenus, revealInTabs } from "./tab-reveal.ts";
import { vnodeToReact } from "./vnode-react.tsx";

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

export const boxOf = (doc: Document, id: string | null): Box | null => {
  if (!id) return null;
  const element = doc.querySelector(`[data-emvb-id="${CSS.escape(id)}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
};

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);

/**
 * The canvas document: stage size, the loaded iframe, selection boxes, text editing and the
 * host stylesheets. The iframe stays sandboxed in the frame that renders it.
 */
export function useCanvasSession({
  vnode,
  canvasStyles,
  layout,
  selection,
  statePreview,
  device,
  zoom,
  onScale,
  refusal,
}: {
  vnode: VNode | null;
  canvasStyles: readonly string[];
  layout: Layout | null;
  selection: CanvasSelection;
  statePreview: StatePreview | null;
  device: EditorDevice;
  zoom: CanvasZoom;
  onScale?: (scale: number) => void;
  refusal: PasteRefusal | null;
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
      if (node && isPlainTextNode(node) && plainTextOf(node) !== null && !node.bind?.["text"]) {
        selection.onSelect(id);
        setEditingId(id);
      }
    },
  };

  const onLoad = React.useCallback(() => {
    const loaded = frame.current?.contentDocument;
    if (loaded?.body) setDoc(loaded);
  }, []);

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

  // W-327: the host's stylesheets go first in the canvas head, whenever they arrive, so EmVB's
  // CSS (portalled after them) wins where both set a value.
  const styleKey = canvasStyles.join("\n");
  React.useEffect(() => {
    if (!doc) return;
    const links = styleKey
      ? styleKey.split("\n").map((href) => {
          const link = doc.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          link.setAttribute("data-emvb-canvas-style", "");
          return link;
        })
      : [];
    doc.head.prepend(...links);
    return () => links.forEach((link) => link.remove());
  }, [doc, styleKey]);

  return {
    frame,
    stage,
    pageWidth,
    scale,
    scaleRef,
    doc,
    onLoad,
    pageTree,
    boxes,
    editingId,
    setEditingId,
    editingNode,
    editingText,
    editingBox,
    editingEl,
    refused,
    selectedId,
    handlers,
    layoutRef,
    setHoverId,
  };
}
