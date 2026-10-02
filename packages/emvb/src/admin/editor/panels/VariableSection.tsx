import { Input } from "@cloudflare/kumo";
import {
  CaretDownIcon,
  CaretRightIcon,
  CopySimpleIcon,
  PaletteIcon,
  PencilSimpleLineIcon,
  RulerIcon,
  TextAaIcon,
  TextTIcon,
  TrashIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import * as React from "react";
import {
  duplicateVariable,
  findVariableUsages,
  findVariableUsagesInDesign,
  renameVariable,
  type DesignSystem,
  type Layout,
  type VariableKind,
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
import {
  isLengthKind,
  lengthPx,
  parseValue,
  pickerHex,
  valueText,
  type Length,
} from "./variable-values.ts";

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

const EMPTY: Record<VariableKind, { icon: Icon; text: string }> = {
  color: { icon: PaletteIcon, text: "No colors yet. Add one to reuse it in any color field." },
  font: { icon: TextTIcon, text: "No fonts yet. Add a font stack to reuse it." },
  fontSize: { icon: TextAaIcon, text: "No font sizes yet. Add one to build a type scale." },
  spacing: { icon: RulerIcon, text: "No spacing yet. Add one to keep gaps consistent." },
};

/** Previews never grow the row: type samples stop at 24 px, spacing bars at 64 px. */
const MAX_TYPE_PREVIEW = 24;
const MAX_BAR = 64;

type Item = { id: string; name: string; value: string | Length };

function InlineError({ children }: { children: string }) {
  return (
    <p className="emvb-inline-error" role="alert">
      <WarningCircleIcon size={16} aria-hidden="true" />
      {children}
    </p>
  );
}

/** The kind's visual sample in the row: a swatch, "Ag" in the font, "Aa" at the size. */
function Preview({ kind, value }: { kind: VariableKind; value: string | Length }) {
  if (kind === "color" && typeof value === "string") {
    return (
      <span
        className="emvb-site-preview emvb-site-preview-color"
        style={{ background: value }}
        aria-hidden="true"
        data-emvb-var-swatch=""
      />
    );
  }
  if (kind === "font" && typeof value === "string") {
    return (
      <span
        className="emvb-site-preview"
        style={{ fontFamily: value }}
        aria-hidden="true"
        data-emvb-var-preview=""
      >
        Ag
      </span>
    );
  }
  if (kind === "fontSize" && typeof value === "object") {
    const size = Math.min(lengthPx(value), MAX_TYPE_PREVIEW);
    return (
      <span
        className="emvb-site-preview"
        style={{ fontSize: `${size}px` }}
        aria-hidden="true"
        data-emvb-var-preview=""
      >
        Aa
      </span>
    );
  }
  return (
    <span className="emvb-site-preview emvb-site-preview-icon" aria-hidden="true">
      <RulerIcon size={14} />
    </span>
  );
}

/** The value field under an open row. Enter or blur saves a valid change once; Escape reverts. */
function ValueEditor({
  kind,
  item,
  token,
  onCommit,
}: {
  kind: VariableKind;
  item: Item;
  token: string;
  onCommit: (value: string | Length) => void;
}) {
  const current = valueText(item.value);
  const [text, setText] = React.useState(current);
  const [error, setError] = React.useState<string | null>(null);
  const committed = React.useRef(current);
  const picker = React.useRef<HTMLInputElement | null>(null);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === committed.current) {
      setError(null);
      return;
    }
    const parsed = parseValue(kind, trimmed);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    committed.current = trimmed;
    onCommit(parsed.value);
  };

  // The picker saves on its native change event (the dialog closed), not on every drag step.
  React.useEffect(() => {
    const el = picker.current;
    if (!el) return;
    const onChange = () => {
      setText(el.value);
      commit(el.value);
    };
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  });

  return (
    <div className="emvb-site-item-body" data-emvb-var-value="">
      <div className="emvb-site-value-row">
        {kind === "color" && (
          <input
            ref={picker}
            type="color"
            className="emvb-site-picker"
            aria-label={`Pick ${item.name}`}
            value={pickerHex(error ? current : text)}
            onChange={(event) => setText(event.target.value)}
          />
        )}
        <Input
          aria-label={`Value of ${item.name}`}
          className={`${FIELD} emvb-site-value-input`}
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError(null);
          }}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(event.currentTarget.value);
            else if (event.key === "Escape") {
              event.stopPropagation();
              setText(committed.current);
              setError(null);
            }
          }}
        />
      </div>
      {error && <InlineError>{error}</InlineError>}
      {kind === "font" && typeof item.value === "string" && (
        <p className="emvb-site-font-sample" style={{ fontFamily: item.value }}>
          The quick brown fox jumps · 0123
        </p>
      )}
      <p className="emvb-mono emvb-site-token">var({token})</p>
    </div>
  );
}

export function VariableSection({
  title,
  kind,
  design,
  layout,
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
  const items: readonly Item[] = design.variables[listKey] ?? [];
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [name, setName] = React.useState("");
  const [value, setValue] = React.useState(NEW_VALUE[kind]);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const rows = React.useRef(new Map<string, HTMLButtonElement>());

  const saveValue = (id: string, next: string | Length) =>
    void onSave({
      ...design,
      variables: {
        ...design.variables,
        [listKey]: items.map((entry) =>
          entry.id === id ? Object.assign({}, entry, { value: next }) : entry,
        ),
      },
    });

  const q = filter.trim().toLowerCase();
  const visible = q
    ? items.filter((item) => matches(q, item.name, item.id, VAR_TOKEN[kind](item.id)))
    : items;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsed = parseValue(kind, value);
    if (!parsed.ok) {
      setCreateError(parsed.error);
      return;
    }
    const id = uniqueId(
      trimmed,
      kind,
      items.map((item) => item.id),
    );
    const entry = { id, name: trimmed, value: parsed.value };
    await onSave({ ...design, variables: { ...design.variables, [listKey]: [...items, entry] } });
    setCreating(false);
    setName("");
    setValue(NEW_VALUE[kind]);
  };

  const rename = (id: string, next: string | null) => {
    setRenaming(null);
    requestAnimationFrame(() => rows.current.get(id)?.focus());
    if (next) void onSave(renameVariable(design, id, kind, next));
  };

  const copy = (id: string, token: string) => {
    void navigator.clipboard?.writeText(`var(${token})`).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied((now) => (now === id ? null : now)), 1500);
      },
      () => undefined,
    );
  };

  const EmptyIcon = EMPTY[kind].icon;
  return (
    <section className="emvb-site-section" data-emvb-var-kind={kind}>
      <SectionHead
        title={title}
        count={items.length}
        countProps={{ "data-emvb-var-count": "" }}
        onNew={() => setCreating(true)}
      />
      {items.length > 3 && (
        <SiteSearch
          label={`Search ${title.toLowerCase()}`}
          value={filter}
          onChange={setFilter}
          data-emvb-var-filter={kind}
        />
      )}
      {items.length === 0 && !creating && (
        <p className="emvb-site-empty" data-emvb-var-empty={kind}>
          <EmptyIcon size={16} aria-hidden="true" />
          {EMPTY[kind].text}
        </p>
      )}
      {items.length > 0 && visible.length === 0 && (
        <p className="emvb-helper" data-emvb-var-nomatch="">
          No {title.toLowerCase()} match "{filter.trim()}".
        </p>
      )}
      <ul className="emvb-site-items">
        {visible.map((item) => {
          const token = VAR_TOKEN[kind](item.id);
          const isOpen = open === item.id;
          const toggle = () => setOpen(isOpen ? null : item.id);
          const onPage = layout ? findVariableUsages(layout, item.id, kind).length : 0;
          const inClasses = new Set(
            findVariableUsagesInDesign(design, item.id, kind).map((u) => u.classId),
          ).size;
          const text = valueText(item.value);
          return (
            <li
              key={item.id}
              className="emvb-site-item"
              data-emvb-var-id={item.id}
              data-open={isOpen || undefined}
            >
              <div className="emvb-site-item-row">
                {renaming === item.id ? (
                  <span className="emvb-site-item-main" data-renaming="">
                    <Preview kind={kind} value={item.value} />
                    <RenameInput
                      name={item.name}
                      label={`Rename ${item.name}`}
                      onDone={(next) => rename(item.id, next)}
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) rows.current.set(item.id, el);
                      else rows.current.delete(item.id);
                    }}
                    className="emvb-site-item-main"
                    aria-expanded={isOpen}
                    title={`${item.name} · var(${token})`}
                    onClick={toggle}
                    onDoubleClick={() => setRenaming(item.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "F2") return;
                      event.preventDefault();
                      setRenaming(item.id);
                    }}
                  >
                    {isOpen ? (
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
                    <Preview kind={kind} value={item.value} />
                    <span className="emvb-site-item-text">
                      <span className="emvb-site-item-name">{item.name}</span>
                      <span className="emvb-mono emvb-site-token" data-emvb-var-text="">
                        {kind === "spacing" && typeof item.value === "object" && (
                          <span
                            className="emvb-site-bar"
                            style={{
                              width: `${Math.max(2, Math.min(lengthPx(item.value), MAX_BAR))}px`,
                            }}
                            aria-hidden="true"
                            data-emvb-var-bar=""
                          />
                        )}
                        {text}
                      </span>
                    </span>
                  </button>
                )}
                <span
                  className="emvb-site-usage"
                  title={`Used ${onPage} ${onPage === 1 ? "time" : "times"} on this page${
                    inClasses ? ` and in ${inClasses} ${inClasses === 1 ? "class" : "classes"}` : ""
                  }`}
                  data-emvb-usage=""
                  aria-live="polite"
                >
                  {copied === item.id ? "Copied" : `${onPage} on page`}
                </span>
                <RowMenu
                  label={`Actions for ${item.name}`}
                  actions={[
                    {
                      label: isOpen ? "Hide value" : "Edit value",
                      icon: PencilSimpleLineIcon,
                      onSelect: toggle,
                    },
                    {
                      label: "Rename",
                      icon: TextTIcon,
                      afterClose: true,
                      onSelect: () => setRenaming(item.id),
                    },
                    {
                      label: "Duplicate",
                      icon: CopySimpleIcon,
                      onSelect: () => void onSave(duplicateVariable(design, item.id, kind)),
                    },
                    {
                      label: "Copy CSS variable",
                      icon: CopySimpleIcon,
                      onSelect: () => copy(item.id, token),
                    },
                    {
                      label: "Delete",
                      icon: TrashIcon,
                      danger: true,
                      onSelect: () => onAskDelete(item.id, item.name),
                    },
                  ]}
                />
              </div>
              {isOpen && (
                <ValueEditor
                  key={text}
                  kind={kind}
                  item={item}
                  token={token}
                  onCommit={(next) => saveValue(item.id, next)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {creating && (
        <CreateRow
          rowProps={{ "data-emvb-var-create": kind }}
          submitLabel="Create"
          onCancel={() => {
            setCreating(false);
            setCreateError(null);
          }}
          onCreate={() => void create()}
        >
          <Input
            label="Name"
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={isLengthKind(kind) ? "Value (px, rem, em or %)" : "Value"}
            className={FIELD}
            value={value}
            aria-invalid={createError ? true : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setCreateError(null);
            }}
          />
          {createError && <InlineError>{createError}</InlineError>}
        </CreateRow>
      )}
    </section>
  );
}
