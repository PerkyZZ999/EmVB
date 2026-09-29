import { Button, Input } from "@cloudflare/kumo";
import { TrashIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  renameVariable,
  type DesignSystem,
  type Layout,
  type VariableKind,
} from "../../../core/index.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { CreateRow, matches, SectionHead, uniqueId } from "./site-list.tsx";

const VAR_TOKEN: Record<VariableKind, (id: string) => string> = {
  color: (id) => `--emvb-c-${id}`,
  font: (id) => `--emvb-f-${id}`,
  fontSize: (id) => `--emvb-fs-${id}`,
  spacing: (id) => `--emvb-s-${id}`,
};

const LIST_KEY = {
  color: "colors",
  font: "fonts",
  fontSize: "fontSizes",
  spacing: "spacings",
} as const satisfies Record<VariableKind, keyof DesignSystem["variables"]>;

const NEW_VALUE: Record<VariableKind, string> = {
  color: "#0055ff",
  font: "Noto Sans, sans-serif",
  fontSize: "16",
  spacing: "16",
};

const isLength = (kind: VariableKind) => kind === "fontSize" || kind === "spacing";

/** A px length from a text field, or undefined unless it is a non-negative number. */
function pxValue(text: string) {
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? { value, unit: "px" as const } : undefined;
}

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
  const listKey = LIST_KEY[kind];
  const items = design.variables[listKey] ?? [];
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [name, setName] = React.useState("");
  const [value, setValue] = React.useState(NEW_VALUE[kind]);

  const saveList = (list: readonly object[]) =>
    void onSave({ ...design, variables: { ...design.variables, [listKey]: list } });

  const q = filter.trim().toLowerCase();
  const visible = q
    ? items.filter((item) => matches(q, item.name, item.id, VAR_TOKEN[kind](item.id)))
    : items;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = uniqueId(
      trimmed,
      kind,
      items.map((item) => item.id),
    );
    const length = isLength(kind) ? pxValue(value) : undefined;
    if (isLength(kind) && !length) return;
    const entry = { id, name: trimmed, value: length ?? value };
    await onSave({ ...design, variables: { ...design.variables, [listKey]: [...items, entry] } });
    setCreating(false);
    setName("");
  };

  return (
    <section className="emvb-site-section emvb-site-card" data-emvb-var-kind={kind}>
      <SectionHead
        title={title}
        count={items.length}
        countProps={{ "data-emvb-var-count": "" }}
        onNew={() => setCreating(true)}
      />
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
                {!isLength(kind) ? (
                  <Input
                    label="Value"
                    className={FIELD}
                    value={"value" in item && typeof item.value === "string" ? item.value : ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      saveList(
                        items.map((entry) =>
                          entry.id === item.id
                            ? Object.assign({}, entry, { value: nextValue })
                            : entry,
                        ),
                      );
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
                      const length = pxValue(event.target.value);
                      if (!length) return;
                      saveList(
                        items.map((entry) =>
                          entry.id === item.id
                            ? Object.assign({}, entry, { value: length })
                            : entry,
                        ),
                      );
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
        <CreateRow
          rowProps={{ "data-emvb-var-create": kind }}
          submitLabel="Create"
          onCancel={() => setCreating(false)}
          onCreate={() => void create()}
        >
          <Input
            label="Name"
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={isLength(kind) ? "Value (px)" : "Value"}
            className={FIELD}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </CreateRow>
      )}
    </section>
  );
}
