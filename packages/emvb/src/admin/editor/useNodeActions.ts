import * as React from "react";
import type { createKumoToastManager } from "@cloudflare/kumo";
import {
  addNode,
  duplicateNode,
  ELEMENT_DESCRIPTORS,
  findNode,
  insertionPoint,
  moveDown,
  moveUp,
  subtreeSize,
  type Arranged,
  type ElementType,
  type Layout,
} from "../../core/index.ts";
import { newElement } from "./dnd/new-element.ts";
import { ELEMENT_NAMES } from "./panels/ElementPanel.tsx";
import type { ItemActions } from "./panels/settings/ItemList.tsx";
import type { EditorAction, EditorState } from "./store.ts";

const RESTORE_TIMEOUT_MS = 6000;

/** Node actions on the layout tree: delete (with restore toast), duplicate, and add from the panel. */
export function useNodeActions({
  state,
  latest,
  dispatch,
  announce,
  toasts,
}: {
  state: EditorState;
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
  announce: (message: string) => void;
  toasts: ReturnType<typeof createKumoToastManager>;
}) {
  const [deleteAsk, setDeleteAsk] = React.useState<{
    id: string;
    label: string;
    count: number;
  } | null>(null);
  const lastToast = React.useRef<string | null>(null);

  const canDelete = (id: string) => !!state.page.layout && state.page.layout.root.id !== id;
  const canMove = canDelete;

  const finishDelete = (id: string) => {
    dispatch({ type: "delete-node", id });
    setDeleteAsk(null);
    if (lastToast.current) toasts.close(lastToast.current);
    const toastId: string = toasts.add({
      title: "Element deleted",
      timeout: RESTORE_TIMEOUT_MS,
      actions: [
        {
          children: "Restore",
          variant: "secondary",
          onClick: () => {
            dispatch({ type: "restore" });
            toasts.close(toastId);
          },
        },
      ],
    });
    lastToast.current = toastId;
  };

  const remove = (id: string) => {
    if (!canDelete(id)) return;
    const layout = latest.current.page.layout;
    if (!layout) return;
    const count = subtreeSize(layout, id);
    if (count > 1) {
      const node = findNode(layout, id);
      setDeleteAsk({
        id,
        label: ELEMENT_NAMES[node?.type ?? "container"] ?? "Element",
        count,
      });
      return;
    }
    finishDelete(id);
  };

  /** Runs an arrange operation on the latest layout, announcing the reason when it is refused (R-003). */
  const arrange = (id: string, run: (layout: Layout, id: string) => Arranged) => {
    const layout = latest.current.page.layout;
    if (!layout) return;
    const result = run(layout, id);
    if (!result.ok) {
      announce(result.reason);
      return;
    }
    dispatch({ type: "apply-arranged", layout: result.layout, selected: result.selected });
  };

  const duplicate = (id: string) => arrange(id, duplicateNode);

  /** Accordion and Tabs item list (W-130): the parent stays selected so the list stays open. */
  const items: ItemActions = {
    add: (parentId, node) => {
      const layout = latest.current.page.layout;
      const parent = layout ? findNode(layout, parentId) : undefined;
      if (!layout || !parent) return;
      const index =
        "children" in parent && Array.isArray(parent.children) ? parent.children.length : 0;
      const result = addNode(layout, node, { parentId, index });
      if (!result.ok) {
        announce(result.reason);
        return;
      }
      dispatch({ type: "apply-arranged", layout: result.layout, selected: parentId });
      announce(`${ELEMENT_NAMES[node.type] ?? "Item"} added`);
    },
    remove: (id) => remove(id),
    move: (id, direction) => {
      const layout = latest.current.page.layout;
      if (!layout) return;
      const result = (direction === "up" ? moveUp : moveDown)(layout, id);
      if (!result.ok) {
        announce(result.reason);
        return;
      }
      dispatch({
        type: "apply-arranged",
        layout: result.layout,
        selected: latest.current.selectedId ?? result.selected,
      });
    },
  };

  const addFromPanel = (type: ElementType) => {
    const layout = latest.current.page.layout;
    if (!layout) {
      if (type === "container") dispatch({ type: "add-root-container" });
      return;
    }
    const node = newElement(type);
    if (!node) return;
    const place = insertionPoint(layout, latest.current.selectedId);
    const parent = findNode(layout, place.parentId);
    const parentName = ELEMENT_NAMES[parent?.type ?? "container"] ?? "Container";
    const label = ELEMENT_DESCRIPTORS.find((d) => d.type === type)?.name ?? type;
    dispatch({ type: "add-node", node, parentId: place.parentId, index: place.index });
    announce(`${label} added inside ${parentName}`);
  };

  return {
    deleteAsk,
    setDeleteAsk,
    canDelete,
    canMove,
    finishDelete,
    remove,
    arrange,
    duplicate,
    addFromPanel,
    items,
  };
}
