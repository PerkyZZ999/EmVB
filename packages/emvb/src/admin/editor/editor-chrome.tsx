import type { createKumoToastManager } from "@cloudflare/kumo";
import { focusWhenLost } from "./focus-when-lost.ts";
import type { SavedSectionActions } from "./useSavedSections.ts";
import * as React from "react";
import {
  findNode,
  toggleHidden,
  type A11yReport,
  type ElementType,
  type LayoutNode,
  type PopupDevice,
  type ThemeDynamicData,
} from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { discardDraft } from "../content-api.ts";
import { ImageEditorLauncher } from "../image-editor/ImageEditButton.tsx";
import { saveEditedCopy } from "../media-api.ts";
import { A11yDialog } from "./A11yCopilot.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { ConflictDialog, DeleteSubtreeDialog, LeaveDialog, RevertDialog } from "./dialogs.tsx";
import type { EditorCommand } from "./editor-commands.ts";
import { paletteItems } from "./palette-items.ts";
import { PerfMeterDialog } from "./PerfMeter.tsx";
import { ShareLinkDialog } from "./ShareLink.tsx";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import type { EditorAction, EditorState } from "./store.ts";
import { TimelineDialog } from "./Timeline.tsx";
import { loadEntry, type EditorEntry, type LoadedDesign } from "./useEditorData.ts";
import type { useSave } from "./useSave.ts";

/** The editor state for an entry that just loaded, with the design already on screen. */
export const initialState = (entry: EditorEntry, design: LoadedDesign): EditorState => ({
  id: entry.id,
  page: {
    title: entry.title,
    slug: entry.slug,
    canvasMode: entry.canvasMode,
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
    seoCanonical: entry.seoCanonical,
    seoNoIndex: entry.seoNoIndex,
    seoImage: entry.seoImage,
    layout: entry.layout,
    partType: entry.partType,
    conditions: entry.conditions,
    triggers: entry.triggers,
    float: entry.float,
  },
  status: entry.status,
  rev: entry.rev,
  design: design.design,
  designRevision: design.revision,
  publishedRevision: design.publishedRevision,
  designUnpublished: design.unpublished,
  ...(design.published ? { publishedDesign: design.published } : {}),
  selectedId: null,
  version: 0,
  savedVersion: 0,
  lastDeleted: null,
});

const CLOSED = {
  siteStyles: false,
  shortcuts: false,
  perf: false,
  share: false,
  palette: false,
  timeline: false,
  a11y: false,
  leave: false,
  revert: false,
  imageEditor: false,
};

type ChromeKey = keyof typeof CLOSED;

/** Which editor dialog is open. They all start closed. */
export function useChromeFlags() {
  const [flags, setFlags] = React.useState(CLOSED);
  const [leaving, setLeaving] = React.useState(false);
  const open = (key: ChromeKey) => setFlags((current) => ({ ...current, [key]: true }));
  const close = (key: ChromeKey) => setFlags((current) => ({ ...current, [key]: false }));
  const setOpen = (key: ChromeKey) => (next: boolean) =>
    setFlags((current) => ({ ...current, [key]: next }));
  // W-831: a dialog opened from the command palette has no trigger left to return focus to (the
  // palette is gone), so closing it dropped focus to <body>. When one closes and nothing took
  // focus, go to the selected layer, else the canvas, as the palette does after a command.
  const previous = React.useRef(flags);
  React.useEffect(() => {
    const was = previous.current;
    previous.current = flags;
    const closed = (Object.keys(flags) as ChromeKey[]).some(
      (key) => key !== "palette" && was[key] && !flags[key],
    );
    return closed ? focusWhenLost() : undefined;
  }, [flags]);
  return { flags, leaving, setLeaving, open, close, setOpen };
}

export type ChromeFlags = ReturnType<typeof useChromeFlags>;

/** Reload the open entry after a conflict, keeping the design already on screen. */
async function reloadEntry({
  fetcher,
  collection,
  state,
  dispatch,
  saver,
}: {
  fetcher: Fetcher;
  collection: string;
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  saver: ReturnType<typeof useSave>;
}): Promise<void> {
  saver.closeConflict();
  try {
    const fresh = await loadEntry(fetcher, state.id, collection);
    dispatch({
      type: "reset",
      state: initialState(fresh, {
        design: state.design,
        revision: state.designRevision,
        publishedRevision: state.publishedRevision ?? null,
        unpublished: state.designUnpublished === true,
      }),
    });
    saver.markIdle();
  } catch {
    window.location.reload();
  }
}

/** Drop the saved draft, or the local edits on a published entry, and load the published copy. */
async function revertToPublished({
  fetcher,
  collection,
  latest,
  dispatch,
  saver,
  toasts,
  close,
}: {
  fetcher: Fetcher;
  collection: string;
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
  saver: ReturnType<typeof useSave>;
  toasts: ReturnType<typeof createKumoToastManager>;
  close: () => void;
}): Promise<void> {
  close();
  try {
    if (latest.current.status === "changed") {
      await discardDraft(fetcher, collection, latest.current.id, latest.current.rev);
    }
    await reloadEntry({ fetcher, collection, state: latest.current, dispatch, saver });
    toasts.add({ title: "Reverted to the published version" });
  } catch (error) {
    toasts.add({
      title: "Couldn't revert",
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Hide or show the selected element on the current device (W-096). */
export function hideSelectedOnDevice(
  state: EditorState,
  device: PopupDevice,
  dispatch: React.Dispatch<EditorAction>,
): void {
  const id = state.selectedId;
  const node = state.page.layout && id ? findNode(state.page.layout, id) : undefined;
  if (!node) return;
  const hiddenOn = toggleHidden(node.hiddenOn, device);
  dispatch({
    type: "update-node",
    id: node.id,
    update: (current) => {
      const next = { ...current, hiddenOn };
      if (!hiddenOn) delete next.hiddenOn;
      return next;
    },
  });
}

/** The editor's dialogs. The page around them stays in Editor. */
export function EditorDialogs({
  chrome,
  fetcher,
  collection,
  state,
  latest,
  dispatch,
  saver,
  toasts,
  save,
  a11y,
  canvasStyles,
  selectedNode,
  formsAvailable,
  paletteActions,
  addFromPanel,
  addRecipe,
  deleteAsk,
  setDeleteAsk,
  finishDelete,
  playgroundUrl,
  setAnnouncement,
  parts,
  saved,
}: {
  chrome: ChromeFlags;
  fetcher: Fetcher;
  collection: string;
  state: EditorState;
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
  saver: ReturnType<typeof useSave>;
  toasts: ReturnType<typeof createKumoToastManager>;
  save: () => Promise<unknown>;
  a11y: A11yReport;
  canvasStyles: readonly string[];
  selectedNode: LayoutNode | null;
  formsAvailable: boolean;
  paletteActions: readonly EditorCommand[];
  addFromPanel: (type: ElementType) => void;
  addRecipe: (id: string) => void;
  deleteAsk: { id: string; label: string; count: number } | null;
  setDeleteAsk: (ask: { id: string; label: string; count: number } | null) => void;
  finishDelete: (id: string) => void;
  playgroundUrl?: string;
  setAnnouncement: (message: string) => void;
  /** Synced sections and Loop Item parts loaded for the canvas (W-671). */
  parts?: ThemeDynamicData;
  /** My sections for the palette's Insert group (W-876). */
  saved?: SavedSectionActions;
}) {
  const [leaveSaving, setLeaveSaving] = React.useState(false);
  return (
    <>
      <DeleteSubtreeDialog
        open={!!deleteAsk}
        onOpenChange={(open) => !open && setDeleteAsk(null)}
        label={deleteAsk?.label ?? "Element"}
        count={deleteAsk?.count ?? 0}
        onConfirm={() => {
          if (!deleteAsk) return;
          finishDelete(deleteAsk.id);
          // W-835: the dialog hands focus back to the deleted row, which is gone; go to the
          // newly selected layer (or the canvas) instead of <body>.
          focusWhenLost();
        }}
      />
      <PaletteImageEditor
        open={chrome.flags.imageEditor}
        onOpenChange={chrome.setOpen("imageEditor")}
        selectedNode={selectedNode}
        fetcher={fetcher}
        dispatch={dispatch}
      />
      <ShortcutsDialog open={chrome.flags.shortcuts} onOpenChange={chrome.setOpen("shortcuts")} />
      <CommandPalette
        open={chrome.flags.palette}
        onOpenChange={chrome.setOpen("palette")}
        items={
          chrome.flags.palette
            ? paletteItems({
                layout: state.page.layout,
                design: state.design,
                selected: selectedNode ?? null,
                formsAvailable,
                insert: addFromPanel,
                insertRecipe: addRecipe,
                ...(saved
                  ? { savedSections: saved.list, insertSaved: (id) => void saved.insert(id) }
                  : {}),
                select: (id) => dispatch({ type: "select", id }),
                applyClass: (nodeId, classId) =>
                  dispatch({
                    type: "update-node",
                    id: nodeId,
                    update: (node) =>
                      (node.classes?.length ?? 0) >= 20 || node.classes?.includes(classId)
                        ? node
                        : ({
                            ...node,
                            classes: [...(node.classes ?? []), classId],
                          } as LayoutNode),
                  }),
                actions: paletteActions.map((command) => ({
                  id: command.id,
                  label: command.label,
                  hint: command.hint,
                  keywords: command.keywords,
                  run: () => command.run(),
                })),
              })
            : []
        }
      />
      <A11yDialog
        open={chrome.flags.a11y}
        onOpenChange={chrome.setOpen("a11y")}
        report={a11y}
        layout={state.page.layout}
        onSelect={(id) => dispatch({ type: "select", id })}
        onApply={(layout, note) => {
          dispatch({
            type: "apply-arranged",
            layout,
            selected: latest.current.selectedId ?? layout.root.id,
          });
          setAnnouncement(note);
          toasts.add({ title: note, description: "Undo takes it back." });
        }}
      />
      <TimelineDialog
        open={chrome.flags.timeline}
        onOpenChange={chrome.setOpen("timeline")}
        fetcher={fetcher}
        collection={collection}
        entryId={state.id}
        current={state.page.layout}
        design={state.design}
        canvasStyles={canvasStyles}
        onApply={(layout, note) => {
          dispatch({
            type: "apply-arranged",
            layout,
            selected: latest.current.selectedId ?? layout.root.id,
          });
          setAnnouncement(note);
          toasts.add({ title: note, description: "Undo takes it back. Save to keep it." });
        }}
      />
      <ShareLinkDialog
        open={chrome.flags.share}
        onOpenChange={chrome.setOpen("share")}
        layout={state.page.layout}
        design={state.design}
        title={state.page.title || "Shared page"}
        {...(playgroundUrl ? { base: playgroundUrl } : {})}
      />
      <PerfMeterDialog
        open={chrome.flags.perf}
        onOpenChange={chrome.setOpen("perf")}
        layout={state.page.layout}
        design={state.design}
        parts={parts}
        onSelect={(id) => dispatch({ type: "select", id })}
      />
      <ConflictDialog
        open={saver.conflict}
        onOpenChange={(open) => !open && saver.closeConflict()}
        onReload={() => void reloadEntry({ fetcher, collection, state, dispatch, saver })}
        onOverwrite={() => void saver.overwrite()}
      />
      <RevertDialog
        open={chrome.flags.revert}
        onOpenChange={chrome.setOpen("revert")}
        onRevert={() =>
          void revertToPublished({
            fetcher,
            collection,
            latest,
            dispatch,
            saver,
            toasts,
            close: () => chrome.close("revert"),
          })
        }
      />
      <LeaveDialog
        open={chrome.flags.leave}
        onOpenChange={chrome.setOpen("leave")}
        onDiscard={() => chrome.setLeaving(true)}
        saving={leaveSaving}
        onSaveAndLeave={() => {
          setLeaveSaving(true);
          void save()
            .then((rev) => {
              chrome.close("leave");
              if (rev) chrome.setLeaving(true);
            })
            .finally(() => setLeaveSaving(false));
        }}
      />
    </>
  );
}

/**
 * The image editor opened from the command palette's "Edit image" (W-486). It edits the Image
 * element that was selected when it opened, and saves the copy onto that element.
 */
function PaletteImageEditor({
  open,
  onOpenChange,
  selectedNode,
  fetcher,
  dispatch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedNode: LayoutNode | null;
  fetcher: Fetcher;
  dispatch: React.Dispatch<EditorAction>;
}) {
  const [target, setTarget] = React.useState<LayoutNode | null>(null);
  if (open && !target && selectedNode?.type === "image") setTarget(selectedNode);
  if (!target) return null;
  const props = target.props as Record<string, unknown>;
  return (
    <ImageEditorLauncher
      open={open}
      onOpenChange={onOpenChange}
      imageProps={props}
      onSave={async (file, copy) => {
        const next = await saveEditedCopy(fetcher, props, file, copy);
        dispatch({
          type: "update-node",
          id: target.id,
          update: (node) => ({ ...node, props: next }) as LayoutNode,
        });
      }}
      onClosed={() => setTarget(null)}
    />
  );
}
