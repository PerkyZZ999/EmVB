import { Button, Input } from "@cloudflare/kumo";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import * as React from "react";
import { SAVED_SECTION_NAME_MAX } from "../../../core/index.ts";
import { matchesSearch } from "../../search.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { DeleteSavedSectionDialog } from "../SavedSectionDialogs.tsx";
import type { SavedSectionActions } from "../useSavedSections.ts";

/** Saved sections that match the Add panel's search. */
export const matchingSections = (saved: SavedSectionActions, query: string) =>
  saved.list.filter((item) => matchesSearch(query, item.name, "my saved section"));

const focusIn = (root: HTMLElement | null, selector: string) =>
  root?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: false });

/**
 * "My sections" in the Add panel (W-876): names only (D-060), filtered by the panel's search.
 * A name inserts a copy; rename edits in place; delete asks first, then focus goes to the next
 * section, the one before, the group heading when the list is empty, or the search field when
 * the search no longer matches any section.
 */
export function SavedSectionsGroup({
  saved,
  query,
}: {
  saved: SavedSectionActions;
  query: string;
}) {
  const groupRef = React.useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  /** Where focus goes once the delete dialog has closed. */
  const focusAfter = React.useRef<string | null>(null);
  /** A control to focus once the render that brings it back has committed. */
  const [focusNext, setFocusNext] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!focusNext) return;
    focusIn(groupRef.current, focusNext);
    setFocusNext(null);
  }, [focusNext]);
  const items = matchingSections(saved, query);
  if (query.trim() && items.length === 0) return null;
  const askedName = saved.list.find((item) => item.id === asking)?.name ?? null;

  const finishRename = async (id: string, value: string | null) => {
    const current = saved.list.find((item) => item.id === id);
    if (value === null || !current || value.trim() === current.name) {
      setRenaming(null);
      setRenameError(null);
      setFocusNext(`[data-emvb-saved-rename="${id}"]`);
      return;
    }
    const failed = await saved.rename(id, value);
    if (failed) {
      setRenameError(failed);
      return;
    }
    setRenaming(null);
    setRenameError(null);
    setFocusNext(`[data-emvb-saved-section="${id}"]`);
  };

  const confirmDelete = async () => {
    const id = asking;
    if (!id) return;
    const at = items.findIndex((item) => item.id === id);
    const next = items[at + 1] ?? items[at - 1];
    const panel = groupRef.current?.closest<HTMLElement>('[data-emvb-panel="add"]');
    const failed = await saved.remove(id);
    if (!failed && !next && query.trim()) {
      // The search matches nothing here now, so the group (and its dialog) goes away: put focus
      // back in the search field rather than on the page body.
      setAsking(null);
      const search = () => panel?.querySelector<HTMLElement>('input[type="search"]');
      requestAnimationFrame(() => setTimeout(() => search()?.focus(), 0));
      return;
    }
    if (failed) {
      setDeleteError(failed);
      focusAfter.current = `[data-emvb-saved-delete="${id}"]`;
    } else {
      setDeleteError(null);
      focusAfter.current = next
        ? `[data-emvb-saved-section="${next.id}"]`
        : "[data-emvb-saved-title]";
    }
    setAsking(null);
  };

  return (
    <div className="emvb-add-group" data-emvb-saved-sections="" ref={groupRef}>
      <h3 className="emvb-add-group-title" tabIndex={-1} data-emvb-saved-title="">
        My sections
      </h3>
      {!saved.loaded ? (
        <p className="emvb-helper" role="status">
          Loading My sections…
        </p>
      ) : saved.loadError ? (
        <div className="emvb-saved-error">
          <p className="emvb-inline-error" role="alert">
            {saved.loadError}
          </p>
          <Button type="button" variant="secondary" className={BUTTON} onClick={saved.refresh}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="emvb-helper" data-emvb-saved-empty="">
          Save an element as a section from its ··· menu in Layers, or with Save as section in the
          command palette.
        </p>
      ) : (
        <ul className="emvb-saved-list" aria-label="My sections">
          {items.map((item) => (
            <li key={item.id} className="emvb-saved-row">
              {renaming === item.id ? (
                <RenameField
                  initial={item.name}
                  error={renameError}
                  onDone={(value) => void finishRename(item.id, value)}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="emvb-saved-name"
                    data-emvb-saved-section={item.id}
                    disabled={item.damaged}
                    title={
                      item.damaged ? "This saved section can't be read" : `Insert ${item.name}`
                    }
                    onClick={() => void saved.insert(item.id)}
                  >
                    {item.name}
                    {item.damaged && <span className="emvb-helper"> (can&apos;t be read)</span>}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    shape="square"
                    size="sm"
                    className="emvb-icon-btn"
                    aria-label={`Rename ${item.name}`}
                    title="Rename"
                    data-emvb-saved-rename={item.id}
                    disabled={item.damaged}
                    icon={<PencilSimpleIcon aria-hidden="true" />}
                    onClick={() => {
                      setRenameError(null);
                      setRenaming(item.id);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    shape="square"
                    size="sm"
                    className="emvb-icon-btn"
                    aria-label={`Delete ${item.name}`}
                    title="Delete"
                    data-emvb-saved-delete={item.id}
                    icon={<TrashIcon aria-hidden="true" />}
                    onClick={() => setAsking(item.id)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleteError && (
        <p className="emvb-inline-error" role="alert">
          {deleteError}
        </p>
      )}
      <DeleteSavedSectionDialog
        name={askedName}
        onOpenChange={(open) => {
          if (open) return;
          // Cancel or Escape: back to the row's Delete button.
          if (asking && !focusAfter.current) {
            focusAfter.current = `[data-emvb-saved-delete="${asking}"]`;
          }
          setAsking(null);
        }}
        onDelete={() => void confirmDelete()}
        onClosed={() => {
          const target = focusAfter.current;
          focusAfter.current = null;
          if (target) focusIn(groupRef.current, target);
        }}
      />
    </div>
  );
}

/** The inline name field: Enter or leaving saves, Escape cancels. */
function RenameField({
  initial,
  error,
  onDone,
}: {
  initial: string;
  error: string | null;
  onDone: (value: string | null) => void;
}) {
  const [text, setText] = React.useState(initial);
  const done = React.useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
    // A refused name stays open for another try.
    requestAnimationFrame(() => {
      done.current = false;
    });
  };
  return (
    <Input
      aria-label="Section name"
      className={`${FIELD} emvb-saved-rename`}
      data-emvb-saved-rename-field=""
      autoFocus
      maxLength={SAVED_SECTION_NAME_MAX}
      value={text}
      error={error ?? undefined}
      aria-invalid={error ? true : undefined}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => finish(text)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter") {
          event.preventDefault();
          finish(text);
        }
        if (event.key === "Escape") finish(null);
      }}
    />
  );
}
