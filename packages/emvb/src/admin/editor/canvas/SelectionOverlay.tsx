import { CopyIcon, DotsSixVerticalIcon, ProhibitIcon, TrashIcon } from "@phosphor-icons/react";
import type { CanvasSelection } from "./CanvasFrame.tsx";
import { EXISTING_ELEMENT_MIME } from "../dnd/drop-target.ts";

export type Box = { top: number; left: number; width: number; height: number };

export type InvalidDrop = {
  outline: Box;
  label: { x: number; y: number; reason: string };
};

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
  invalid,
}: {
  hover: Box | null;
  selected: Box | null;
  selectedId: string | null;
  selection: CanvasSelection;
  dropLine?: Box | null;
  invalid?: InvalidDrop | null;
}) {
  const show = selected || dropLine || invalid;
  return (
    <div className="emvb-overlay" aria-hidden={show ? undefined : true}>
      {dropLine && (
        <div className="emvb-drop-line" data-emvb-drop-line="" style={place(dropLine)} />
      )}
      {invalid && (
        <>
          <div
            className="emvb-outline-invalid"
            data-emvb-invalid-outline=""
            style={place(invalid.outline)}
          />
          <div
            className="emvb-invalid-label"
            data-emvb-invalid-label=""
            style={{ top: invalid.label.y + 12, left: invalid.label.x + 12 }}
          >
            <ProhibitIcon size={14} aria-hidden="true" />
            <span>{invalid.label.reason}</span>
          </div>
        </>
      )}
      {hover && !invalid && <div className="emvb-outline-hover" style={place(hover)} />}
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
            {selection.canMove(selectedId) && (
              <button
                type="button"
                className="emvb-overlay-action emvb-overlay-move"
                aria-label="Move element"
                title="Move element"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(EXISTING_ELEMENT_MIME, selectedId);
                  event.dataTransfer.effectAllowed = "move";
                  try {
                    sessionStorage.setItem("emvb-drag-id", selectedId);
                    sessionStorage.removeItem("emvb-drag-type");
                  } catch {
                    /* private mode */
                  }
                }}
              >
                <DotsSixVerticalIcon size={16} aria-hidden="true" />
              </button>
            )}
            <span>{selection.labelFor(selectedId)}</span>
            {selection.canDuplicate(selectedId) && (
              <button
                type="button"
                className="emvb-overlay-action"
                aria-label="Duplicate element"
                title="Duplicate element"
                onClick={() => selection.onDuplicate(selectedId)}
              >
                <CopyIcon size={16} aria-hidden="true" />
              </button>
            )}
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
