import * as React from "react";
import type { createKumoToastManager } from "@cloudflare/kumo";
import {
  duplicateNode,
  ELEMENT_DESCRIPTORS,
  findNode,
  insertionPoint,
  subtreeSize,
  type ElementType,
} from "../../core/index.ts";
import { newElement } from "./dnd/new-element.ts";
import { ELEMENT_NAMES } from "./panels/ElementPanel.tsx";
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

  const duplicate = (id: string) => {
    const layout = latest.current.page.layout;
    if (!layout) return;
    const result = duplicateNode(layout, id);
    if (!result.ok) {
      announce(result.reason);
      return;
    }
    dispatch({ type: "apply-arranged", layout: result.layout, selected: result.selected });
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
    duplicate,
    addFromPanel,
  };
}
