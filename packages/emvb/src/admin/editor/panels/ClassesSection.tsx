import { Button, Input } from "@cloudflare/kumo";
import { CopySimpleIcon, TrashIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  duplicateClass,
  findClassUsages,
  type DesignSystem,
  type Layout,
  type StyleProps,
} from "../../../core/index.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { CreateRow, matches, SectionHead, uniqueId } from "./site-list.tsx";
import { StyleRow } from "./settings/StyleRow.tsx";

const CLASS_STYLE_KEYS = [
  "color",
  "backgroundColor",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "gap",
  "borderRadius",
  "flexDirection",
  "justifyContent",
  "alignItems",
] as const satisfies ReadonlyArray<keyof StyleProps>;

export function ClassesSection({
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
  const [filter, setFilter] = React.useState("");

  const q = filter.trim().toLowerCase();
  const visible = q
    ? classes.filter((cls) => matches(q, cls.name, cls.id, `emvb-k-${cls.id}`))
    : classes;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = uniqueId(
      trimmed,
      "class",
      classes.map((c) => c.id),
    );
    const next = { id, name: trimmed, style: {} as StyleProps };
    await onSave({ ...design, classes: [...classes, next] });
    setCreating(false);
    setName("");
    setEditing(id);
  };

  return (
    <section className="emvb-site-section" data-emvb-classes="">
      <p className="emvb-helper emvb-site-cascade" data-emvb-cascade-help="">
        Cascade: variables → classes (applied order on the element; later wins) → local styles.
        Editing a class updates every element that uses it.
      </p>
      <SectionHead title="Classes" count={classes.length} onNew={() => setCreating(true)} />
      {classes.length > 3 && (
        <Input
          label="Filter"
          className={FIELD}
          value={filter}
          placeholder="Search class…"
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      {classes.length === 0 && !creating && <p className="emvb-helper">None yet.</p>}
      <ul className="emvb-site-list">
        {visible.map((cls) => {
          const count = layout ? findClassUsages(layout, cls.id).length : 0;
          const open = editing === cls.id;
          const token = `emvb-k-${cls.id}`;
          return (
            <li
              key={cls.id}
              className={`emvb-site-class emvb-site-elevated${open ? " emvb-site-class-active" : ""}`}
              data-emvb-class-def={cls.id}
              data-emvb-class-editing={open ? "" : undefined}
            >
              <div className="emvb-site-row">
                <div className="emvb-site-row-fields">
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
                  <p className="emvb-mono emvb-site-token">{token}</p>
                </div>
                <span className="emvb-helper emvb-site-usage">{count} used</span>
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
                  aria-label={`Duplicate ${cls.name}`}
                  icon={<CopySimpleIcon aria-hidden="true" />}
                  onClick={() => void onSave(duplicateClass(design, cls.id))}
                />
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
                  <p className="emvb-helper">Editing class styles (site-wide).</p>
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
        <CreateRow
          rowProps={{ "data-emvb-class-create": "" }}
          submitLabel="Create class"
          onCancel={() => setCreating(false)}
          onCreate={() => void create()}
        >
          <Input
            label="Name"
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </CreateRow>
      )}
    </section>
  );
}
