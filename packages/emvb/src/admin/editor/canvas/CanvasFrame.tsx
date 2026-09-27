import * as React from "react";
import { createPortal } from "react-dom";
import type { VNode } from "../../../core/index.ts";
import { SelectionOverlay, type Box } from "./SelectionOverlay.tsx";
import { vnodeToReact } from "./vnode-react.tsx";

const SRCDOC =
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body></body></html>';

const idAt = (target: EventTarget | null): string | null => {
  const element = target as Element | null;
  const hit = element?.closest?.("[data-emvb-id]");
  return hit?.getAttribute("data-emvb-id") ?? null;
};

const boxOf = (doc: Document, id: string | null): Box | null => {
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

export type CanvasSelection = {
  selectedId: string | null;
  labelFor: (id: string) => string;
  canDelete: (id: string) => boolean;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

/**
 * The canvas: a sandboxed `srcdoc` iframe without `allow-scripts` (D-011, D-014), so admin CSS
 * stays out, page CSS stays in, and nothing runs inside it. React renders into its document
 * through a portal and listens to it from the parent. It fills the space between the panels,
 * with no zoom or virtual width (D-025). Outlines are drawn above the iframe, never in the page.
 */
export function CanvasFrame({
  vnode,
  css,
  selection,
}: {
  vnode: VNode | null;
  css: string;
  selection: CanvasSelection;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = React.useState<Document | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [boxes, setBoxes] = React.useState<{ hover: Box | null; selected: Box | null }>({
    hover: null,
    selected: null,
  });
  const handlers = React.useRef(selection);
  handlers.current = selection;

  const onLoad = React.useCallback(() => {
    const loaded = frame.current?.contentDocument;
    if (loaded?.body) setDoc(loaded);
  }, []);

  React.useEffect(() => {
    if (!doc) return;
    const click = (event: MouseEvent) => {
      event.preventDefault();
      handlers.current.onSelect(idAt(event.target));
    };
    const move = (event: MouseEvent) => setHoverId(idAt(event.target));
    const leave = () => setHoverId(null);
    const key = (event: KeyboardEvent) => handlers.current.onKeyDown(event);
    doc.addEventListener("click", click);
    doc.addEventListener("mousemove", move);
    doc.documentElement.addEventListener("mouseleave", leave);
    doc.addEventListener("keydown", key);
    return () => {
      doc.removeEventListener("click", click);
      doc.removeEventListener("mousemove", move);
      doc.documentElement.removeEventListener("mouseleave", leave);
      doc.removeEventListener("keydown", key);
    };
  }, [doc]);

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
      />
      {doc && createPortal(<style data-emvb-canvas-css="">{css}</style>, doc.head)}
      {doc && vnode && createPortal(vnodeToReact(vnode), doc.body)}
    </div>
  );
}
