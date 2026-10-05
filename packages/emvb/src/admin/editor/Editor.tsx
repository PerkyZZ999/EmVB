import { Banner, Button, createKumoToastManager, Empty, Loader, Toasty } from "@cloudflare/kumo";
import { WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  DEVICE_PREVIEW_PX,
  findNode,
  moveDown,
  moveUp,
  renderPage,
  toggleHidden,
  withPlainText,
  type LayoutNode,
  type PopupDevice,
} from "../../core/index.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { loadFormsCapability } from "../forms-api.ts";
import { CanvasFrame, type CanvasSelection } from "./canvas/CanvasFrame.tsx";
import { DeviceBar } from "./canvas/DeviceBar.tsx";
import type { StatePreview } from "./canvas/state-preview.ts";
import type { StyleStateChoice } from "./panels/settings/StateSwitcher.tsx";
import { EmptyCanvas } from "./canvas/EmptyCanvas.tsx";
import { ConflictDialog, DeleteSubtreeDialog, LeaveDialog } from "./dialogs.tsx";
import { EditorOverlay } from "./EditorOverlay.tsx";
import { exitTarget, PAGES_URL } from "./exit.ts";
import { newElement } from "./dnd/new-element.ts";
import { ELEMENT_NAMES } from "./panels/ElementPanel.tsx";
import { LeftPanel } from "./panels/LeftPanel.tsx";
import { SettingsPanel } from "./panels/SettingsPanel.tsx";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import { SmallScreenNotice } from "./SmallScreenNotice.tsx";
import { emptyHistory, historyReducer, isDirty, type EditorState } from "./store.ts";
import { TopBar } from "./TopBar.tsx";
import {
  loadEntry,
  useEditorData,
  type EditorData,
  type EditorEntry,
  type LoadedDesign,
} from "./useEditorData.ts";
import { EDITOR_MIN_WIDTH_QUERY, useMediaQuery } from "./useMediaQuery.ts";
import { useSectionTemplates } from "./section-templates.ts";
import { useEditorCommands } from "./useEditorCommands.ts";
import { useSave } from "./useSave.ts";
import { type ShortcutHandlers, useEditorShortcuts } from "./useEditorShortcuts.ts";
import { useNodeActions } from "./useNodeActions.ts";
import { type PasteRefusal, useClipboardActions } from "./useClipboardActions.ts";

/** The full-screen editor for one EmVB page or theme part (R-001, R-002, R-060). */

/** Sets or clears a node's editor-only name (W-157). */
const withLabel = (node: LayoutNode, label: string | undefined): LayoutNode => {
  const { label: _old, ...rest } = node;
  return (label ? { ...rest, label } : rest) as LayoutNode;
};

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

/** How long a refused paste stays outlined on the canvas (W-093). */
const REFUSAL_MS = 4000;

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
  publishedRevision: design.publishedRevision,
  designUnpublished: design.unpublished,
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
  const [history, dispatch] = React.useReducer(historyReducer, undefined, () =>
    emptyHistory(initialState(entry, design)),
  );
  const state = history.present;
  const dirty = isDirty(state);
  const saver = useSave(fetcher, state, dispatch, collection);
  const toasts = React.useMemo(() => createKumoToastManager(), []);
  const [siteStylesOpen, setSiteStylesOpen] = React.useState(false);
  const [device, setDevice] = React.useState<PopupDevice>("desktop");
  const [statePreview, setStatePreview] = React.useState<StatePreview | null>(null);
  const onStyleState = React.useCallback((id: string, choice: StyleStateChoice) => {
    setStatePreview(choice === "normal" ? null : { id, state: choice });
  }, []);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const latest = React.useRef(state);
  latest.current = state;
  const { busy, save, publish, preview, changeDesign, publishStyles } = useEditorCommands({
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
    arrange,
    duplicate,
    addFromPanel,
    items: itemActions,
  } = useNodeActions({ state, latest, dispatch, announce: setAnnouncement, toasts });
  const [refusal, setRefusal] = React.useState<PasteRefusal | null>(null);
  const clipboard = useClipboardActions({
    latest,
    dispatch,
    announce: setAnnouncement,
    toasts,
    onRefuse: setRefusal,
  });
  React.useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => setRefusal(null), REFUSAL_MS);
    return () => clearTimeout(timer);
  }, [refusal]);
  const refusalShown = refusal && refusal.id === (state.selectedId ?? state.page.layout?.root.id);
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

  const sectionTemplates = useSectionTemplates(state.page.layout, fetcher);
  const rendered = React.useMemo(
    () =>
      state.page.layout
        ? renderPage(state.page.layout, state.design, {
            mode: "editor",
            dynamic: Object.keys(sectionTemplates).length > 0 ? { sectionTemplates } : undefined,
            previewDevice: device,
          })
        : null,
    [state.page.layout, state.design, sectionTemplates, device],
  );
  const selectedNode =
    state.selectedId && state.page.layout ? findNode(state.page.layout, state.selectedId) : null;

  const shortcutHandlers: ShortcutHandlers = {
    save,
    remove,
    duplicate,
    arrange,
    copy: clipboard.copy,
    paste: clipboard.paste,
    pasteStyle: clipboard.pasteStyle,
  };
  const handlers = React.useRef(shortcutHandlers);
  handlers.current = shortcutHandlers;
  const onKeyDown = useEditorShortcuts({ latest, dispatch, handlers });

  const reload = async () => {
    saver.closeConflict();
    try {
      const fresh = await loadEntry(fetcher, state.id);
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
  };

  const selection: CanvasSelection = {
    selectedId: selectedNode ? state.selectedId : null,
    labelFor: (id) => {
      const node = state.page.layout ? findNode(state.page.layout, id) : undefined;
      return node ? (node.label ?? ELEMENT_NAMES[node.type] ?? node.type) : "Element";
    },
    canDelete,
    canMove,
    canDuplicate: canDelete,
    onSelect: (id) => dispatch({ type: "select", id }),
    onDelete: remove,
    onDuplicate: duplicate,
    onKeyDown,
    clipboard,
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
              stylesUnpublished={state.designUnpublished === true}
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
                  onMoveUp={(id) => arrange(id, moveUp)}
                  onMoveDown={(id) => arrange(id, moveDown)}
                  onDelete={remove}
                  clipboard={clipboard}
                  onRename={(id, label) =>
                    dispatch({
                      type: "update-node",
                      id,
                      update: (node) => withLabel(node, label),
                    })
                  }
                />
                <div className="emvb-sr-only" aria-live="polite">
                  {announcement}
                </div>
              </aside>
              <main className="emvb-canvas">
                <DeviceBar
                  device={device}
                  hidden={
                    !!state.page.layout &&
                    !!state.selectedId &&
                    !!findNode(state.page.layout, state.selectedId)?.hiddenOn?.includes(device)
                  }
                  canHide={!!state.selectedId}
                  onDevice={setDevice}
                  onToggleHidden={() => {
                    const id = state.selectedId;
                    const node =
                      state.page.layout && id ? findNode(state.page.layout, id) : undefined;
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
                  }}
                />
                {rendered ? (
                  <CanvasFrame
                    vnode={rendered.vnode}
                    css={rendered.css}
                    layout={state.page.layout}
                    previewWidth={device === "desktop" ? null : DEVICE_PREVIEW_PX[device]}
                    selection={selection}
                    statePreview={statePreview}
                    refusal={refusalShown ? refusal : null}
                    onDropNew={(elementType, parentId, index) => {
                      const node = newElement(elementType);
                      if (!node) return;
                      dispatch({ type: "add-node", node, parentId, index });
                    }}
                    onMove={(id, parentId, index) =>
                      dispatch({ type: "move-node", id, parentId, index })
                    }
                    onCommitText={(id, text) =>
                      dispatch({
                        type: "update-node",
                        id,
                        update: (node) => withPlainText(node, text),
                      })
                    }
                  />
                ) : (
                  <EmptyCanvas latest={latest} dispatch={dispatch} />
                )}
              </main>
              <SettingsPanel
                state={state}
                latest={latest}
                dispatch={dispatch}
                selectedNode={selectedNode}
                siteStylesOpen={siteStylesOpen}
                onCloseSiteStyles={() => setSiteStylesOpen(false)}
                onDesignChange={changeDesign}
                onPublishStyles={publishStyles}
                fetcher={fetcher}
                formsAvailable={formsAvailable}
                rejection={saver.rejection}
                slugError={saver.slugError}
                onSlugEdit={saver.clearSlugError}
                kind={collection === THEME_PARTS_COLLECTION ? "theme-part" : "page"}
                onStyleState={onStyleState}
                device={device}
                items={itemActions}
              />
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
