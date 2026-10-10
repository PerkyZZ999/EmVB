import { DropdownMenu } from "@cloudflare/kumo";
import {
  ClipboardTextIcon,
  CopyIcon,
  CopySimpleIcon,
  DotsSixVerticalIcon,
  PaintBrushIcon,
  ProhibitIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { CanvasSelection } from "./CanvasFrame.tsx";
import { EXISTING_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { dragStash } from "../dnd/drag-stash.ts";

export type Box = { top: number; left: number; width: number; height: number };

export type InvalidDrop = {
  outline: Box;
  label: { x: number; y: number; reason: string };
};

/** The container a valid drop goes into, outlined and named while dragging (W-128). */
export type DropTarget = { outline: Box; label: string };

const LABEL_HEIGHT = 26;

/**
 * Where the "Inside …" label goes (W-129): inside the target's top-left corner, so it doesn't
 * cover the element above; above the outline only when the target is too short to hold it. On a
 * scaled canvas (W-158) an empty 48 px box can be under 30 px on screen, so the inset shrinks
 * rather than the label moving out.
 */
export function dropLabelAt(outline: Box): { top: number; left: number } {
  if (outline.height < LABEL_HEIGHT)
    return { top: Math.max(0, outline.top - LABEL_HEIGHT), left: outline.left };
  const inset = Math.min(4, (outline.height - LABEL_HEIGHT) / 2);
  return { top: outline.top + inset, left: outline.left + 4 };
}

/** Tall enough for the selected element's toolbar to sit inside its top-left corner. */
const TOOLBAR_ROOM = 2 * LABEL_HEIGHT;

/**
 * Where the selected element's toolbar goes (W-131): inside the element's top-left corner, so it
 * doesn't cover the element above, and kept in view while a tall element scrolls. Outside (above,
 * or below at the top of the canvas) when the element is too short, or while its text is being
 * edited on the canvas. The toolbar lets clicks through except on its buttons.
 */
export function toolbarAt(box: Box, editing = false): { top: number; left: number } {
  const left = Math.max(0, box.left);
  if (box.height >= TOOLBAR_ROOM && !editing) {
    const lowest = box.top + box.height - LABEL_HEIGHT - 2;
    return { top: Math.min(Math.max(box.top + 2, 2), lowest), left: left + 2 };
  }
  if (box.top >= LABEL_HEIGHT) return { top: box.top - LABEL_HEIGHT, left };
  return { top: box.top + box.height, left };
}

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
  dropTarget,
  invalid,
  editing = false,
}: {
  hover: Box | null;
  selected: Box | null;
  selectedId: string | null;
  selection: CanvasSelection;
  dropLine?: Box | null;
  dropTarget?: DropTarget | null;
  invalid?: InvalidDrop | null;
  /** The selected element's text is being edited on the canvas (W-131). */
  editing?: boolean;
}) {
  const show = selected || dropLine || invalid || dropTarget;
  return (
    <div className="emvb-overlay" aria-hidden={show ? undefined : true}>
      {dropTarget && (
        <>
          <div
            className="emvb-drop-target"
            data-emvb-drop-target=""
            style={place(dropTarget.outline)}
          />
          <div
            className="emvb-drop-target-label"
            data-emvb-drop-target-label=""
            style={dropLabelAt(dropTarget.outline)}
          >
            {dropTarget.label}
          </div>
        </>
      )}
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
            data-emvb-toolbar=""
            style={toolbarAt(selected, editing)}
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
                  dragStash.existing(selectedId);
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
            {selection.clipboard && (
              <ClipboardMenu clipboard={selection.clipboard} selectedId={selectedId} />
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

/** Copy and paste on the selected element (W-093); paste items say why when they're unavailable. */
function ClipboardMenu({
  clipboard,
  selectedId,
}: {
  clipboard: NonNullable<CanvasSelection["clipboard"]>;
  selectedId: string;
}) {
  const hint = clipboard.pasteStyleBlocked ?? clipboard.pasteBlocked;
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger>
        <button
          type="button"
          className="emvb-overlay-action"
          aria-label="Copy and paste"
          title="Copy and paste"
        >
          <ClipboardTextIcon size={16} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content data-emvb-clipboard-menu={selectedId}>
        <DropdownMenu.Item icon={CopySimpleIcon} onClick={() => clipboard.copy(selectedId)}>
          Copy
        </DropdownMenu.Item>
        <DropdownMenu.Item
          icon={ClipboardTextIcon}
          disabled={!!clipboard.pasteBlocked}
          onClick={() => clipboard.paste(selectedId)}
        >
          Paste
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={PaintBrushIcon} onClick={() => clipboard.copyStyle(selectedId)}>
          Copy style
        </DropdownMenu.Item>
        <DropdownMenu.Item
          icon={PaintBrushIcon}
          disabled={!!clipboard.pasteStyleBlocked}
          onClick={() => clipboard.pasteStyle(selectedId)}
        >
          Paste style
        </DropdownMenu.Item>
        {hint && (
          <p className="emvb-menu-hint" data-emvb-paste-hint="">
            {hint}
          </p>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
