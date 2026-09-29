import { Button } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { slugify } from "../../../core/index.ts";
import { BUTTON, SOLID_PRIMARY } from "../../ui.ts";

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
