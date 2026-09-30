import { Button, DropdownMenu, Input } from "@cloudflare/kumo";
import { DotsThreeVerticalIcon, PlusIcon, type Icon } from "@phosphor-icons/react";
import * as React from "react";
import { slugify } from "../../../core/index.ts";
import { BUTTON, FIELD, SOLID_PRIMARY } from "../../ui.ts";

/** A slug of `name` (or `fallback`) that no id in `taken` uses yet: `x`, then `x-2`, `x-3`… */
export function uniqueId(name: string, fallback: string, taken: Iterable<string>): string {
  const base = slugify(name).slice(0, 34) || fallback;
  const used = new Set(taken);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Whether any of `fields` contains the lowercased query `q`. */
export const matches = (q: string, ...fields: string[]) =>
  fields.some((field) => field.toLowerCase().includes(q));

/** A Site styles section heading with its item count and New button. */
export function SectionHead({
  title,
  count,
  countProps,
  onNew,
}: {
  title: React.ReactNode;
  count: number;
  countProps?: Record<string, string>;
  onNew: () => void;
}) {
  return (
    <div className="emvb-site-section-head">
      <h3 className="emvb-field-label">
        {title}
        <span className="emvb-site-count" {...countProps}>
          {count}
        </span>
      </h3>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={BUTTON}
        icon={<PlusIcon aria-hidden="true" />}
        onClick={onNew}
      >
        New
      </Button>
    </div>
  );
}

/** The inline create form at the end of a Site styles list. */
export function CreateRow({
  rowProps,
  submitLabel,
  onCancel,
  onCreate,
  children,
}: {
  rowProps: Record<string, string>;
  submitLabel: string;
  onCancel: () => void;
  onCreate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="emvb-site-create emvb-site-elevated" {...rowProps}>
      {children}
      <div className="emvb-dialog-actions">
        <Button type="button" variant="secondary" className={BUTTON} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          className={BUTTON}
          style={SOLID_PRIMARY}
          onClick={onCreate}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Search shown once a Site styles list is long enough to need it. */
export function SiteSearch({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Record<`data-${string}`, string>) {
  return (
    <div className="emvb-site-search" {...rest}>
      <Input
        aria-label={label}
        className={FIELD}
        type="search"
        value={value}
        placeholder={`${label}…`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            onChange("");
          }
        }}
      />
    </div>
  );
}

/**
 * The name field that replaces a row's name while renaming: Enter or blur saves once, Escape
 * cancels. `onDone` gets the trimmed new name, or null when nothing changed.
 */
export function RenameInput({
  name,
  label,
  onDone,
}: {
  name: string;
  label: string;
  onDone: (next: string | null) => void;
}) {
  const ended = React.useRef(false);
  const finish = (next: string | null) => {
    if (ended.current) return;
    ended.current = true;
    const trimmed = next?.trim();
    onDone(trimmed && trimmed !== name ? trimmed : null);
  };
  return (
    <input
      className="emvb-site-rename"
      aria-label={label}
      defaultValue={name}
      maxLength={60}
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the user asked to rename; focus moves into the field
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.currentTarget.value);
        else if (event.key === "Escape") {
          event.stopPropagation();
          finish(null);
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}

export type RowAction = {
  label: string;
  icon: Icon;
  onSelect: () => void;
  /** Run once the menu has closed and handed focus back (Rename moves focus into a field). */
  afterClose?: boolean;
  danger?: boolean;
};

/** A Site styles row's ⋮ menu. A danger action sits last, after a separator. */
export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const pending = React.useRef<(() => void) | null>(null);
  return (
    <DropdownMenu
      onOpenChangeComplete={(open) => {
        const run = pending.current;
        if (open || !run) return;
        pending.current = null;
        requestAnimationFrame(run);
      }}
    >
      <DropdownMenu.Trigger>
        <button type="button" className="emvb-site-menu-btn" aria-label={label}>
          <DotsThreeVerticalIcon size={16} weight="bold" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {actions.map((action) => (
          <React.Fragment key={action.label}>
            {action.danger && <DropdownMenu.Separator />}
            <DropdownMenu.Item
              icon={action.icon}
              variant={action.danger ? "danger" : "default"}
              onClick={() => {
                if (action.afterClose) pending.current = action.onSelect;
                else action.onSelect();
              }}
            >
              {action.label}
            </DropdownMenu.Item>
          </React.Fragment>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
