import * as React from "react";
import { canDrop, findNode, type DragSource, type Layout } from "../../../core/index.ts";
import {
  EXISTING_ELEMENT_MIME,
  idAt,
  NEW_ELEMENT_MIME,
  transferKinds,
  type Rect,
} from "../dnd/drop-target.ts";
import { newElement } from "../dnd/new-element.ts";
import type { Box } from "./SelectionOverlay.tsx";
import { tabPanelIdForLabel } from "./tab-reveal.ts";
import { dragStash } from "../dnd/drag-stash.ts";

export type ResolvedDrop = {
  parentId: string;
  index: number;
  line: Box | null;
  outline: Rect | null;
};

type TransferKinds = ReturnType<typeof transferKinds>;

/**
 * The nearest `data-emvb-id` that belongs to this layout.
 * Synced section contents keep the part's ids, so a click walks up to the section on the page.
 */
function ownedId(target: EventTarget | null, layout: Layout | null): string | null {
  let el: Element | null = target && (target as Node).nodeType === 1 ? (target as Element) : null;
  while (el) {
    const id = el.getAttribute("data-emvb-id");
    if (id && (!layout || findNode(layout, id))) return id;
    el = el.parentElement;
  }
  return null;
}

/** The canvas iframe's content document needs events wired per load (W-015 / W-019). */
export function useCanvasEvents({
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
}: {
  doc: Document | null;
  frame: React.RefObject<HTMLIFrameElement | null>;
  handlers: React.RefObject<{
    onSelect: (id: string | null) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onEditText?: (id: string) => void;
  }>;
  layoutRef: React.RefObject<Layout | null>;
  moveRef: React.RefObject<(id: string, parentId: string, index: number) => void>;
  dropRef: React.RefObject<(type: string, parentId: string, index: number) => void>;
  cancelled: React.RefObject<boolean>;
  clearDrag: () => void;
  resolveDrop: (
    clientX: number,
    clientY: number,
    target: EventTarget | null,
    source?: DragSource | null,
  ) => ResolvedDrop | null;
  paintDrag: (
    transfer: DataTransfer | null,
    clientX: number,
    clientY: number,
    target: EventTarget | null,
  ) => boolean;
  setHoverId: (id: string | null) => void;
}) {
  const runDrop = React.useCallback(
    (
      x: number,
      y: number,
      target: EventTarget | null,
      transfer: DataTransfer | null,
      kinds: TransferKinds,
    ) => {
      const wasCancelled = cancelled.current;
      cancelled.current = false;
      const id = transfer?.getData(EXISTING_ELEMENT_MIME) || dragStash.id() || "";
      const type = transfer?.getData(NEW_ELEMENT_MIME) || dragStash.type() || "";
      const fresh = !kinds.existing && type ? newElement(type) : null;
      const source: DragSource | null =
        kinds.existing && id
          ? { kind: "existing", id }
          : fresh
            ? { kind: "new", node: fresh }
            : null;
      const next = resolveDrop(x, y, target, source);
      clearDrag();
      dragStash.clear();
      if (wasCancelled || !next) return;
      const current = layoutRef.current;
      if (!current) return;
      if (kinds.existing && id) {
        const allowed = canDrop(current, { kind: "existing", id }, next.parentId);
        if (!allowed.ok) return;
        moveRef.current(id, next.parentId, next.index);
        return;
      }
      if (kinds.neu && type) {
        const node = fresh;
        if (!node) return;
        const allowed = canDrop(current, { kind: "new", node }, next.parentId);
        if (!allowed.ok) return;
        dropRef.current(type, next.parentId, next.index);
      }
    },
    [cancelled, clearDrag, resolveDrop, layoutRef, moveRef, dropRef],
  );

  React.useEffect(() => {
    if (!doc) return;
    const click = (event: MouseEvent) => {
      event.preventDefault();
      const hit = tabPanelIdForLabel(event.target) ?? idAt(event.target);
      const id =
        hit && layoutRef.current && !findNode(layoutRef.current, hit)
          ? ownedId(event.target, layoutRef.current)
          : hit;
      handlers.current.onSelect(id);
      // The second click of a double-click reports detail 2. dblclick itself does not
      // cross the sandboxed iframe, so this click is the signal (W-097).
      if (event.detail === 2 && id) handlers.current.onEditText?.(id);
    };
    const move = (event: MouseEvent) => setHoverId(ownedId(event.target, layoutRef.current));
    const leave = () => setHoverId(null);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dragStash.active()) {
        cancelled.current = true;
        dragStash.clear();
        clearDrag();
        return;
      }
      handlers.current.onKeyDown(event);
    };
    const dragover = (event: DragEvent) => {
      if (!paintDrag(event.dataTransfer, event.clientX, event.clientY, event.target)) return;
      event.preventDefault();
    };
    const dragleave = (event: DragEvent) => {
      if (event.target === doc.documentElement || event.target === doc.body) clearDrag();
    };
    const drop = (event: DragEvent) => {
      const kinds = transferKinds(event.dataTransfer);
      if (!kinds.neu && !kinds.existing) return;
      event.preventDefault();
      runDrop(event.clientX, event.clientY, event.target, event.dataTransfer, kinds);
    };
    const dragend = () => {
      cancelled.current = false;
      dragStash.clear();
      clearDrag();
    };
    doc.addEventListener("click", click);
    doc.addEventListener("mousemove", move);
    doc.documentElement.addEventListener("mouseleave", leave);
    doc.addEventListener("keydown", key);
    doc.addEventListener("dragover", dragover);
    doc.addEventListener("dragleave", dragleave);
    doc.addEventListener("drop", drop);
    doc.addEventListener("dragend", dragend);
    return () => {
      doc.removeEventListener("click", click);
      doc.removeEventListener("mousemove", move);
      doc.documentElement.removeEventListener("mouseleave", leave);
      doc.removeEventListener("keydown", key);
      doc.removeEventListener("dragover", dragover);
      doc.removeEventListener("dragleave", dragleave);
      doc.removeEventListener("drop", drop);
      doc.removeEventListener("dragend", dragend);
    };
  }, [doc, runDrop, paintDrag, clearDrag, handlers, setHoverId, cancelled]);

  React.useEffect(() => {
    const iframe = frame.current;
    if (!iframe || !doc) return;
    const map = (event: DragEvent) => {
      const rect = iframe.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const target = doc.elementFromPoint(x, y) ?? doc.body;
      return { x, y, target };
    };
    const dragover = (event: DragEvent) => {
      const { x, y, target } = map(event);
      if (!paintDrag(event.dataTransfer, x, y, target)) return;
      event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      const kinds = transferKinds(event.dataTransfer);
      if (!kinds.neu && !kinds.existing) return;
      event.preventDefault();
      const { x, y, target } = map(event);
      runDrop(x, y, target, event.dataTransfer, kinds);
    };
    const leave = () => clearDrag();
    iframe.addEventListener("dragover", dragover);
    iframe.addEventListener("drop", drop);
    iframe.addEventListener("dragleave", leave);
    return () => {
      iframe.removeEventListener("dragover", dragover);
      iframe.removeEventListener("drop", drop);
      iframe.removeEventListener("dragleave", leave);
    };
  }, [doc, frame, runDrop, paintDrag, clearDrag]);

  // Parent-document Esc / dragend while dragging from the Move handle / Layers / Add tile.
  // dragend fires on the source in the parent document (not the iframe), so clear here too.
  React.useEffect(() => {
    const finish = () => {
      cancelled.current = false;
      dragStash.clear();
      clearDrag();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!dragStash.active()) return;
      cancelled.current = true;
      finish();
    };
    const onEnd = () => finish();
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragend", onEnd);
    document.addEventListener("dragend", onEnd);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragend", onEnd);
      document.removeEventListener("dragend", onEnd);
    };
  }, [clearDrag, cancelled]);
}
