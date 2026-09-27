import { Button, Input, Tabs } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  clearClassRefs,
  deleteVariable,
  findClassUsages,
  findVariableUsages,
  findVariableUsagesInDesign,
  removeVariable,
  renameVariable,
  slugify,
  type DesignSystem,
  type Layout,
  type StyleProps,
  type VariableKind,
} from "../../../core/index.ts";
import { BUTTON, FIELD, SOLID_DESTRUCTIVE, SOLID_PRIMARY } from "../../ui.ts";
import { StyleRow } from "./settings/StyleRow.tsx";

type Props = {
  design: DesignSystem;
  layout: Layout | null;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  onLayoutChange: (layout: Layout) => void;
  onClose: () => void;
};

const CLASS_STYLE_KEYS = [
  "color",
  "backgroundColor",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontSize",
  "fontFamily",
  "gap",
  "borderRadius",
] as const satisfies ReadonlyArray<keyof StyleProps>;

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

const uniqueClassId = (design: DesignSystem, name: string) => {
  const base = slugify(name).slice(0, 34) || "class";
  const taken = new Set((design.classes ?? []).map((c) => c.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

function InlineError({ children }: { children: string }) {
  return (
    <p className="emvb-inline-error" role="alert">
      <WarningCircleIcon size={16} aria-hidden="true" />
      {children}
    </p>
  );
}

/**
 * Site styles drawer (W-032): Variables and Classes for the design system.
 * Saves via onDesignChange (immediate CAS); optional layout clear on delete.
 */
export function SiteStylesDrawer({
  design,
  layout,
  onDesignChange,
  onLayoutChange,
  onClose,
}: Props) {
  const [tab, setTab] = React.useState<"variables" | "classes">("variables");
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<
    | { kind: "variable"; variableKind: VariableKind; id: string; name: string }
    | { kind: "class"; id: string; name: string }
    | null
  >(null);

  const save = async (next: DesignSystem) => {
    setError(null);
    try {
      await onDesignChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save site styles. Try again.");
    }
  };

  return (
    <div className="emvb-panel-body emvb-site-styles" data-emvb-site-styles="">
      <div className="emvb-site-styles-head">
        <h2 className="emvb-panel-title">Site styles</h2>
        <Button
          type="button"
          variant="ghost"
          shape="square"
          className="emvb-icon-btn"
          aria-label="Close site styles"
          icon={<XIcon aria-hidden="true" />}
          onClick={onClose}
        />
      </div>
      <Tabs
        variant="segmented"
        className="emvb-tabs"
        tabs={[
          { value: "variables", label: "Variables" },
          { value: "classes", label: "Classes" },
        ]}
        value={tab}
        onValueChange={(value) => setTab(value === "classes" ? "classes" : "variables")}
      />
      {error && <InlineError>{error}</InlineError>}
      {tab === "variables" && (
        <div data-emvb-site-tab="variables" className="emvb-site-styles-body">
          <VariableSection
            title="Colors"
            kind="color"
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) =>
              setConfirm({ kind: "variable", variableKind: "color", id, name })
            }
          />
          <VariableSection
            title="Fonts"
            kind="font"
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) =>
              setConfirm({ kind: "variable", variableKind: "font", id, name })
            }
          />
          <VariableSection
            title="Font sizes"
            kind="fontSize"
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) =>
              setConfirm({ kind: "variable", variableKind: "fontSize", id, name })
            }
          />
          <VariableSection
            title="Spacing"
            kind="spacing"
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) =>
              setConfirm({ kind: "variable", variableKind: "spacing", id, name })
            }
          />
        </div>
      )}
      {tab === "classes" && (
        <div data-emvb-site-tab="classes" className="emvb-site-styles-body">
          <ClassesSection
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) => setConfirm({ kind: "class", id, name })}
          />
        </div>
      )}
      <p className="emvb-helper emvb-site-styles-footer">
        Changes to site styles apply to all pages immediately.
      </p>
      {confirm && (
        <DeleteConfirm
          confirm={confirm}
          design={design}
          layout={layout}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm.kind === "variable") {
              if (layout) {
                const result = deleteVariable(design, layout, confirm.id, confirm.variableKind);
                onLayoutChange(result.layout);
                await save(result.design);
              } else {
                await save(removeVariable(design, confirm.id, confirm.variableKind));
              }
            } else {
              const classes = (design.classes ?? []).filter((c) => c.id !== confirm.id);
              if (layout) onLayoutChange(clearClassRefs(layout, confirm.id));
              await save({ ...design, classes });
            }
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function DeleteConfirm({
  confirm,
  design,
  layout,
  onCancel,
  onConfirm,
}: {
  confirm:
    | { kind: "variable"; variableKind: VariableKind; id: string; name: string }
    | { kind: "class"; id: string; name: string };
  design: DesignSystem;
  layout: Layout | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const usages =
    confirm.kind === "variable"
      ? [
          ...(layout ? findVariableUsages(layout, confirm.id, confirm.variableKind) : []),
          ...findVariableUsagesInDesign(design, confirm.id, confirm.variableKind),
        ]
      : layout
        ? findClassUsages(layout, confirm.id)
        : [];
  return (
    <div className="emvb-site-confirm" data-emvb-site-confirm="" role="alertdialog">
      <p className="emvb-field-label">Delete {confirm.name}?</p>
      {usages.length > 0 ? (
        <p className="emvb-helper">
          In use on {usages.length} {usages.length === 1 ? "place" : "places"} on this page.
          Deleting drops those bindings.
        </p>
      ) : (
        <p className="emvb-helper">Not used on this page.</p>
      )}
      <div className="emvb-dialog-actions">
        <Button type="button" variant="secondary" className={BUTTON} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          className={BUTTON}
          style={SOLID_DESTRUCTIVE}
          onClick={onConfirm}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function VariableSection({
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
  const [name, setName] = React.useState("");
  const [value, setValue] = React.useState(
    kind === "color" ? "#0055ff" : kind === "font" ? "Noto Sans, sans-serif" : "16",
  );

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
    <section className="emvb-site-section" data-emvb-var-kind={kind}>
      <div className="emvb-site-section-head">
        <h3 className="emvb-field-label">{title}</h3>
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
      {items.length === 0 && !creating && <p className="emvb-helper">None yet.</p>}
      <ul className="emvb-site-list">
        {items.map((item) => (
          <li key={item.id} className="emvb-site-row" data-emvb-var-id={item.id}>
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
                    entry.id === item.id ? Object.assign({}, entry, { value: nextValue }) : entry,
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
                      ? Object.assign({}, entry, { value: { value: num, unit: "px" as const } })
                      : entry,
                  );
                  void onSave({
                    ...design,
                    variables: { ...design.variables, [listKey]: list },
                  });
                }}
              />
            )}
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
        ))}
      </ul>
      {creating && (
        <div className="emvb-site-create" data-emvb-var-create={kind}>
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

function ClassesSection({
  design,
  layout,
  onSave,
  onAskDelete,
}: {
  design: DesignSystem;
  layout: Layout | null;
  onSave: (design: DesignSystem) => Promise<void>;
  onAskDelete: (id: string, name: string) => void;
}) {
  const classes = design.classes ?? [];
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = uniqueClassId(design, trimmed);
    const next = { id, name: trimmed, style: {} as StyleProps };
    await onSave({ ...design, classes: [...classes, next] });
    setCreating(false);
    setName("");
    setEditing(id);
  };

  return (
    <section className="emvb-site-section" data-emvb-classes="">
      <div className="emvb-site-section-head">
        <h3 className="emvb-field-label">Classes</h3>
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
      {classes.length === 0 && !creating && <p className="emvb-helper">None yet.</p>}
      <ul className="emvb-site-list">
        {classes.map((cls) => {
          const count = layout ? findClassUsages(layout, cls.id).length : 0;
          const open = editing === cls.id;
          return (
            <li key={cls.id} className="emvb-site-class" data-emvb-class-def={cls.id}>
              <div className="emvb-site-row">
                <Input
                  label="Name"
                  className={FIELD}
                  value={cls.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    void onSave({
                      ...design,
                      classes: classes.map((c) =>
                        c.id === cls.id ? Object.assign({}, c, { name: nextName }) : c,
                      ),
                    });
                  }}
                />
                <span className="emvb-helper">{count} used</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={BUTTON}
                  onClick={() => setEditing(open ? null : cls.id)}
                >
                  {open ? "Hide styles" : "Edit styles"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={BUTTON}
                  aria-label={`Delete ${cls.name}`}
                  icon={<TrashIcon aria-hidden="true" />}
                  onClick={() => onAskDelete(cls.id, cls.name)}
                />
              </div>
              {open && (
                <div className="emvb-site-class-styles">
                  {CLASS_STYLE_KEYS.map((key) => (
                    <StyleRow
                      key={key}
                      styleKey={key}
                      style={cls.style}
                      design={design}
                      onPatch={(patch) => {
                        const style = { ...cls.style, ...patch };
                        for (const [k, v] of Object.entries(patch)) {
                          if (v === undefined) delete (style as Record<string, unknown>)[k];
                        }
                        void onSave({
                          ...design,
                          classes: classes.map((c) =>
                            c.id === cls.id ? Object.assign({}, c, { style }) : c,
                          ),
                        });
                      }}
                      onDesignChange={onSave}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {creating && (
        <div className="emvb-site-create" data-emvb-class-create="">
          <Input
            label="Name"
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
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
              Create class
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
