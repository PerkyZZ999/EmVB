import * as React from "react";
import {
  firstChild,
  moveDown,
  moveIn,
  moveOut,
  moveUp,
  nextInOrder,
  parentOf,
  previousInOrder,
} from "../../core/index.ts";
import type { EditorAction, EditorState } from "./store.ts";

const isTextField = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) ||
    element.isContentEditable ||
    element.getAttribute("role") === "combobox"
  );
};

const inDialog = (target: EventTarget | null) =>
  !!(target as HTMLElement | null)?.closest?.('[role="dialog"], [role="alertdialog"]');

export type ShortcutHandlers = {
  save: () => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
};

/** Window-level editor shortcuts (W-020): save, duplicate, delete, escape, arrange and traverse. */
export function useEditorShortcuts({
  latest,
  dispatch,
  announce,
  handlers,
}: {
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
  announce: (message: string) => void;
  handlers: React.RefObject<ShortcutHandlers>;
}): (event: KeyboardEvent) => void {
  const onKeyDown = React.useCallback((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void handlers.current.save();
      return;
    }
    if (isTextField(event.target) || inDialog(event.target)) return;
    const layout = latest.current.page.layout;
    const selected = latest.current.selectedId;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selected) {
      event.preventDefault();
      handlers.current.duplicate(selected);
      return;
    }
    if (event.key === "Escape" && selected) {
      dispatch({ type: "select", id: null });
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selected) {
      event.preventDefault();
      handlers.current.remove(selected);
      return;
    }
    if (!layout || !selected) return;
    const apply = (
      result: { ok: true; layout: typeof layout; selected: string } | { ok: false; reason: string },
    ) => {
      if (!result.ok) {
        announce(result.reason);
        return;
      }
      dispatch({ type: "apply-arranged", layout: result.layout, selected: result.selected });
    };
    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      apply(moveUp(layout, selected));
    } else if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      apply(moveDown(layout, selected));
    } else if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      apply(moveOut(layout, selected));
    } else if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      apply(moveIn(layout, selected));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      dispatch({ type: "select", id: nextInOrder(layout, selected) });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      dispatch({ type: "select", id: previousInOrder(layout, selected) });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        const parent = parentOf(layout, selected);
        if (parent) dispatch({ type: "select", id: parent });
      } else {
        const child = firstChild(layout, selected);
        if (child) dispatch({ type: "select", id: child });
      }
    }
  }, []);

  React.useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return onKeyDown;
}
