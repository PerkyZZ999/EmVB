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
import type { EditorState, HistoryAction } from "./store.ts";
import { isPaletteShortcut } from "./shortcuts.ts";

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

/**
 * Element shortcuts (traverse, arrange, delete, duplicate, copy, paste, Escape) act only from the
 * canvas, Layers, or with nothing focused, never from the settings panel, its tabs and section
 * headers, the Add panel or the top bar: ↑ on the Style tab used to select the previous element,
 * often the parent (W-132). Keys from the canvas iframe arrive with targets in its own document.
 */
const onCanvasOrLayers = (target: EventTarget | null) => {
  const element = target as Element | null;
  if (!element || typeof element.closest !== "function") return true;
  const doc = element.ownerDocument;
  if (doc !== document) return true;
  if (element === doc.body || element === doc.documentElement) return true;
  return !!element.closest(
    '[data-emvb-panel="layers"], .emvb-overlay, .emvb-stage, iframe[data-emvb-canvas]',
  );
};

/**
 * A focused control that owns the key (W-258): Enter on a button other than a Layers row
 * activates it, and keys in a Layers row menu stay there, instead of walking the tree.
 */
const ownsKey = (target: EventTarget | null, key: string): boolean => {
  const element = target as Element | null;
  if (!element || typeof element.closest !== "function") return false;
  if (element.closest(".emvb-layer-menu")) return true;
  if (key !== "Enter" || element.closest(".emvb-layer-select")) return false;
  return !!element.closest('button, a[href], summary, [role="button"], [role="menuitem"]');
};

/** Selected text on the page or the canvas: Ctrl/Cmd+C then copies the text, as usual (W-093). */
const hasTextSelection = (target: EventTarget | null) => {
  const docs = new Set([document, (target as Node | null)?.ownerDocument ?? document]);
  return [...docs].some((doc) => {
    const selection = doc.getSelection?.();
    return !!selection && !selection.isCollapsed && selection.toString().length > 0;
  });
};

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
  copy: (id: string) => void;
  paste: (id: string | null) => void;
  pasteStyle: (id: string | null) => void;
  /** Ctrl/Cmd+K from the canvas frame, whose keys don't reach the window (W-314). */
  palette?: () => void;
};

/**
 * Window-level editor shortcuts (W-020): save, undo and redo (W-095), duplicate, copy and paste
 * (W-093), delete, escape, arrange and traverse. Inside text fields and dialogs only Save works, so
 * typing, native undo, copy and paste keep working there. Element shortcuts also need focus on
 * the canvas, Layers, or nothing (W-132); Save, undo and redo work from the panels too.
 */
export function useEditorShortcuts({
  latest,
  dispatch,
  handlers,
}: {
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<HistoryAction>;
  handlers: React.RefObject<ShortcutHandlers>;
}): (event: KeyboardEvent) => void {
  const onKeyDown = React.useCallback((event: KeyboardEvent) => {
    if (isPaletteShortcut(event)) {
      event.preventDefault();
      handlers.current.palette?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void handlers.current.save();
      return;
    }
    if (isTextField(event.target) || inDialog(event.target)) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      dispatch(event.shiftKey ? { type: "redo" } : { type: "undo" });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "y") {
      event.preventDefault();
      dispatch({ type: "redo" });
      return;
    }
    if (!onCanvasOrLayers(event.target)) return;
    const layout = latest.current.page.layout;
    const selected = latest.current.selectedId;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selected) {
      event.preventDefault();
      handlers.current.duplicate(selected);
      return;
    }
    const clipKey =
      (event.ctrlKey || event.metaKey) && !event.altKey ? event.key.toLowerCase() : "";
    if (clipKey === "c" && !event.shiftKey && selected && !hasTextSelection(event.target)) {
      event.preventDefault();
      handlers.current.copy(selected);
      return;
    }
    if (clipKey === "v" && layout) {
      event.preventDefault();
      if (event.shiftKey) handlers.current.pasteStyle(selected);
      else handlers.current.paste(selected);
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
    // W-257: the Layers tree already moved the selection for this key; moving again skipped a row.
    if (!traverse || event.defaultPrevented || ownsKey(event.target, event.key)) return;
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
