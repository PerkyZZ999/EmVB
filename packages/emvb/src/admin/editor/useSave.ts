import * as React from "react";
import { byteLength, MAX_LAYOUT_BYTES, nodeIdAtPath, type Layout } from "../../core/index.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { publishPage, savePage } from "../content-api.ts";
import { publishThemePart, saveThemePart } from "../theme-api.ts";
import type { EditorAction, EditorState } from "./store.ts";
import { loadEntry } from "./useEditorData.ts";

export type SaveStatus =
  | { kind: "idle" | "saving" | "saved" }
  | { kind: "error"; message: string; retry: boolean };

const FIX_AND_SAVE = "Couldn't save. Fix the highlighted setting and save again.";
const OFFLINE = "Couldn't save. Check your connection and try again.";

export const tooLargeMessage = (bytes: number) =>
  `Couldn't save. This page is ${Math.ceil(bytes / 1024)} KB and the limit is ${
    MAX_LAYOUT_BYTES / 1024
  } KB. Remove some content and save again.`;

export const slugTakenMessage = (slug: string) =>
  `A page with the slug "${slug}" already exists. Choose a different slug.`;

/** What the editor shows and does after a failed save. */
export type SaveFailure = {
  status: SaveStatus;
  /** The inline error for the Slug field. */
  slugError?: string;
  /** Open the "changed somewhere else" dialog. */
  conflict?: true;
  /** Move the selection: to the rejected element, or `null` to show page settings. */
  select?: string | null;
  /** The server's rejection, shown in the element panel. */
  rejection?: string;
};

const fixAndSave: SaveStatus = { kind: "error", message: FIX_AND_SAVE, retry: false };
const offline: SaveStatus = { kind: "error", message: OFFLINE, retry: true };

export function saveFailure(
  error: unknown,
  page: { slug: string; layout: Layout | null },
): SaveFailure {
  if (!(error instanceof ApiError) || error.status >= 500) return { status: offline };
  if (error.status === 409 && error.code === "SLUG_CONFLICT") {
    return { status: fixAndSave, slugError: slugTakenMessage(page.slug), select: null };
  }
  if (error.status === 409) {
    const message = "Couldn't save. This page was changed somewhere else.";
    return { status: { kind: "error", message, retry: false }, conflict: true };
  }
  if (error.status === 400 || error.status === 422) {
    const path = /\broot(?:\.children\[\d+\])*/.exec(error.message)?.[0];
    const id = path && page.layout ? nodeIdAtPath(page.layout, path) : null;
    return { status: fixAndSave, rejection: error.message, ...(id ? { select: id } : {}) };
  }
  return { status: { kind: "error", message: `Couldn't save. ${error.message}`, retry: false } };
}

export function publishFailureMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "Couldn't publish. Your role can't publish pages.";
  }
  if (error instanceof ApiError && error.status === 409) {
    return "Couldn't publish. This page was changed somewhere else.";
  }
  return "Couldn't publish. Check your connection and try again.";
}

/**
 * Save, publish and their failure modes (R-006, IA "Save and publish"). Saves send `_rev`, so a
 * concurrent change surfaces as a conflict instead of being overwritten.
 */
export function useSave(
  fetcher: Fetcher,
  state: EditorState,
  dispatch: React.Dispatch<EditorAction>,
  collection: string = PAGES_COLLECTION,
) {
  const latest = React.useRef(state);
  latest.current = state;
  const [status, setStatus] = React.useState<SaveStatus>({ kind: "idle" });
  const [conflict, setConflict] = React.useState(false);
  const [slugError, setSlugError] = React.useState<string | null>(null);
  const [rejection, setRejection] = React.useState<string | null>(null);

  const write = React.useCallback(
    async (rev: string | null): Promise<string | null> => {
      const current = latest.current;
      const bytes = current.page.layout ? byteLength(current.page.layout) : 0;
      if (bytes > MAX_LAYOUT_BYTES) {
        setStatus({ kind: "error", message: tooLargeMessage(bytes), retry: false });
        return null;
      }
      setStatus({ kind: "saving" });
      setSlugError(null);
      setRejection(null);
      try {
        const next =
          collection === THEME_PARTS_COLLECTION
            ? await saveThemePart(
                fetcher,
                current.id,
                {
                  title: current.page.title,
                  slug: current.page.slug,
                  partType: current.page.partType ?? "header",
                  conditions: current.page.conditions ?? {
                    schemaVersion: 1,
                    rules: [],
                  },
                  triggers: current.page.triggers ?? {
                    schemaVersion: 1,
                    open: [{ type: "page_load" }],
                    advanced: {},
                  },
                  layout: current.page.layout,
                },
                rev,
              )
            : await savePage(fetcher, current.id, current.page, rev);
        dispatch({ type: "saved", rev: next, version: current.version });
        setStatus({ kind: "saved" });
        return next;
      } catch (error) {
        const failure = saveFailure(error, current.page);
        if (failure.slugError) setSlugError(failure.slugError);
        if (failure.select !== undefined) dispatch({ type: "select", id: failure.select });
        if (failure.conflict) setConflict(true);
        if (failure.rejection !== undefined) setRejection(failure.rejection);
        setStatus(failure.status);
        return null;
      }
    },
    [fetcher, dispatch, collection],
  );

  const save = React.useCallback(() => write(latest.current.rev), [write]);

  /** Conflict → Overwrite: take the stored revision and save over it. */
  const overwrite = React.useCallback(async () => {
    setConflict(false);
    try {
      const stored = await loadEntry(fetcher, latest.current.id, collection);
      await write(stored.rev);
    } catch {
      setStatus({ kind: "error", message: OFFLINE, retry: true });
    }
  }, [fetcher, write, collection]);

  const publish = React.useCallback(async (): Promise<boolean> => {
    let rev: string | null = latest.current.rev;
    if (latest.current.version !== latest.current.savedVersion) {
      rev = await write(rev);
      if (!rev) return false;
    }
    try {
      const result =
        collection === THEME_PARTS_COLLECTION
          ? await publishThemePart(fetcher, latest.current.id, rev)
          : await publishPage(fetcher, latest.current.id, rev);
      dispatch({ type: "published", rev: result.rev });
      setStatus({ kind: "saved" });
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict(true);
      setStatus({ kind: "error", message: publishFailureMessage(error), retry: false });
      return false;
    }
  }, [fetcher, dispatch, write, collection]);

  return {
    status,
    save,
    publish,
    overwrite,
    conflict,
    closeConflict: () => setConflict(false),
    markIdle: () => setStatus({ kind: "idle" }),
    slugError,
    clearSlugError: () => setSlugError(null),
    rejection,
  };
}
