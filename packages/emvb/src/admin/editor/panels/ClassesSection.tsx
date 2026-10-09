import { Empty, Input } from "@cloudflare/kumo";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CopySimpleIcon,
  PaintBrushIcon,
  PencilSimpleLineIcon,
  TagSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import {
  cleanClassName,
  duplicateClass,
  MAX_CLASSES,
  findClassUsages,
  moveDesignClass,
  patchClassState,
  patchClassStyle,
  renameClass,
  classNameTaken,
  classNameTakenMessage,
  type DesignSystem,
  type Layout,
  type StyleProps,
} from "../../../core/index.ts";
import { FIELD } from "../../ui.ts";
import {
  CreateRow,
  matches,
  RenameInput,
  RowMenu,
  SectionHead,
  SiteSearch,
  uniqueId,
} from "./site-list.tsx";
import { StateSwitcher, type StyleStateChoice } from "./settings/StateSwitcher.tsx";
import {
  keysFor,
  SECTION_LABELS,
  type StyleKey,
  type StyleSectionId,
} from "./settings/style-sections.ts";
import { StyleRow } from "./settings/StyleRow.tsx";

/** Same sections as the Style tab. Advanced has no keys. A class can sit on any element. */
const CLASS_SECTIONS: StyleSectionId[] = [
  "layout",
  "spacing",
  "size",
  "position",
  "typography",
  "background",
  "border",
  "effects",
];

function classKeys(
  section: StyleSectionId,
  style: StyleProps | undefined,
  position: StyleProps["position"],
  state: StyleStateChoice,
): StyleKey[] {
  const keys = keysFor("container", section, style, position);
  const withFit =
    section === "size" && !keys.includes("objectFit") ? [...keys, "objectFit" as const] : keys;
  return (
    state === "normal"
      ? withFit
      : withFit.filter(
          (key) =>
            key !== "transition" &&
            key !== "entrance" &&
            key !== "iconAnimation" &&
            key !== "scrollMotion",
        )
  ) as StyleKey[];
}

function ClassStyleEditor({
  cls,
  design,
  onSave,
}: {
  cls: NonNullable<DesignSystem["classes"]>[number];
  design: DesignSystem;
  onSave: (design: DesignSystem) => Promise<void>;
}) {
  const [state, setState] = React.useState<StyleStateChoice>("normal");
  const [section, setSection] = React.useState<StyleSectionId>("layout");
  const style = state === "normal" ? cls.style : cls.states?.[state];
  const position = style?.position ?? cls.style.position;
  const keys = classKeys(section, style, position, state);
  return (
    <div className="emvb-site-item-body emvb-site-class-styles">
      <p className="emvb-helper">These styles apply everywhere this class is used.</p>
      <StateSwitcher value={state} states={cls.states} className={cls.name} onChange={setState} />
      <div className="emvb-site-class-sections" role="tablist" aria-label="Class style sections">
        {CLASS_SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            data-emvb-class-section={id}
            className="emvb-site-class-section"
            onClick={() => setSection(id)}
          >
            {SECTION_LABELS[id]}
          </button>
        ))}
      </div>
      {keys.map((key) => (
        <StyleRow
          key={`${state}:${key}`}
          styleKey={key}
          style={style}
          design={design}
          onPatch={(patch) =>
            void onSave(
              state === "normal"
                ? patchClassStyle(design, cls.id, patch)
                : patchClassState(design, cls.id, state, patch),
            )
          }
          onDesignChange={onSave}
        />
      ))}
    </div>
  );
}

/** "2 on page": class usage is counted on the open page only. */
const usageText = (count: number) => `${count} on page`;

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
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const rows = React.useRef(new Map<string, HTMLButtonElement>());

  const q = filter.trim().toLowerCase();
  const visible = q
    ? classes.filter((cls) => matches(q, cls.name, cls.id, `emvb-k-${cls.id}`))
    : classes;

  const create = async () => {
    const trimmed = cleanClassName(name);
    if (!trimmed || classes.length >= MAX_CLASSES) return;
    if (classNameTaken(design, trimmed)) {
      setNameError(classNameTakenMessage(trimmed));
      return;
    }
    setNameError(null);
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

  const rename = (id: string, next: string | null) => {
    setRenaming(null);
    requestAnimationFrame(() => rows.current.get(id)?.focus());
    if (next && classNameTaken(design, next, id)) {
      setNameError(classNameTakenMessage(next));
      return;
    }
    setNameError(null);
    if (next) void onSave(renameClass(design, id, next));
  };

  return (
    <section className="emvb-site-section" data-emvb-classes="">
      <p className="emvb-helper emvb-site-cascade" data-emvb-cascade-help="">
        When two classes set the same property, the one lower in this list wins. Local styles on an
        element still win. Editing a class updates every element that uses it. Tablet and mobile
        overrides stay on the Style tab.
      </p>
      <SectionHead
        title="Classes"
        count={classes.length}
        onNew={() => setCreating(true)}
        newDisabled={classes.length >= MAX_CLASSES}
      />
      {classes.length >= MAX_CLASSES ? (
        <p className="emvb-helper" data-emvb-class-cap="">
          This site has 100 classes, the most allowed. Delete one to add another.
        </p>
      ) : null}
      {classes.length > 3 && (
        <SiteSearch label="Search classes" value={filter} onChange={setFilter} />
      )}
      {classes.length === 0 && !creating && (
        <div className="emvb-site-empty-card" data-emvb-classes-empty="">
          <Empty
            size="sm"
            icon={<TagSimpleIcon size={24} aria-hidden="true" />}
            title="No classes yet"
            description="Select an element, open its Style tab and type a name in the Classes box. Or use New here."
          />
        </div>
      )}
      {classes.length > 0 && visible.length === 0 && (
        <p className="emvb-helper" data-emvb-classes-nomatch="">
          No classes match "{filter.trim()}".
        </p>
      )}
      <ul className="emvb-site-items">
        {visible.map((cls) => {
          const count = layout ? findClassUsages(layout, cls.id).length : 0;
          const open = editing === cls.id;
          const token = `emvb-k-${cls.id}`;
          const toggle = () => setEditing(open ? null : cls.id);
          return (
            <li
              key={cls.id}
              className="emvb-site-item"
              data-emvb-class-def={cls.id}
              data-emvb-class-editing={open ? "" : undefined}
              data-open={open || undefined}
            >
              <div className="emvb-site-item-row">
                {renaming === cls.id ? (
                  <span className="emvb-site-item-main" data-renaming="">
                    <TagSimpleIcon size={14} aria-hidden="true" className="emvb-site-item-icon" />
                    <RenameInput
                      name={cls.name}
                      label={`Rename ${cls.name}`}
                      onDone={(next) => rename(cls.id, next)}
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) rows.current.set(cls.id, el);
                      else rows.current.delete(cls.id);
                    }}
                    className="emvb-site-item-main"
                    aria-expanded={open}
                    title={`${cls.name} · .${token}`}
                    onClick={toggle}
                    onDoubleClick={() => setRenaming(cls.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "F2") return;
                      event.preventDefault();
                      setRenaming(cls.id);
                    }}
                  >
                    {open ? (
                      <CaretDownIcon
                        size={12}
                        aria-hidden="true"
                        className="emvb-site-item-caret"
                      />
                    ) : (
                      <CaretRightIcon
                        size={12}
                        aria-hidden="true"
                        className="emvb-site-item-caret"
                      />
                    )}
                    <TagSimpleIcon size={14} aria-hidden="true" className="emvb-site-item-icon" />
                    <span className="emvb-site-item-text">
                      <span className="emvb-site-item-name">{cls.name}</span>
                      <span className="emvb-mono emvb-site-token">.{token}</span>
                    </span>
                  </button>
                )}
                <span
                  className="emvb-site-usage"
                  title={`Used by ${count} ${count === 1 ? "element" : "elements"} on this page`}
                  data-emvb-usage=""
                >
                  {usageText(count)}
                </span>
                <RowMenu
                  label={`Actions for ${cls.name}`}
                  actions={[
                    {
                      label: open ? "Hide styles" : "Edit styles",
                      icon: PaintBrushIcon,
                      onSelect: toggle,
                    },
                    {
                      label: "Rename",
                      icon: PencilSimpleLineIcon,
                      afterClose: true,
                      onSelect: () => setRenaming(cls.id),
                    },
                    {
                      label: "Move up",
                      icon: ArrowUpIcon,
                      onSelect: () => {
                        const next = moveDesignClass(design, cls.id, -1);
                        if (next !== design) void onSave(next);
                      },
                    },
                    {
                      label: "Move down",
                      icon: ArrowDownIcon,
                      onSelect: () => {
                        const next = moveDesignClass(design, cls.id, 1);
                        if (next !== design) void onSave(next);
                      },
                    },
                    {
                      label: "Duplicate",
                      icon: CopySimpleIcon,
                      onSelect: () => {
                        const next = duplicateClass(design, cls.id);
                        if (next !== design) void onSave(next);
                      },
                    },
                    {
                      label: "Delete",
                      icon: TrashIcon,
                      danger: true,
                      onSelect: () => onAskDelete(cls.id, cls.name),
                    },
                  ]}
                />
              </div>
              {open && <ClassStyleEditor cls={cls} design={design} onSave={onSave} />}
            </li>
          );
        })}
      </ul>
      {nameError && (
        <p className="emvb-inline-error" role="alert" data-emvb-class-name-error="">
          {nameError}
        </p>
      )}
      {creating && (
        <CreateRow
          rowProps={{ "data-emvb-class-create": "" }}
          submitLabel="Create class"
          onCancel={() => {
            setCreating(false);
            setNameError(null);
          }}
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
