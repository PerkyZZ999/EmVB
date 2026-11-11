import { Button, Checkbox, Dialog, Loader } from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { publishMany, restoreMany, trashMany, type BulkResult } from "../bulk-api.ts";
import { DialogCloseButton } from "../editor/DialogCloseButton.tsx";
import { BUTTON, SOLID_DESTRUCTIVE, UI_CSS } from "../ui.ts";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** W-978: which rows are ticked, kept to the rows that still exist. */
export function useSelection(ids: readonly string[]) {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const key = ids.join(" ");
  React.useEffect(() => {
    setSelected((current) => {
      const kept = new Set([...current].filter((id) => ids.includes(id)));
      return kept.size === current.size ? current : kept;
    });
    // `key` stands for `ids`, which is a new array on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const setAll = (shown: readonly string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of shown)
        if (on) next.add(id);
        else next.delete(id);
      return next;
    });
  return { selected, toggle, setAll, clear: () => setSelected(new Set()) };
}

/** The header cell that ticks every row shown. */
export function SelectAll({
  shown,
  selection,
  noun,
}: {
  shown: readonly string[];
  selection: ReturnType<typeof useSelection>;
  noun: string;
}) {
  const ticked = shown.filter((id) => selection.selected.has(id)).length;
  return (
    <Checkbox
      aria-label={`Select all ${noun} shown`}
      checked={shown.length > 0 && ticked === shown.length}
      indeterminate={ticked > 0 && ticked < shown.length}
      onCheckedChange={(on: boolean) => selection.setAll(shown, on)}
      data-emvb-select-all=""
    />
  );
}

/** A row's tick box, named after the row. */
export function SelectRow({
  id,
  title,
  selection,
}: {
  id: string;
  title: string;
  selection: ReturnType<typeof useSelection>;
}) {
  return (
    <Checkbox
      aria-label={`Select ${title}`}
      checked={selection.selected.has(id)}
      onCheckedChange={(on: boolean) => selection.toggle(id, on)}
      data-emvb-select-row={id}
    />
  );
}

type BulkState =
  | { kind: "idle" }
  | { kind: "busy"; what: "publish" | "delete" | "restore" }
  | { kind: "done"; text: string; restorable?: string[]; error?: boolean };

/**
 * W-978: Publish, Delete (to EmDash's trash, with Restore) and, on Pages, Export for the ticked
 * rows. Each item is its own request; one that fails is named and the rest go on.
 */
export function BulkBar({
  fetcher,
  collection,
  selection,
  titles,
  noun,
  nouns,
  onChanged,
  onExport,
  deleteNote,
  usage,
}: {
  fetcher: Fetcher;
  collection: string;
  selection: ReturnType<typeof useSelection>;
  /** Titles by id, for the confirm and the result. */
  titles: ReadonlyMap<string, string>;
  noun: string;
  nouns: string;
  /** Reloads the list after a change. */
  onChanged: () => void;
  onExport?: (ids: string[]) => void;
  /** What else the delete confirm should say. */
  deleteNote?: string;
  /** W-980: where the chosen items are still used, by id, for the delete confirm. */
  usage?: (ids: string[]) => Promise<Map<string, string[]>>;
}) {
  const [inUse, setInUse] = React.useState<Map<string, string[]> | null>(null);
  const [state, setState] = React.useState<BulkState>({ kind: "idle" });
  const [confirming, setConfirming] = React.useState(false);
  const ids = [...selection.selected];
  const busy = state.kind === "busy";
  const failures = (result: BulkResult) =>
    result.failed.map((f) => `${titles.get(f.id) ?? f.id} (${f.message})`).join("; ");

  const run = async (what: "publish" | "delete") => {
    setConfirming(false);
    setState({ kind: "busy", what });
    const result = await (what === "publish" ? publishMany : trashMany)(fetcher, collection, ids);
    const verb = what === "publish" ? "Published" : "Moved to the trash:";
    const parts = [
      result.done.length > 0 ? `${verb} ${plural(result.done.length, noun, nouns)}.` : "",
      result.failed.length > 0
        ? `Not ${what === "publish" ? "published" : "deleted"}: ${failures(result)}.`
        : "",
    ].filter(Boolean);
    setState({
      kind: "done",
      text: parts.join(" "),
      ...(what === "delete" && result.done.length > 0 ? { restorable: result.done } : {}),
      ...(result.failed.length > 0 ? { error: true } : {}),
    });
    selection.clear();
    if (result.done.length > 0) onChanged();
  };
  const restore = async (restorable: string[]) => {
    setState({ kind: "busy", what: "restore" });
    const result = await restoreMany(fetcher, collection, restorable);
    setState({
      kind: "done",
      text: [
        result.done.length > 0 ? `Restored ${plural(result.done.length, noun, nouns)}.` : "",
        result.failed.length > 0 ? `Not restored: ${failures(result)}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      ...(result.failed.length > 0 ? { error: true } : {}),
    });
    if (result.done.length > 0) onChanged();
  };

  if (ids.length === 0 && state.kind === "idle") return null;
  return (
    <div
      className="emvb-bulk-bar"
      role="region"
      aria-label={`Selected ${nouns}`}
      data-emvb-bulk-bar=""
    >
      {ids.length > 0 && (
        <>
          <span className="emvb-bulk-count" aria-live="polite">
            {plural(ids.length, noun, nouns)} selected
          </span>
          <Button
            variant="secondary"
            className={BUTTON}
            icon={
              state.kind === "busy" && state.what === "publish" ? (
                <Loader size={14} />
              ) : (
                <UploadSimpleIcon aria-hidden="true" />
              )
            }
            aria-disabled={busy}
            onClick={() => !busy && void run("publish")}
            data-emvb-bulk="publish"
          >
            Publish
          </Button>
          {onExport && (
            <Button
              variant="secondary"
              className={BUTTON}
              icon={<DownloadSimpleIcon aria-hidden="true" />}
              aria-disabled={busy}
              onClick={() => !busy && onExport(ids)}
              data-emvb-bulk="export"
            >
              Export
            </Button>
          )}
          <Button
            variant="secondary"
            className={BUTTON}
            icon={
              state.kind === "busy" && state.what === "delete" ? (
                <Loader size={14} />
              ) : (
                <TrashIcon aria-hidden="true" />
              )
            }
            aria-disabled={busy}
            onClick={() => {
              if (busy) return;
              setInUse(null);
              setConfirming(true);
              usage?.(ids).then(setInUse, () => setInUse(new Map()));
            }}
            data-emvb-bulk="delete"
          >
            Delete
          </Button>
          <Button variant="ghost" className={BUTTON} onClick={selection.clear} aria-disabled={busy}>
            Clear selection
          </Button>
        </>
      )}
      {state.kind !== "idle" && (
        <p
          className={
            state.kind === "done" && state.error ? "emvb-helper emvb-danger-text" : "emvb-helper"
          }
          role="status"
          data-emvb-bulk-status=""
        >
          {state.kind === "busy"
            ? state.what === "publish"
              ? "Publishing…"
              : state.what === "delete"
                ? "Moving to the trash…"
                : "Restoring…"
            : state.text}
          {state.kind === "done" && state.restorable && (
            <Button
              variant="ghost"
              className={BUTTON}
              icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
              onClick={() => state.restorable && void restore(state.restorable)}
              data-emvb-bulk="restore"
            >
              Restore
            </Button>
          )}
        </p>
      )}
      <Dialog.Root open={confirming} onOpenChange={setConfirming}>
        <Dialog size="base" className="p-6">
          <style>{UI_CSS}</style>
          <div className="emvb-dialog" data-emvb-dialog="bulk-delete">
            <Dialog.Title>Delete {plural(ids.length, noun, nouns)}?</Dialog.Title>
            <Dialog.Description>
              {ids.length <= 5
                ? `${ids.map((id) => titles.get(id) ?? id).join(", ")} ${ids.length === 1 ? "goes" : "go"} to EmDash's trash and ${ids.length === 1 ? "leaves" : "leave"} the site.`
                : `They go to EmDash's trash and leave the site.`}{" "}
              You can restore them right after, or later from the trash.
            </Dialog.Description>
            {inUse && inUse.size > 0 && (
              <ul className="emvb-helper emvb-danger-text" data-emvb-bulk-in-use="">
                {[...inUse].map(([id, where]) => (
                  <li key={id}>
                    {titles.get(id) ?? id} is used on {where.slice(0, 3).join(", ")}
                    {where.length > 3 ? ` and ${where.length - 3} more` : ""}; it will show nothing
                    there.
                  </li>
                ))}
              </ul>
            )}
            {deleteNote && <p className="emvb-helper">{deleteNote}</p>}
            <div className="emvb-dialog-actions">
              <DialogCloseButton>Cancel</DialogCloseButton>
              <Button
                variant="destructive"
                className={BUTTON}
                style={SOLID_DESTRUCTIVE}
                onClick={() => void run("delete")}
                data-emvb-bulk-confirm=""
              >
                Delete {plural(ids.length, noun, nouns)}
              </Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
