import { TrashIcon } from "@phosphor-icons/react";
import type { CanvasSelection } from "./CanvasFrame.tsx";

export type Box = { top: number; left: number; width: number; height: number };

const LABEL_HEIGHT = 24;

const place = (box: Box) => ({
  top: box.top,
  left: box.left,
  width: box.width,
  height: box.height,
});

/** Hover and selection outlines plus the floating label (DESIGN.md, canvas overlay). */
export function SelectionOverlay({
  hover,
  selected,
  selectedId,
  selection,
  dropLine,
}: {
  hover: Box | null;
  selected: Box | null;
  selectedId: string | null;
  selection: CanvasSelection;
  dropLine?: Box | null;
}) {
  return (
    <div className="emvb-overlay" aria-hidden={selected || dropLine ? undefined : true}>
      {dropLine && (
        <div className="emvb-drop-line" data-emvb-drop-line="" style={place(dropLine)} />
      )}
      {hover && <div className="emvb-outline-hover" style={place(hover)} />}
      {selected && selectedId && (
        <>
          <div
            className="emvb-outline-selected"
            data-emvb-selected={selectedId}
            style={place(selected)}
          />
          <div
            className="emvb-overlay-label"
            style={{
              top: selected.top >= LABEL_HEIGHT ? selected.top - LABEL_HEIGHT : selected.top,
              left: Math.max(0, selected.left),
            }}
          >
            <span>{selection.labelFor(selectedId)}</span>
            {selection.canDelete(selectedId) && (
              <button
                type="button"
                className="emvb-overlay-action"
                aria-label="Delete element"
                title="Delete element"
                onClick={() => selection.onDelete(selectedId)}
              >
                <TrashIcon size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
