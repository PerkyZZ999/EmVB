import * as React from "react";
import { findNode, type Layout } from "../../../core/index.ts";
import { canParent, nodeChildren } from "../../../core/tree-ops.ts";
import { dragStash } from "../dnd/drag-stash.ts";
import { draggedSource } from "../dnd/dragged-source.ts";
import { EXISTING_ELEMENT_MIME, NEW_ELEMENT_MIME, transferKinds } from "../dnd/drop-target.ts";
import {
  autoScrollStep,
  depthAtX,
  EXPAND_DELAY_MS,
  layerZone,
  resolveLayerDrop,
  type LayerDrop,
} from "../dnd/layer-drop.ts";

/** What Layers shows during a drag (W-1080). */
type LayersDropShown = {
  /** The row outlined: the container a drop goes inside, or the refused row. */
  mark: { id: string; kind: "inside" | "invalid" } | null;
  /** The insertion line, in list pixels; `start` is from the inline-start edge (right in RTL). */
  line: { top: number; start: number } | null;
  /** Why the drop is refused, next to the refused row. */
  refusal: { top: number; start: number; reason: string } | null;
};

const sameShown = (a: LayersDropShown | null, b: LayersDropShown | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Layers reads right to left when the admin does; indents then grow from the right edge. */
const isRtl = (el: Element) =>
  getComputedStyle(el).direction === "rtl" || el.closest("[dir]")?.getAttribute("dir") === "rtl";

export type LayersDropCallbacks = {
  /** Adds a new element from the Add panel at the drop. */
  onDropNew?: (type: string, parentId: string, index: number) => void;
  /** Moves an element (dragged from Layers or the canvas) to the drop. */
  onMoveTo?: (id: string, parentId: string, index: number) => void;
};

type Live = {
  layout: Layout | null;
  depths: Map<string, number>;
  collapsed: Set<string>;
  expand: (id: string) => void;
} & LayersDropCallbacks;

const rowOf = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? target.closest<HTMLElement>("[data-emvb-layer]") : null;

/** The element that scrolls Layers: the left panel itself. */
const scrollerOf = (list: HTMLElement): HTMLElement | null =>
  list.closest<HTMLElement>(".emvb-panel") ?? list.parentElement;

/**
 * W-1080: drag Add tiles, Layers rows or canvas elements onto the Layers list. Between rows draws a
 * line at the new element's depth, the middle of a row that holds others outlines it, a refused
 * drop outlines the row in danger with the canvas's reason. A collapsed row opens after
 * `EXPAND_DELAY_MS`; the panel scrolls near its edges. The drop runs the canvas's own
 * add and move (one undo step each).
 */
export function useLayersDrop(
  live: Live,
  indent: (depth: number) => number,
  listRef: React.RefObject<HTMLUListElement | null>,
) {
  const [shown, setShownState] = React.useState<LayersDropShown | null>(null);
  // dragover fires every few milliseconds; only a changed line or outline re-renders Layers.
  const setShown = React.useCallback(
    (next: LayersDropShown | null) =>
      setShownState((current) => (sameShown(current, next) ? current : next)),
    [],
  );
  const latest = React.useRef(live);
  React.useLayoutEffect(() => {
    latest.current = live;
  });
  const expandTimer = React.useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );
  const scroll = React.useRef<{ step: number; frame: number | null }>({ step: 0, frame: null });

  const stopTimers = React.useCallback(() => {
    if (expandTimer.current) clearTimeout(expandTimer.current.timer);
    expandTimer.current = null;
    scroll.current.step = 0;
    if (scroll.current.frame !== null) cancelAnimationFrame(scroll.current.frame);
    scroll.current.frame = null;
  }, []);
  const clear = React.useCallback(() => {
    stopTimers();
    setShown(null);
  }, [stopTimers, setShown]);

  React.useEffect(() => stopTimers, [stopTimers]);
  React.useEffect(() => {
    if (!shown) return;
    // Entering anything outside Layers (the canvas, the Add tab) clears it. dragleave can't: it
    // also fires moving between a row's own children.
    const enter = (event: DragEvent) => {
      const panel = listRef.current?.parentElement;
      if (!(event.target instanceof Node) || !panel?.contains(event.target)) clear();
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    document.addEventListener("dragenter", enter);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
      document.removeEventListener("dragenter", enter);
    };
  }, [shown, clear, listRef]);

  const enabled = !!(live.onDropNew || live.onMoveTo);

  const resolve = (
    event: React.DragEvent,
  ): { drop: LayerDrop; row: HTMLElement; depth: number; existing: boolean } | null => {
    const { layout, depths, collapsed } = latest.current;
    const list = listRef.current;
    if (!layout || !list) return null;
    const kinds = transferKinds(event.dataTransfer);
    if (!kinds.neu && !kinds.existing) return null;
    const row =
      rowOf(event.target) ??
      list.querySelector<HTMLElement>(`[data-emvb-layer="${CSS.escape(layout.root.id)}"]`);
    const id = row?.getAttribute("data-emvb-layer");
    const node = id ? findNode(layout, id) : undefined;
    if (!row || !id || !node) return null;
    const depth = depths.get(id) ?? 0;
    const holds = canParent(node);
    const open = holds && !collapsed.has(id) && nodeChildren(node).length > 0;
    const rect = row.getBoundingClientRect();
    const onRow = rowOf(event.target) !== null;
    const zone = onRow
      ? layerZone(event.clientY - rect.top, rect.height, holds, id === layout.root.id)
      : "inside";
    // The pointer's distance from the row's inline-start edge, where the indent is.
    const fromStart = isRtl(row) ? rect.right - event.clientX : event.clientX - rect.left;
    const outdent = depth - depthAtX(fromStart, indent, depth);
    const source = draggedSource(event.dataTransfer, kinds.existing);
    const drop = resolveLayerDrop(layout, { id, depth, open }, zone, source, outdent);
    return drop ? { drop, row, depth, existing: kinds.existing } : null;
  };

  const autoScroll = (clientY: number) => {
    const list = listRef.current;
    const scroller = list ? scrollerOf(list) : null;
    if (!scroller) return;
    const box = scroller.getBoundingClientRect();
    scroll.current.step = autoScrollStep(clientY, box.top, box.bottom);
    if (scroll.current.step === 0 || scroll.current.frame !== null) return;
    const tick = () => {
      if (scroll.current.step === 0) {
        scroll.current.frame = null;
        return;
      }
      scroller.scrollTop += scroll.current.step;
      scroll.current.frame = requestAnimationFrame(tick);
    };
    scroll.current.frame = requestAnimationFrame(tick);
  };

  const autoExpand = (id: string) => {
    const { layout, collapsed } = latest.current;
    const node = layout ? findNode(layout, id) : undefined;
    const closed = !!node && canParent(node) && nodeChildren(node).length > 0 && collapsed.has(id);
    if (expandTimer.current?.id === id && closed) return;
    if (expandTimer.current) clearTimeout(expandTimer.current.timer);
    expandTimer.current = closed
      ? {
          id,
          timer: setTimeout(() => {
            expandTimer.current = null;
            latest.current.expand(id);
          }, EXPAND_DELAY_MS),
        }
      : null;
  };

  const onDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!enabled) return;
    const found = resolve(event);
    if (!found) return;
    event.preventDefault();
    autoScroll(event.clientY);
    const { drop, row, depth, existing } = found;
    autoExpand(row.getAttribute("data-emvb-layer") ?? "");
    const top = row.offsetTop;
    if (!drop.ok) {
      event.dataTransfer.dropEffect = "none";
      setShown({
        mark: { id: row.getAttribute("data-emvb-layer") ?? "", kind: "invalid" },
        line: null,
        refusal: { top: top + row.offsetHeight + 2, start: indent(depth), reason: drop.reason },
      });
      return;
    }
    event.dataTransfer.dropEffect = existing ? "move" : "copy";
    const { place } = drop;
    setShown({
      mark: place.edge === null ? { id: place.parentId, kind: "inside" } : null,
      line:
        place.edge === null
          ? null
          : {
              top: place.edge === "top" ? top - 1 : top + row.offsetHeight - 1,
              start: indent(place.depth),
            },
      refusal: null,
    });
  };

  const onDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!enabled) return;
    const found = resolve(event);
    if (!found) return;
    event.preventDefault();
    const transfer = event.dataTransfer;
    const id = transfer.getData(EXISTING_ELEMENT_MIME) || dragStash.id() || "";
    const type = transfer.getData(NEW_ELEMENT_MIME) || dragStash.type() || "";
    dragStash.clear();
    clear();
    if (!found.drop.ok) return;
    const { parentId, index } = found.drop.place;
    if (found.existing) {
      if (id) latest.current.onMoveTo?.(id, parentId, index);
    } else if (type) latest.current.onDropNew?.(type, parentId, index);
  };

  // dragenter takes the same path: the spec makes a cancelled dragenter the drop target, and a
  // browser may send only dragenter while the pointer crosses rows.
  return { shown, handlers: enabled ? { onDragEnter: onDragOver, onDragOver, onDrop } : {} };
}
