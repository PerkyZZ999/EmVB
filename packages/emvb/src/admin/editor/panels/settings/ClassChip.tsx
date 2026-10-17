import { DropdownMenu } from "@cloudflare/kumo";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CopySimpleIcon,
  DotsThreeVerticalIcon,
  PaintBrushIcon,
  PencilSimpleLineIcon,
  TagSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { StateDot } from "./StateSwitcher.tsx";
import { isCancelEscape, isCommitEnter } from "../../ime.ts";

/** Keys the chip box handles itself, so the editor's window shortcuts (delete, arrange) don't. */
export const stopEditorShortcuts = (event: React.KeyboardEvent) => {
  if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
};

type Props = {
  id: string;
  name: string;
  active: boolean;
  /** The class has hover, focus or active styles (W-089). */
  hasStates?: boolean;
  /** UX-067: the id names no class in Site styles any more, so there is nothing to edit. */
  missing?: boolean;
  first: boolean;
  last: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onEdit: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
};

/**
 * One applied class in the chip input (W-087): the chip edits the class, its menu renames,
 * duplicates, reorders or removes it, and the × removes it. F2 renames in place.
 */
export function ClassChip(props: Props) {
  const { id, active, missing } = props;
  // The visible label reads "Missing (id)"; names read "Remove missing class id".
  const name = missing ? `missing class ${id}` : props.name;
  const label = missing ? `Missing (${id})` : props.name;
  const [renaming, setRenaming] = React.useState(false);
  const main = React.useRef<HTMLButtonElement | null>(null);
  /** Enter, Escape and the blur that can follow them must end one rename only once. */
  const ended = React.useRef(false);
  /** Rename chosen in the menu starts once the menu has closed and handed focus back. */
  const renameAfterMenu = React.useRef(false);

  const startRename = () => {
    ended.current = false;
    setRenaming(true);
  };

  const finish = (next: string | null) => {
    if (ended.current) return;
    ended.current = true;
    setRenaming(false);
    const trimmed = next?.trim();
    if (trimmed && trimmed !== name) props.onRename(trimmed);
    requestAnimationFrame(() => main.current?.focus());
  };

  return (
    <span
      className="emvb-chip"
      data-emvb-class-id={id}
      data-active={active}
      data-missing={missing ? "" : undefined}
      onKeyDown={stopEditorShortcuts}
    >
      {renaming ? (
        <input
          className="emvb-chip-rename"
          aria-label={`Rename ${name}`}
          defaultValue={name}
          maxLength={60}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the user asked to rename; focus moves into the field
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (isCommitEnter(event)) finish(event.currentTarget.value);
            else if (isCancelEscape(event)) finish(null);
          }}
          onBlur={(event) => finish(event.currentTarget.value)}
        />
      ) : (
        <button
          type="button"
          ref={(el) => {
            main.current = el;
            props.buttonRef(el);
          }}
          className="emvb-chip-main"
          aria-pressed={active}
          title={
            missing
              ? "This class isn't in Site styles any more. Remove it from the element."
              : `${name} · .emvb-k-${id}`
          }
          onClick={missing ? undefined : props.onEdit}
          onKeyDown={(event) => {
            if (event.key === "F2" && !missing) {
              event.preventDefault();
              startRename();
            } else props.onKeyDown(event);
          }}
        >
          <TagSimpleIcon size={12} aria-hidden="true" />
          <span className="emvb-chip-label">{label}</span>
          {props.hasStates && <StateDot />}
        </button>
      )}
      <DropdownMenu
        onOpenChangeComplete={(open) => {
          if (open || !renameAfterMenu.current) return;
          renameAfterMenu.current = false;
          requestAnimationFrame(startRename);
        }}
      >
        <DropdownMenu.Trigger>
          <button type="button" className="emvb-chip-icon" aria-label={`Actions for ${name}`}>
            <DotsThreeVerticalIcon size={12} weight="bold" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content data-emvb-chip-menu={id}>
          <DropdownMenu.Item icon={PaintBrushIcon} disabled={missing} onClick={props.onEdit}>
            Edit class styles
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={PencilSimpleLineIcon}
            disabled={missing}
            onClick={() => {
              renameAfterMenu.current = true;
            }}
          >
            Rename
          </DropdownMenu.Item>
          <DropdownMenu.Item icon={CopySimpleIcon} disabled={missing} onClick={props.onDuplicate}>
            Duplicate
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={ArrowLeftIcon}
            disabled={props.first}
            onClick={() => props.onMove(-1)}
          >
            Move earlier
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={ArrowRightIcon}
            disabled={props.last}
            onClick={() => props.onMove(1)}
          >
            Move later
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item icon={XIcon} onClick={props.onRemove}>
            Remove from element
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
      <button
        type="button"
        className="emvb-chip-icon"
        tabIndex={-1}
        aria-label={`Remove ${name}`}
        onClick={props.onRemove}
      >
        <XIcon size={12} aria-hidden="true" />
      </button>
    </span>
  );
}
