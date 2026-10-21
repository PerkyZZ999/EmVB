import * as React from "react";
import type { createKumoToastManager } from "@cloudflare/kumo";
import {
  classMergeNotice,
  droppedNotice,
  insertSavedSection,
  LAYOUT_SCHEMA_VERSION,
  newNodeId,
  pageSlug,
  snapshotSection,
  syncedPartLayout,
  wrapInThemeSection,
  type DesignSystem,
  type Layout,
} from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import {
  deleteSavedSection,
  getSavedSection,
  listSavedSections,
  renameSavedSection,
  saveSavedSection,
  type SavedSectionSummary,
} from "../saved-sections-api.ts";
import { createThemePart } from "../theme-api.ts";
import type { EditorAction, EditorState } from "./store.ts";

export type SaveMode = "copy" | "synced";

/** What the Add panel, the palette and the Save as section dialog use (W-876). */
export type SavedSectionActions = {
  list: SavedSectionSummary[];
  /** Null until the first list arrives; a message when it couldn't be read. */
  loadError: string | null;
  loaded: boolean;
  refresh: () => void;
  /** Resolves to null when saved, or the reason it wasn't. */
  save: (nodeId: string, name: string, mode: SaveMode) => Promise<string | null>;
  insert: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
};

const NOTICE_MS = 5000;
const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Saved sections in the editor (W-876, D-060). Copies go to `emvb_saved_sections`; Synced makes a
 * Section theme part (W-098) from the element and puts the element inside a Theme section that
 * embeds it. Inserting brings the section's classes into Site styles first, never overwriting one.
 */
export function useSavedSections({
  fetcher,
  latest,
  dispatch,
  changeDesign,
  announce,
  toasts,
}: {
  fetcher: Fetcher;
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
  changeDesign: (next: DesignSystem) => Promise<unknown>;
  announce: (message: string) => void;
  toasts: ReturnType<typeof createKumoToastManager>;
}): SavedSectionActions {
  const [list, setList] = React.useState<SavedSectionSummary[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const tell = React.useCallback(
    (title: string, description?: string) => {
      announce(description ? `${title}. ${description}` : title);
      toasts.add({ title, ...(description ? { description } : {}), timeout: NOTICE_MS });
    },
    [announce, toasts],
  );

  const refresh = React.useCallback(() => {
    listSavedSections(fetcher).then(
      (items) => {
        setList(items);
        setLoadError(null);
        setLoaded(true);
      },
      (error: unknown) => {
        setLoadError(messageOf(error, "Couldn't load My sections."));
        setLoaded(true);
      },
    );
  }, [fetcher]);
  React.useEffect(refresh, [refresh]);

  const saveCopy = async (layout: Layout, nodeId: string, name: string) => {
    const snap = snapshotSection(
      layout,
      nodeId,
      latest.current.design,
      name,
      new Date().toISOString(),
    );
    if (!snap.ok) return snap.reason;
    await saveSavedSection(fetcher, snap.record);
    refresh();
    tell(`Saved "${snap.record.name}" to My sections`);
    return null;
  };

  const saveSynced = async (layout: Layout, nodeId: string, name: string) => {
    const partLayout = syncedPartLayout(layout, nodeId);
    const title = name.trim();
    if (!title) return "Give the section a name.";
    if (!partLayout) return "Choose an element inside the page.";
    // Try the wrap first: a refused one (a tab panel, a menu item) used to leave a stray part (W-880).
    const fits = wrapInThemeSection(layout, nodeId, "check");
    if (!fits.ok) return fits.reason;
    // The slug only tells theme parts apart; a short random tail keeps two "Hero"s apart.
    const slug = `${pageSlug(`section-${title}`).slice(0, 60)}-${newNodeId().slice(0, 4)}`;
    const partId = await createThemePart(fetcher, {
      title,
      slug,
      partType: "section",
      layout: partLayout,
    });
    const now = latest.current.page.layout;
    const wrapped = now ? wrapInThemeSection(now, nodeId, partId) : null;
    if (!wrapped?.ok) {
      return `The theme section "${title}" was made, but this element couldn't be linked to it. ${wrapped?.reason ?? ""}`.trim();
    }
    dispatch({ type: "apply-arranged", layout: wrapped.layout, selected: wrapped.selected });
    tell(
      `Made the synced section "${title}"`,
      "Edit it in Theme Builder; publish it there to use it on the site.",
    );
    return null;
  };

  const save: SavedSectionActions["save"] = async (nodeId, name, mode) => {
    const layout = latest.current.page.layout;
    if (!layout) return "This page has no elements yet.";
    try {
      return await (mode === "synced" ? saveSynced : saveCopy)(layout, nodeId, name);
    } catch (error) {
      return messageOf(error, "Couldn't save the section.");
    }
  };

  const insert: SavedSectionActions["insert"] = async (id) => {
    try {
      const section = await getSavedSection(fetcher, id);
      const state = latest.current;
      const layout = state.page.layout ?? {
        schemaVersion: LAYOUT_SCHEMA_VERSION,
        root: { id: newNodeId(), type: "container" as const, props: {}, children: [] },
      };
      const result = insertSavedSection(section, layout, state.design, state.selectedId);
      if (!result.ok) {
        tell(result.reason);
        return;
      }
      const classes = classMergeNotice(result.merge);
      // Classes first: an inserted copy never points at a class Site styles failed to save.
      if (classes) await changeDesign(result.design);
      dispatch({ type: "apply-arranged", layout: result.layout, selected: result.selected });
      const left = droppedNotice(result.dropped);
      const extra = [classes, left].filter(Boolean).join(" ");
      if (extra) tell(`Inserted "${section.name}"`, extra);
      else announce(`Inserted "${section.name}"`);
    } catch (error) {
      tell(messageOf(error, "Couldn't insert the section."));
    }
  };

  const rename: SavedSectionActions["rename"] = async (id, name) => {
    try {
      const item = await renameSavedSection(fetcher, id, name);
      setList((items) => items.map((entry) => (entry.id === id ? item : entry)));
      announce(`Renamed to "${item.name}"`);
      return null;
    } catch (error) {
      return messageOf(error, "Couldn't rename the section.");
    }
  };

  const remove: SavedSectionActions["remove"] = async (id) => {
    try {
      await deleteSavedSection(fetcher, id);
      setList((items) => items.filter((entry) => entry.id !== id));
      announce("Section deleted. Pages that use a copy keep it.");
      return null;
    } catch (error) {
      return messageOf(error, "Couldn't delete the section.");
    }
  };

  return { list, loaded, loadError, refresh, save, insert, rename, remove };
}
