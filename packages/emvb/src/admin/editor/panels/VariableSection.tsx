import { Button, Input } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  renameVariable,
  slugify,
  type DesignSystem,
  type Layout,
  type VariableKind,
} from "../../../core/index.ts";
import { BUTTON, FIELD, SOLID_PRIMARY } from "../../ui.ts";

const VAR_TOKEN: Record<VariableKind, (id: string) => string> = {
  color: (id) => `--emvb-c-${id}`,
  font: (id) => `--emvb-f-${id}`,
  fontSize: (id) => `--emvb-fs-${id}`,
  spacing: (id) => `--emvb-s-${id}`,
};

const uniqueVarId = (design: DesignSystem, kind: VariableKind, name: string) => {
  const base = slugify(name).slice(0, 34) || kind;
  const listKey =
    kind === "color"
      ? "colors"
      : kind === "font"
        ? "fonts"
        : kind === "fontSize"
          ? "fontSizes"
          : "spacings";
  const taken = new Set((design.variables[listKey] ?? []).map((v) => v.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

export function VariableSection({
  title,
  kind,
  design,
  onSave,
  onAskDelete,
}: {
  title: string;
  kind: VariableKind;
  design: DesignSystem;
  layout: Layout | null;
  onSave: (design: DesignSystem) => Promise<void>;
  onAskDelete: (id: string, name: string) => void;
}) {
  const listKey =
    kind === "color"
      ? "colors"
      : kind === "font"
        ? "fonts"
        : kind === "fontSize"
          ? "fontSizes"
          : "spacings";
  const items = design.variables[listKey] ?? [];
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [name, setName] = React.useState("");
  const [value, setValue] = React.useState(
    kind === "color" ? "#0055ff" : kind === "font" ? "Noto Sans, sans-serif" : "16",
  );

  const q = filter.trim().toLowerCase();
  const visible = q
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          VAR_TOKEN[kind](item.id).toLowerCase().includes(q),
      )
    : items;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = uniqueVarId(design, kind, trimmed);
    let next = design;
    if (kind === "color") {
      next = {
        ...design,
        variables: {
          ...design.variables,
          colors: [...design.variables.colors, { id, name: trimmed, value }],
        },
      };
    } else if (kind === "font") {
      next = {
        ...design,
        variables: {
          ...design.variables,
          fonts: [...(design.variables.fonts ?? []), { id, name: trimmed, value }],
        },
      };
    } else {
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) return;
      const entry = { id, name: trimmed, value: { value: num, unit: "px" as const } };
      next = {
        ...design,
        variables: {
          ...design.variables,
          [listKey]: [...(design.variables[listKey] ?? []), entry],
        },
      };
    }
    await onSave(next);
    setCreating(false);
    setName("");
  };

  return (
    <section className="emvb-site-section emvb-site-card" data-emvb-var-kind={kind}>
      <div className="emvb-site-section-head">
        <h3 className="emvb-field-label">
          {title}
          <span className="emvb-site-count" data-emvb-var-count="">
            {items.length}
          </span>
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={BUTTON}
          icon={<PlusIcon aria-hidden="true" />}
          onClick={() => setCreating(true)}
        >
          New
        </Button>
      </div>
      {items.length > 3 && (
        <div data-emvb-var-filter={kind}>
          <Input
            label="Filter"
            className={FIELD}
            value={filter}
            placeholder="Search name or token…"
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      {items.length === 0 && !creating && <p className="emvb-helper">None yet.</p>}
      {items.length > 0 && visible.length === 0 && <p className="emvb-helper">No matches.</p>}
      <ul className="emvb-site-list">
        {visible.map((item) => {
          const token = VAR_TOKEN[kind](item.id);
          const colorValue =
            kind === "color" && "value" in item && typeof item.value === "string"
              ? item.value
              : null;
          return (
            <li
              key={item.id}
              className="emvb-site-row emvb-site-elevated"
              data-emvb-var-id={item.id}
            >
              {colorValue && (
                <span
                  className="emvb-swatch emvb-site-swatch"
                  style={{ background: colorValue }}
                  aria-hidden="true"
                  data-emvb-var-swatch=""
                />
              )}
              <div className="emvb-site-row-fields">
                <Input
                  label="Name"
                  className={FIELD}
                  value={item.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    void onSave(renameVariable(design, item.id, kind, nextName));
                  }}
                />
                {kind === "color" || kind === "font" ? (
                  <Input
                    label="Value"
                    className={FIELD}
                    value={"value" in item && typeof item.value === "string" ? item.value : ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      const list = (design.variables[listKey] ?? []).map((entry) =>
                        entry.id === item.id
                          ? Object.assign({}, entry, { value: nextValue })
                          : entry,
                      );
                      void onSave({
                        ...design,
                        variables: { ...design.variables, [listKey]: list },
                      });
                    }}
                  />
                ) : (
                  <Input
                    label="Value (px)"
                    className={FIELD}
                    type="number"
                    value={
                      typeof item.value === "object" && item.value && "value" in item.value
                        ? String((item.value as { value: number }).value)
                        : ""
                    }
                    onChange={(event) => {
                      const num = Number(event.target.value);
                      if (!Number.isFinite(num) || num < 0) return;
                      const list = (design.variables[listKey] ?? []).map((entry) =>
                        entry.id === item.id
                          ? Object.assign({}, entry, {
                              value: { value: num, unit: "px" as const },
                            })
                          : entry,
                      );
                      void onSave({
                        ...design,
                        variables: { ...design.variables, [listKey]: list },
                      });
                    }}
                  />
                )}
                <p className="emvb-mono emvb-site-token" title={token}>
                  {token}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={BUTTON}
                aria-label={`Delete ${item.name}`}
                icon={<TrashIcon aria-hidden="true" />}
                onClick={() => onAskDelete(item.id, item.name)}
              />
            </li>
          );
        })}
      </ul>
      {creating && (
        <div className="emvb-site-create emvb-site-elevated" data-emvb-var-create={kind}>
          <Input
            label="Name"
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={kind === "fontSize" || kind === "spacing" ? "Value (px)" : "Value"}
            className={FIELD}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="emvb-dialog-actions">
            <Button
              type="button"
              variant="secondary"
              className={BUTTON}
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className={BUTTON}
              style={SOLID_PRIMARY}
              onClick={() => void create()}
            >
              Create
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
