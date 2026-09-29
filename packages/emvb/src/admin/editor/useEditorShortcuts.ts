import * as React from "react";
import {
  firstChild,
  type Arranged,
  type Layout,
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

type ArrangeOp = (layout: Layout, id: string) => Arranged;

/** Alt+arrow keys: move the selected element among its siblings or across containers. */
const ARRANGE_KEYS = new Map<string, ArrangeOp>([
  ["ArrowUp", moveUp],
  ["ArrowDown", moveDown],
  ["ArrowLeft", moveOut],
  ["ArrowRight", moveIn],
]);

/** Plain ↑/↓ walk document order; Enter goes to the first child, Shift+Enter to the parent. */
const TRAVERSE_KEYS = new Map<
  string,
  (layout: Layout, id: string, shift: boolean) => string | undefined
>([
  ["ArrowDown", nextInOrder],
  ["ArrowUp", previousInOrder],
  ["Enter", (layout, id, shift) => (shift ? parentOf(layout, id) : firstChild(layout, id))],
]);

export type ShortcutHandlers = {
  save: () => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  arrange: (id: string, run: ArrangeOp) => void;
};

/** Window-level editor shortcuts (W-020): save, duplicate, delete, escape, arrange and traverse. */
export function useEditorShortcuts({
  latest,
  dispatch,
  handlers,
}: {
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
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
    const arrangeOp = event.altKey ? ARRANGE_KEYS.get(event.key) : undefined;
    if (arrangeOp) {
      event.preventDefault();
      handlers.current.arrange(selected, arrangeOp);
      return;
    }
    const traverse = TRAVERSE_KEYS.get(event.key);
    if (!traverse) return;
    event.preventDefault();
    const target = traverse(layout, selected, event.shiftKey);
    if (target) dispatch({ type: "select", id: target });
  }, []);

  React.useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return onKeyDown;
}
