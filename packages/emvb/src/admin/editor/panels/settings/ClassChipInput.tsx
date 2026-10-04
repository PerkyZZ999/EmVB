import { MapPinIcon, PlusIcon, TagSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  addClassId,
  duplicateClass,
  hasStateStyles,
  moveClassId,
  removeClassId,
  renameClass,
  replaceClassId,
  type DesignSystem,
} from "../../../../core/index.ts";
import { uniqueId } from "../site-list.tsx";
import { ClassChip, stopEditorShortcuts } from "./ClassChip.tsx";
import {
  appliedByName,
  classOptions,
  MAX_ELEMENT_CLASSES,
  MAX_SITE_CLASSES,
  type ClassOption,
} from "./class-suggest.ts";

type Props = {
  applied: readonly string[] | undefined;
  design: DesignSystem;
  /** The applied class the Style sections edit, or null for this element's local styles. */
  editing: string | null;
  onEdit: (classId: string | null) => void;
  onChange: (classes: string[] | undefined) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
};

const optionKey = (option: ClassOption) =>
  option.kind === "class" ? option.cls.id : `create-${option.name}`;

/**
 * The Style tab's Classes field (W-087): a Local chip, one chip per
 * applied class in cascade order, and a combobox that suggests classes or creates one.
 */
export function ClassChipInput({
  applied,
  design,
  editing,
  onEdit,
  onChange,
  onDesignChange,
}: Props) {
  const ids = applied ?? [];
  const catalog = design.classes ?? [];
  const byId = new Map(catalog.map((cls) => [cls.id, cls]));
  const baseId = React.useId();
  const listId = `${baseId}-list`;
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [focusAt, setFocusAt] = React.useState<{ index: number } | null>(null);
  const chipRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const options = classOptions(catalog, ids, query);
  const full = ids.length >= MAX_ELEMENT_CLASSES;
  const current = options[Math.min(active, options.length - 1)];

  React.useEffect(() => {
    if (!focusAt) return;
    const target = chipRefs.current[focusAt.index] ?? inputRef.current;
    target?.focus();
    setFocusAt(null);
  }, [focusAt]);

  const commit = (next: string[]) => onChange(next.length === 0 ? undefined : next);
  /** Chip positions: 0 is Local, 1…n the classes, n + 1 the text input. */
  const focusChip = (index: number) => setFocusAt({ index: Math.max(0, index) });

  const reset = () => {
    setQuery("");
    setActive(0);
    setError(null);
  };

  const create = async (name: string) => {
    if (catalog.length >= MAX_SITE_CLASSES) {
      setError(`This site already has ${MAX_SITE_CLASSES} classes, the most allowed.`);
      return;
    }
    const id = uniqueId(
      name,
      "class",
      catalog.map((cls) => cls.id),
    );
    try {
      await onDesignChange({ ...design, classes: [...catalog, { id, name, style: {} }] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the class. Try again.");
      return;
    }
    commit(addClassId(ids, id));
    reset();
  };

  const choose = (option: ClassOption | undefined) => {
    if (!option || full) return;
    if (option.kind === "create") {
      void create(option.name);
      return;
    }
    commit(addClassId(ids, option.cls.id));
    reset();
  };

  const saveDesign = async (next: DesignSystem) => {
    setError(null);
    try {
      await onDesignChange(next);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the class. Try again.");
      return false;
    }
  };

  const rename = (id: string, name: string) => void saveDesign(renameClass(design, id, name));

  /** Copies the class and swaps the copy in on this element only, ready to edit. */
  const duplicate = async (id: string) => {
    const next = duplicateClass(design, id);
    const copy = next.classes?.at(-1);
    if (next === design || !copy || !(await saveDesign(next))) return;
    commit(replaceClassId(ids, id, copy.id));
    onEdit(copy.id);
  };

  const reorder = (index: number, delta: -1 | 1) => commit(moveClassId(ids, index, delta));

  const remove = (id: string, focusIndex: number) => {
    commit(removeClassId(ids, id));
    focusChip(focusIndex);
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    stopEditorShortcuts(event);
    const atStart =
      event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(open && options.length > 0 ? (active + step + options.length) % options.length : 0);
      setOpen(true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (query.trim() && appliedByName(catalog, ids, query)) {
        setError(`"${query.trim()}" is already on this element.`);
        return;
      }
      choose(current);
    } else if (event.key === "Escape") {
      if (open) setOpen(false);
      else reset();
    } else if (event.key === "Backspace" && query === "" && ids.length > 0) {
      event.preventDefault();
      commit(ids.slice(0, -1));
    } else if (event.key === "ArrowLeft" && atStart) {
      event.preventDefault();
      focusChip(ids.length);
    }
  };

  const onChipKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    stopEditorShortcuts(event);
    const id = ids[index - 1];
    const move = event.altKey && id !== undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      if (move) {
        const next = moveClassId(ids, index - 1, delta);
        commit(next);
        focusChip(next.indexOf(id) + 1);
      } else {
        focusChip(index + delta);
      }
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusChip(event.key === "Home" ? 0 : ids.length + 1);
    } else if ((event.key === "Backspace" || event.key === "Delete") && id !== undefined) {
      event.preventDefault();
      remove(id, event.key === "Backspace" ? index - 1 : index);
    }
  };

  return (
    <div className="emvb-class-field" data-emvb-class-picker="">
      <label className="emvb-field-label" htmlFor={`${baseId}-input`}>
        Classes
      </label>
      <div className="emvb-chip-anchor">
        <div
          className="emvb-chip-box"
          data-emvb-chip-box=""
          role="group"
          aria-label="Classes on this element"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              inputRef.current?.focus();
            }
          }}
        >
          <span
            className="emvb-chip emvb-chip-local"
            data-emvb-chip-local=""
            data-active={editing === null}
          >
            <button
              type="button"
              ref={(el) => {
                chipRefs.current[0] = el;
              }}
              className="emvb-chip-main"
              aria-pressed={editing === null}
              title="Local styles: this element only"
              onClick={() => onEdit(null)}
              onKeyDown={(event) => onChipKey(event, 0)}
            >
              <MapPinIcon size={12} weight="fill" aria-hidden="true" />
              <span className="emvb-chip-label">Local</span>
            </button>
          </span>
          {ids.map((id, index) => (
            <ClassChip
              key={id}
              id={id}
              name={byId.get(id)?.name ?? id}
              active={editing === id}
              hasStates={hasStateStyles(byId.get(id))}
              first={index === 0}
              last={index === ids.length - 1}
              buttonRef={(el) => {
                chipRefs.current[index + 1] = el;
              }}
              onKeyDown={(event) => onChipKey(event, index + 1)}
              onEdit={() => onEdit(id)}
              onRename={(name) => rename(id, name)}
              onDuplicate={() => void duplicate(id)}
              onMove={(delta) => reorder(index, delta)}
              onRemove={() => remove(id, index)}
            />
          ))}
          <input
            ref={inputRef}
            id={`${baseId}-input`}
            className="emvb-chip-text"
            data-emvb-class-input=""
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={
              open && current ? `${baseId}-opt-${optionKey(current)}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            disabled={full}
            placeholder={full ? "" : "Add class…"}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setError(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onInputKey}
          />
        </div>
        {open && !full && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Class suggestions"
            className="emvb-chip-listbox"
            data-emvb-class-options=""
          >
            {options.length === 0 && (
              <li role="presentation" className="emvb-chip-option-hint">
                {catalog.length === 0
                  ? "No classes yet. Type a name to create one."
                  : query.trim()
                    ? "That class is already on this element."
                    : "Every class is already on this element."}
              </li>
            )}
            {options.map((option, index) => (
              <li
                key={optionKey(option)}
                id={`${baseId}-opt-${optionKey(option)}`}
                role="option"
                aria-selected={option === current}
                className="emvb-chip-option"
                data-emvb-class-option={option.kind === "class" ? option.cls.id : "create"}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.kind === "class" ? (
                  <>
                    <TagSimpleIcon size={14} aria-hidden="true" />
                    <span className="emvb-chip-option-name">{option.cls.name}</span>
                    <span className="emvb-mono emvb-chip-option-token">
                      .emvb-k-{option.cls.id}
                    </span>
                  </>
                ) : (
                  <>
                    <PlusIcon size={14} aria-hidden="true" />
                    <span className="emvb-chip-option-name">
                      Create class &quot;{option.name}&quot;
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing !== null && (
        <p className="emvb-helper emvb-class-scope" data-emvb-class-scope="">
          Editing class &quot;{byId.get(editing)?.name ?? editing}&quot;. Changes apply to every
          element that uses it.{" "}
          <button type="button" className="emvb-link-button" onClick={() => onEdit(null)}>
            Back to local styles
          </button>
        </p>
      )}
      {error && (
        <p className="emvb-inline-error" role="alert" data-emvb-class-error="">
          {error}
        </p>
      )}
      <p className="emvb-helper" data-emvb-cascade-caption="">
        {full
          ? `${MAX_ELEMENT_CLASSES} classes is the most one element can have.`
          : "When two classes set the same property, the one lower in Site styles wins. Local styles still win."}
      </p>
    </div>
  );
}
