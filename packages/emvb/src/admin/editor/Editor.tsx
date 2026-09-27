import { Banner, Button, createKumoToastManager, Empty, Loader, Toasty } from "@cloudflare/kumo";
import { PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  ELEMENT_DESCRIPTORS,
  findNode,
  insertionPoint,
  renderPage,
  type DesignSystem,
  type ElementType,
  type LayoutNode,
} from "../../core/index.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { previewUrl, saveDesign } from "../content-api.ts";
import { readCollection } from "../setup/run.ts";
import { CanvasFrame, type CanvasSelection } from "./canvas/CanvasFrame.tsx";
import { ConflictDialog, LeaveDialog } from "./dialogs.tsx";
import { EditorOverlay } from "./EditorOverlay.tsx";
import { exitTarget, PAGES_URL } from "./exit.ts";
import { NEW_ELEMENT_MIME } from "./dnd/drop-target.ts";
import { newElement } from "./dnd/new-element.ts";
import { ELEMENT_NAMES, ElementPanel } from "./panels/ElementPanel.tsx";
import { LeftPanel } from "./panels/LeftPanel.tsx";
import { PageSettings } from "./panels/PageSettings.tsx";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import { SmallScreenNotice } from "./SmallScreenNotice.tsx";
import { editorReducer, isDirty, type EditorState } from "./store.ts";
import { TopBar } from "./TopBar.tsx";
import {
  loadEntry,
  useEditorData,
  type EditorData,
  type EditorEntry,
  type LoadedDesign,
} from "./useEditorData.ts";
import { EDITOR_MIN_WIDTH_QUERY, useMediaQuery } from "./useMediaQuery.ts";
import { useSave } from "./useSave.ts";

const RESTORE_TIMEOUT_MS = 6000;

/** The full-screen editor for one `emvb_pages` entry (R-001, R-002). */
export function Editor({ fetcher, entryId }: { fetcher: Fetcher; entryId: string }) {
  const wideEnough = useMediaQuery(EDITOR_MIN_WIDTH_QUERY);
  const data = useEditorData(fetcher, entryId);
  if (data.state === "ready") {
    return (
      <EditorApp
        key={data.entry.id}
        fetcher={fetcher}
        entry={data.entry}
        design={data.design}
        wideEnough={wideEnough}
      />
    );
  }
  return (
    <EditorOverlay label="EmVB editor">
      {wideEnough ? <LoadState data={data} /> : <SmallScreenNotice />}
    </EditorOverlay>
  );
}

const exit = () => window.location.assign(exitTarget(document.referrer, window.location.origin));

const initialState = (entry: EditorEntry, design: LoadedDesign): EditorState => ({
  id: entry.id,
  page: {
    title: entry.title,
    slug: entry.slug,
    canvasMode: entry.canvasMode,
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
    layout: entry.layout,
  },
  status: entry.status,
  rev: entry.rev,
  design: design.design,
  designRevision: design.revision,
  selectedId: null,
  version: 0,
  savedVersion: 0,
  lastDeleted: null,
});

const isTextField = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) ||
    element.isContentEditable ||
    element.getAttribute("role") === "combobox"
  );
};

const inDialog = (target: EventTarget | null) =>
  !!(target as HTMLElement | null)?.closest?.('[role="dialog"], [role="alertdialog"]');

const publicPath = (pattern: string | null | undefined, slug: string) =>
  (pattern || "/{slug}").replace("{slug}", encodeURIComponent(slug));

/** Opens a tab synchronously (so pop-up blockers allow it), then points it at `url` when known. */
async function openInNewTab(url: () => Promise<string | null>) {
  const tab = window.open("", "_blank");
  const target = await url().catch(() => null);
  if (!tab) return;
  if (!target) return tab.close();
  tab.opener = null;
  tab.location.href = target;
}

function EditorApp({
  fetcher,
  entry,
  design,
  wideEnough,
}: {
  fetcher: Fetcher;
  entry: EditorEntry;
  design: LoadedDesign;
  wideEnough: boolean;
}) {
  const [state, dispatch] = React.useReducer(editorReducer, undefined, () =>
    initialState(entry, design),
  );
  const dirty = isDirty(state);
  const saver = useSave(fetcher, state, dispatch);
  const toasts = React.useMemo(() => createKumoToastManager(), []);
  const [busy, setBusy] = React.useState<"save" | "publish" | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const lastToast = React.useRef<string | null>(null);
  const latest = React.useRef(state);
  latest.current = state;

  React.useEffect(() => {
    if (leaving) exit();
  }, [leaving]);

  const rendered = React.useMemo(
    () =>
      state.page.layout ? renderPage(state.page.layout, state.design, { mode: "editor" }) : null,
    [state.page.layout, state.design],
  );
  const selectedNode =
    state.selectedId && state.page.layout ? findNode(state.page.layout, state.selectedId) : null;

  const save = async () => {
    setBusy("save");
    try {
      return await saver.save();
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setBusy("publish");
    try {
      if (!(await saver.publish())) return;
    } finally {
      setBusy(null);
    }
    const pattern = await readCollection(fetcher).then(
      (collection) => collection?.urlPattern,
      () => null,
    );
    const path = publicPath(pattern, latest.current.page.slug);
    toasts.add({
      title: "Published",
      actions: [
        {
          children: "View page ↗",
          variant: "secondary",
          onClick: () => window.open(path, "_blank", "noopener"),
        },
      ],
    });
  };

  const preview = () =>
    void openInNewTab(async () => {
      if (isDirty(latest.current) && !(await save())) return null;
      return previewUrl(fetcher, latest.current.id);
    });

  const canDelete = (id: string) => !!state.page.layout && state.page.layout.root.id !== id;
  const canMove = canDelete;

  const remove = (id: string) => {
    if (!canDelete(id)) return;
    dispatch({ type: "delete-node", id });
    if (lastToast.current) toasts.close(lastToast.current);
    const toastId: string = toasts.add({
      title: "Element deleted",
      timeout: RESTORE_TIMEOUT_MS,
      actions: [
        {
          children: "Restore",
          variant: "secondary",
          onClick: () => {
            dispatch({ type: "restore" });
            toasts.close(toastId);
          },
        },
      ],
    });
    lastToast.current = toastId;
  };

  const handlers = React.useRef({ save, remove });
  handlers.current = { save, remove };
  const onKeyDown = React.useCallback((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void handlers.current.save();
      return;
    }
    if (isTextField(event.target) || inDialog(event.target)) return;
    const selected = latest.current.selectedId;
    if (event.key === "Escape" && selected) dispatch({ type: "select", id: null });
    else if ((event.key === "Delete" || event.key === "Backspace") && selected) {
      event.preventDefault();
      handlers.current.remove(selected);
    }
  }, []);

  React.useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const changeDesign = async (next: DesignSystem) => {
    try {
      const revision = await saveDesign(fetcher, next, latest.current.designRevision);
      dispatch({ type: "set-design", design: next, revision });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        throw new Error(
          "Site styles were changed somewhere else. Reload the editor and try again.",
          { cause: error },
        );
      }
      throw new Error(
        error instanceof ApiError
          ? `Couldn't save site styles. ${error.message}`
          : "Couldn't save site styles. Check your connection and try again.",
        { cause: error },
      );
    }
  };

  const reload = async () => {
    saver.closeConflict();
    try {
      const fresh = await loadEntry(fetcher, state.id);
      dispatch({
        type: "reset",
        state: initialState(fresh, { design: state.design, revision: state.designRevision }),
      });
      saver.markIdle();
    } catch {
      window.location.reload();
    }
  };

  const addFromPanel = (type: ElementType) => {
    const layout = latest.current.page.layout;
    if (!layout) {
      if (type === "container") dispatch({ type: "add-root-container" });
      return;
    }
    const node = newElement(type);
    if (!node) return;
    const place = insertionPoint(layout, latest.current.selectedId);
    const parent = findNode(layout, place.parentId);
    const parentName = ELEMENT_NAMES[parent?.type ?? "container"] ?? "Container";
    const label = ELEMENT_DESCRIPTORS.find((d) => d.type === type)?.name ?? type;
    dispatch({ type: "add-node", node, parentId: place.parentId, index: place.index });
    setAnnouncement(`${label} added inside ${parentName}`);
  };

  const selection: CanvasSelection = {
    selectedId: selectedNode ? state.selectedId : null,
    labelFor: (id) => {
      const node = state.page.layout ? findNode(state.page.layout, id) : undefined;
      return node ? (ELEMENT_NAMES[node.type] ?? node.type) : "Element";
    },
    canDelete,
    canMove,
    onSelect: (id) => dispatch({ type: "select", id }),
    onDelete: remove,
    onKeyDown,
  };

  return (
    <EditorOverlay
      label={`EmVB editor: ${state.page.title || "Untitled page"}`}
      dirty={dirty && !leaving}
    >
      <Toasty toastManager={toasts}>
        {wideEnough ? (
          <>
            <TopBar
              page={{ title: state.page.title, status: state.status }}
              dirty={dirty}
              status={saver.status}
              busy={busy}
              onExit={() => (dirty ? setLeaveOpen(true) : exit())}
              onShortcuts={() => setShortcutsOpen(true)}
              onPreview={preview}
              onSave={() => void save()}
              onPublish={() => void publish()}
            />
            <div className="emvb-frame">
              <aside className="emvb-panel emvb-panel-left" aria-label="Add and Layers">
                <LeftPanel
                  layout={state.page.layout}
                  selectedId={state.selectedId}
                  onSelect={(id) => dispatch({ type: "select", id })}
                  onAdd={addFromPanel}
                />
                <div className="emvb-sr-only" aria-live="polite">
                  {announcement}
                </div>
              </aside>
              <main className="emvb-canvas">
                {rendered ? (
                  <CanvasFrame
                    vnode={rendered.vnode}
                    css={rendered.css}
                    layout={state.page.layout}
                    selection={selection}
                    onDropNew={(elementType, parentId, index) => {
                      const node = newElement(elementType);
                      if (!node) return;
                      dispatch({ type: "add-node", node, parentId, index });
                    }}
                    onMove={(id, parentId, index) =>
                      dispatch({ type: "move-node", id, parentId, index })
                    }
                  />
                ) : (
                  <div
                    className="emvb-empty-canvas"
                    data-emvb-empty-canvas=""
                    onDragOver={(event) => {
                      if (![...event.dataTransfer.types].includes(NEW_ELEMENT_MIME)) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const type = event.dataTransfer.getData(NEW_ELEMENT_MIME);
                      if (!type) return;
                      dispatch({ type: "add-root-container" });
                      if (type === "container") return;
                      queueMicrotask(() => {
                        const layout = latest.current.page.layout;
                        if (!layout) return;
                        const node = newElement(type);
                        if (!node) return;
                        dispatch({
                          type: "add-node",
                          node,
                          parentId: layout.root.id,
                          index: 0,
                        });
                      });
                    }}
                  >
                    <button
                      type="button"
                      className="emvb-empty-prompt"
                      onClick={() => dispatch({ type: "add-root-container" })}
                    >
                      <PlusIcon size={20} aria-hidden="true" />
                      Add a container to start
                    </button>
                  </div>
                )}
              </main>
              <aside
                className="emvb-panel emvb-panel-right"
                aria-label={selectedNode ? "Element settings" : "Page settings"}
              >
                {selectedNode ? (
                  <ElementPanel
                    key={selectedNode.id}
                    node={selectedNode}
                    design={state.design}
                    rejection={saver.rejection}
                    onChange={(node: LayoutNode) =>
                      dispatch({ type: "update-node", id: node.id, update: () => node })
                    }
                    onDesignChange={changeDesign}
                  />
                ) : (
                  <PageSettings
                    page={state.page}
                    slugError={saver.slugError}
                    onChange={(patch) => {
                      if (patch.slug !== undefined) saver.clearSlugError();
                      dispatch({ type: "set-page", patch });
                    }}
                  />
                )}
              </aside>
            </div>
          </>
        ) : (
          <SmallScreenNotice />
        )}
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <ConflictDialog
          open={saver.conflict}
          onOpenChange={(open) => !open && saver.closeConflict()}
          onReload={() => void reload()}
          onOverwrite={() => void saver.overwrite()}
        />
        <LeaveDialog
          open={leaveOpen}
          onOpenChange={setLeaveOpen}
          onDiscard={() => setLeaving(true)}
          onSaveAndLeave={() =>
            void save().then((rev) => {
              setLeaveOpen(false);
              if (rev) setLeaving(true);
            })
          }
        />
      </Toasty>
    </EditorOverlay>
  );
}

const noop = () => undefined;

function LoadState({ data }: { data: EditorData }) {
  return (
    <>
      <TopBar
        page={null}
        dirty={false}
        status={{ kind: "idle" }}
        busy={null}
        onExit={exit}
        onShortcuts={noop}
        onPreview={noop}
        onSave={noop}
        onPublish={noop}
      />
      <LoadBody data={data} />
    </>
  );
}

function LoadBody({ data }: { data: EditorData }) {
  if (data.state === "not-found" || data.state === "forbidden") {
    return (
      <div className="emvb-state" data-emvb-editor-state={data.state}>
        <Empty
          title={data.state === "not-found" ? "Page not found" : "You can't open this page"}
          description={
            data.state === "not-found"
              ? "It may have been deleted. Choose another page from Visual pages."
              : "Your role doesn't allow editing this page."
          }
          contents={
            <Button variant="secondary" onClick={() => window.location.assign(PAGES_URL)}>
              Go to Visual pages
            </Button>
          }
        />
      </div>
    );
  }
  if (data.state === "error") {
    return (
      <div className="emvb-state" data-emvb-editor-state="error">
        <Banner
          variant="error"
          icon={<WarningCircleIcon aria-hidden="true" />}
          title="Couldn't open this page"
          description={data.message}
        />
      </div>
    );
  }
  return (
    <div className="emvb-state">
      <Loader />
    </div>
  );
}
