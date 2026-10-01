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

const LABEL_HEIGHT = 26;

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
