import { Banner, Button, createKumoToastManager, Empty, Loader, Toasty } from "@cloudflare/kumo";
import { PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import { findNode, moveDown, moveUp, renderPage, type LayoutNode } from "../../core/index.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { loadFormsCapability } from "../forms-api.ts";
import { CanvasFrame, type CanvasSelection } from "./canvas/CanvasFrame.tsx";
import { ConflictDialog, DeleteSubtreeDialog, LeaveDialog } from "./dialogs.tsx";
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
import { SiteStylesDrawer } from "./panels/SiteStylesDrawer.tsx";
import { TopBar } from "./TopBar.tsx";
import {
  loadEntry,
  useEditorData,
  type EditorData,
  type EditorEntry,
  type LoadedDesign,
} from "./useEditorData.ts";
import { EDITOR_MIN_WIDTH_QUERY, useMediaQuery } from "./useMediaQuery.ts";
import { useEditorCommands } from "./useEditorCommands.ts";
import { useSave } from "./useSave.ts";
import { type ShortcutHandlers, useEditorShortcuts } from "./useEditorShortcuts.ts";
import { useNodeActions } from "./useNodeActions.ts";

/** The full-screen editor for one EmVB page or theme part (R-001, R-002, R-060). */
export function Editor({
  fetcher,
  entryId,
  collection = PAGES_COLLECTION,
}: {
  fetcher: Fetcher;
  entryId: string;
  collection?: string;
}) {
  const wideEnough = useMediaQuery(EDITOR_MIN_WIDTH_QUERY);
  const data = useEditorData(fetcher, entryId, collection);
  if (data.state === "ready") {
    return (
      <EditorApp
        key={data.entry.id}
        fetcher={fetcher}
        entry={data.entry}
        design={data.design}
        wideEnough={wideEnough}
        collection={collection}
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
    partType: entry.partType,
    conditions: entry.conditions,
    triggers: entry.triggers,
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

function EditorApp({
  fetcher,
  entry,
  design,
  wideEnough,
  collection,
}: {
  fetcher: Fetcher;
  entry: EditorEntry;
  design: LoadedDesign;
  wideEnough: boolean;
  collection: string;
}) {
  const [state, dispatch] = React.useReducer(editorReducer, undefined, () =>
    initialState(entry, design),
  );
  const dirty = isDirty(state);
  const saver = useSave(fetcher, state, dispatch, collection);
  const toasts = React.useMemo(() => createKumoToastManager(), []);
  const [siteStylesOpen, setSiteStylesOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const latest = React.useRef(state);
  latest.current = state;
  const { busy, save, publish, preview, changeDesign } = useEditorCommands({
    fetcher,
    collection,
    latest,
    dispatch,
    saver,
    toasts,
  });
  const {
    deleteAsk,
    setDeleteAsk,
    canDelete,
    canMove,
    finishDelete,
    remove,
    duplicate,
    addFromPanel,
  } = useNodeActions({ state, latest, dispatch, announce: setAnnouncement, toasts });
  const [formsAvailable, setFormsAvailable] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    void loadFormsCapability(fetcher).then((cap) => {
      if (!cancelled) setFormsAvailable(cap.status !== "missing");
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

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

  const handlers = React.useRef<ShortcutHandlers>({ save, remove, duplicate });
  handlers.current = { save, remove, duplicate };
  const onKeyDown = useEditorShortcuts({ latest, dispatch, announce: setAnnouncement, handlers });

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

  const selection: CanvasSelection = {
    selectedId: selectedNode ? state.selectedId : null,
    labelFor: (id) => {
      const node = state.page.layout ? findNode(state.page.layout, id) : undefined;
      return node ? (ELEMENT_NAMES[node.type] ?? node.type) : "Element";
    },
    canDelete,
    canMove,
    canDuplicate: canDelete,
    onSelect: (id) => dispatch({ type: "select", id }),
    onDelete: remove,
    onDuplicate: duplicate,
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
              onSiteStyles={() => setSiteStylesOpen(true)}
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
                  formsAvailable={formsAvailable}
                  onDuplicate={duplicate}
                  onMoveUp={(id) => {
                    const layout = latest.current.page.layout;
                    if (!layout) return;
                    const result = moveUp(layout, id);
                    if (!result.ok) setAnnouncement(result.reason);
                    else
                      dispatch({
                        type: "apply-arranged",
                        layout: result.layout,
                        selected: result.selected,
                      });
                  }}
                  onMoveDown={(id) => {
                    const layout = latest.current.page.layout;
                    if (!layout) return;
                    const result = moveDown(layout, id);
                    if (!result.ok) setAnnouncement(result.reason);
                    else
                      dispatch({
                        type: "apply-arranged",
                        layout: result.layout,
                        selected: result.selected,
                      });
                  }}
                  onDelete={remove}
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
                      <PlusIcon size={16} aria-hidden="true" />
                      Add a container to start
                    </button>
                  </div>
                )}
              </main>
              <aside
                className="emvb-panel emvb-panel-right"
                aria-label={
                  siteStylesOpen
                    ? "Site styles"
                    : selectedNode
                      ? "Element settings"
                      : "Page settings"
                }
              >
                {siteStylesOpen ? (
                  <SiteStylesDrawer
                    design={state.design}
                    layout={state.page.layout}
                    onDesignChange={changeDesign}
                    onLayoutChange={(layout) =>
                      dispatch({
                        type: "apply-arranged",
                        layout,
                        selected: latest.current.selectedId ?? layout.root.id,
                      })
                    }
                    onClose={() => setSiteStylesOpen(false)}
                  />
                ) : selectedNode ? (
                  <ElementPanel
                    key={selectedNode.id}
                    node={selectedNode}
                    layout={state.page.layout}
                    design={state.design}
                    rejection={saver.rejection}
                    fetcher={fetcher}
                    formsAvailable={formsAvailable}
                    onChange={(node: LayoutNode) =>
                      dispatch({ type: "update-node", id: node.id, update: () => node })
                    }
                    onDesignChange={changeDesign}
                    onSelect={(id) => dispatch({ type: "select", id })}
                  />
                ) : (
                  <PageSettings
                    page={state.page}
                    slugError={saver.slugError}
                    kind={collection === THEME_PARTS_COLLECTION ? "theme-part" : "page"}
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
        <DeleteSubtreeDialog
          open={!!deleteAsk}
          onOpenChange={(open) => !open && setDeleteAsk(null)}
          label={deleteAsk?.label ?? "Element"}
          count={deleteAsk?.count ?? 0}
          onConfirm={() => deleteAsk && finishDelete(deleteAsk.id)}
        />
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
