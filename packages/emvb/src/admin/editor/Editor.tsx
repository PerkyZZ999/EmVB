import { Banner, Button, createKumoToastManager, Empty, Loader, Toasty } from "@cloudflare/kumo";
import { ClockCounterClockwiseIcon, GaugeIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  auditPage,
  findNode,
  moveDown,
  moveUp,
  renderPage,
  toggleHidden,
  withPlainText,
  type Layout,
  type LayoutNode,
  type PopupDevice,
} from "../../core/index.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { loadFormsCapability } from "../forms-api.ts";
import { CanvasFrame, type CanvasSelection, type CanvasZoom } from "./canvas/CanvasFrame.tsx";
import { DeviceBar } from "./canvas/DeviceBar.tsx";
import type { StatePreview } from "./canvas/state-preview.ts";
import type { StyleStateChoice } from "./panels/settings/StateSwitcher.tsx";
import { EmptyCanvas } from "./canvas/EmptyCanvas.tsx";
import { ConflictDialog, DeleteSubtreeDialog, LeaveDialog, RevertDialog } from "./dialogs.tsx";
import { discardDraft } from "../content-api.ts";
import { EditorOverlay } from "./EditorOverlay.tsx";
import { useEditorHost } from "./host.ts";
import { LiveDataProvider, useLiveData } from "./live-data.tsx";
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
import { useCollectionPreviews } from "./collection-previews.ts";
import { PerfMeterDialog } from "./PerfMeter.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { TimelineDialog } from "./Timeline.tsx";
import { A11yDialog, A11yScoreButton } from "./A11yCopilot.tsx";
import { paletteItems } from "./palette-items.ts";
import { restoreOnUndo, type Deletion } from "./restore-deleted.ts";
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
      <LiveDataProvider fetcher={fetcher}>
        <EditorApp
          key={data.entry.id}
          fetcher={fetcher}
          entry={data.entry}
          design={data.design}
          wideEnough={wideEnough}
          collection={collection}
        />
      </LiveDataProvider>
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

const initialState = (entry: EditorEntry, design: LoadedDesign): EditorState => ({
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
  const { exit } = useEditorHost();
  const saver = useSave(fetcher, state, dispatch, collection);
  const toasts = React.useMemo(() => createKumoToastManager(), []);
  const [siteStylesOpen, setSiteStylesOpen] = React.useState(false);
  const [device, setDevice] = React.useState<PopupDevice>("desktop");
  const [zoom, setZoom] = React.useState<CanvasZoom>("fit");
  const [scale, setScale] = React.useState(1);
  const [statePreview, setStatePreview] = React.useState<StatePreview | null>(null);
  const onStyleState = React.useCallback((id: string, choice: StyleStateChoice) => {
    setStatePreview(choice === "normal" ? null : { id, state: choice });
  }, []);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [perfOpen, setPerfOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [timelineOpen, setTimelineOpen] = React.useState(false);
  const [a11yOpen, setA11yOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [revertOpen, setRevertOpen] = React.useState(false);
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
  // W-252: undoing a Site styles delete brings the variable or class back with its uses.
  const deletions = React.useRef<Deletion[]>([]);
  const changeDesignRef = React.useRef(changeDesign);
  changeDesignRef.current = changeDesign;
  const pageLayout = state.page.layout;
  React.useEffect(() => {
    if (!pageLayout) return;
    const restored = restoreOnUndo(latest.current.design, pageLayout, deletions.current);
    if (!restored) return;
    changeDesignRef.current(restored).catch((error: unknown) => {
      toasts.add({
        title: error instanceof Error ? error.message : "Couldn't restore the deleted site style.",
      });
    });
  }, [pageLayout, toasts]);
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
    addRecipe,
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
  }, [leaving, exit]);

  const sectionTemplates = useSectionTemplates(state.page.layout, fetcher);
  // W-307: bound fields show live values on the canvas (site settings, preview URL parameters).
  const live = useLiveData();
  // W-308: collection Loops show real entries on the canvas.
  const collections = useCollectionPreviews(state.page.layout, fetcher);
  const rendered = React.useMemo(
    () =>
      state.page.layout
        ? renderPage(state.page.layout, state.design, {
            mode: "editor",
            dynamic: {
              ...(Object.keys(sectionTemplates).length > 0 ? { sectionTemplates } : {}),
              site: live.site,
              params: live.params,
              collections,
            },
            previewDevice: device,
          })
        : null,
    [
      state.page.layout,
      state.design,
      sectionTemplates,
      device,
      live.site,
      live.params,
      collections,
    ],
  );
  const selectedNode =
    state.selectedId && state.page.layout ? findNode(state.page.layout, state.selectedId) : null;
  // W-317: the live accessibility score.
  const a11y = React.useMemo(
    () =>
      state.page.layout ? auditPage(state.page.layout, state.design) : { score: 100, issues: [] },
    [state.page.layout, state.design],
  );
  const applyEdit = (layout: Layout, note: string) => {
    dispatch({
      type: "apply-arranged",
      layout,
      selected: latest.current.selectedId ?? layout.root.id,
    });
    setAnnouncement(note);
    toasts.add({ title: note, description: "Undo takes it back." });
  };

  const shortcutHandlers: ShortcutHandlers = {
    save,
    remove,
    duplicate,
    arrange,
    copy: clipboard.copy,
    paste: clipboard.paste,
    pasteStyle: clipboard.pasteStyle,
    palette: () => setPaletteOpen(true),
  };
  const handlers = React.useRef(shortcutHandlers);
  handlers.current = shortcutHandlers;
  const onKeyDown = useEditorShortcuts({ latest, dispatch, handlers });

  const reload = async () => {
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
  };

  // W-193: a saved draft is dropped on the server; unsaved edits on a published entry only locally.
  const canRevert = state.status === "changed" || (state.status === "published" && dirty);
  const revert = async () => {
    setRevertOpen(false);
    try {
      if (latest.current.status === "changed") {
        await discardDraft(fetcher, collection, latest.current.id, latest.current.rev);
      }
      await reload();
      toasts.add({ title: "Reverted to the published version" });
    } catch (error) {
      toasts.add({
        title: "Couldn't revert",
        description: error instanceof Error ? error.message : String(error),
      });
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
      onPalette={() => setPaletteOpen(true)}
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
              onPreview={(size) => preview(size ?? device)}
              onSave={() => void save()}
              onPublish={() => void publish()}
              stylesUnpublished={state.designUnpublished === true}
              canRevert={canRevert}
              onRevert={() => setRevertOpen(true)}
              tools={
                <>
                  <A11yScoreButton report={a11y} onOpen={() => setA11yOpen(true)} />
                  <Button
                    variant="ghost"
                    shape="square"
                    className="emvb-icon-btn"
                    aria-label="Page weight"
                    title="Page weight"
                    data-emvb-perf-open=""
                    icon={<GaugeIcon aria-hidden="true" />}
                    onClick={() => setPerfOpen(true)}
                  />
                  <Button
                    variant="ghost"
                    shape="square"
                    className="emvb-icon-btn"
                    aria-label="Version timeline"
                    title="Version timeline"
                    data-emvb-timeline-open=""
                    icon={<ClockCounterClockwiseIcon aria-hidden="true" />}
                    onClick={() => setTimelineOpen(true)}
                  />
                </>
              }
            />
            <div className="emvb-frame">
              <aside className="emvb-panel emvb-panel-left" aria-label="Add and Layers">
                <LeftPanel
                  layout={state.page.layout}
                  selectedId={state.selectedId}
                  onSelect={(id) => dispatch({ type: "select", id })}
                  onAdd={addFromPanel}
                  onRecipe={addRecipe}
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
                  zoom={zoom}
                  scale={scale}
                  onZoom={setZoom}
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
                    device={device}
                    zoom={zoom}
                    onScale={setScale}
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
                onDesignItemDeleted={(deletion) => {
                  deletions.current = [...deletions.current.slice(-19), deletion];
                }}
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
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          items={
            paletteOpen
              ? paletteItems({
                  layout: state.page.layout,
                  design: state.design,
                  selected: selectedNode ?? null,
                  formsAvailable,
                  insert: addFromPanel,
                  insertRecipe: addRecipe,
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
                  actions: [
                    { id: "save", label: "Save draft", hint: "Ctrl/Cmd+S", run: () => void save() },
                    { id: "publish", label: "Publish", run: () => void publish() },
                    {
                      id: "preview",
                      label: "Preview",
                      keywords: "open view",
                      run: () => preview(device),
                    },
                    {
                      id: "undo",
                      label: "Undo",
                      hint: "Ctrl/Cmd+Z",
                      run: () => dispatch({ type: "undo" }),
                    },
                    {
                      id: "redo",
                      label: "Redo",
                      hint: "Ctrl/Cmd+Shift+Z",
                      run: () => dispatch({ type: "redo" }),
                    },
                    ...(selectedNode &&
                    state.page.layout &&
                    selectedNode.id !== state.page.layout.root.id
                      ? [
                          {
                            id: "duplicate",
                            label: "Duplicate selected element",
                            hint: "Ctrl/Cmd+D",
                            run: () => duplicate(selectedNode.id),
                          },
                          {
                            id: "delete",
                            label: "Delete selected element",
                            hint: "Delete",
                            run: () => remove(selectedNode.id),
                          },
                        ]
                      : []),
                    {
                      id: "deselect",
                      label: "Clear selection",
                      hint: "Esc",
                      run: () => dispatch({ type: "select", id: null }),
                    },
                    {
                      id: "site-styles",
                      label: "Open Site styles",
                      keywords: "design variables classes colors fonts",
                      run: () => setSiteStylesOpen(true),
                    },
                    {
                      id: "a11y",
                      label: "Check accessibility",
                      hint: `${a11y.score}/100`,
                      keywords: "a11y contrast alt headings audit",
                      run: () => setA11yOpen(true),
                    },
                    {
                      id: "timeline",
                      label: "Version timeline",
                      keywords: "history revisions restore diff",
                      run: () => setTimelineOpen(true),
                    },
                    {
                      id: "weight",
                      label: "Show page weight",
                      keywords: "performance budget size speed",
                      run: () => setPerfOpen(true),
                    },
                    {
                      id: "device-desktop",
                      label: "View on desktop",
                      run: () => setDevice("desktop"),
                    },
                    {
                      id: "device-tablet",
                      label: "View on tablet",
                      run: () => setDevice("tablet"),
                    },
                    {
                      id: "device-mobile",
                      label: "View on mobile",
                      run: () => setDevice("mobile"),
                    },
                    {
                      id: "shortcuts",
                      label: "Keyboard shortcuts",
                      run: () => setShortcutsOpen(true),
                    },
                  ],
                })
              : []
          }
        />
        <A11yDialog
          open={a11yOpen}
          onOpenChange={setA11yOpen}
          report={a11y}
          layout={state.page.layout}
          onSelect={(id) => dispatch({ type: "select", id })}
          onApply={applyEdit}
        />
        <TimelineDialog
          open={timelineOpen}
          onOpenChange={setTimelineOpen}
          fetcher={fetcher}
          collection={collection}
          entryId={state.id}
          current={state.page.layout}
          design={state.design}
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
        <PerfMeterDialog
          open={perfOpen}
          onOpenChange={setPerfOpen}
          layout={state.page.layout}
          design={state.design}
          onSelect={(id) => dispatch({ type: "select", id })}
        />
        <ConflictDialog
          open={saver.conflict}
          onOpenChange={(open) => !open && saver.closeConflict()}
          onReload={() => void reload()}
          onOverwrite={() => void saver.overwrite()}
        />
        <RevertDialog
          open={revertOpen}
          onOpenChange={setRevertOpen}
          onRevert={() => void revert()}
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
  const { exit } = useEditorHost();
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
  const { back } = useEditorHost();
  if (data.state === "not-found" || data.state === "forbidden") {
    return (
      <div className="emvb-state" data-emvb-editor-state={data.state}>
        <Empty
          title={data.state === "not-found" ? "Page not found" : "You can't open this page"}
          description={
            data.state === "not-found"
              ? `It may have been deleted. Choose another page from ${back.label}.`
              : "Your role doesn't allow editing this page."
          }
          contents={
            <Button variant="secondary" onClick={back.go}>
              Go to {back.label}
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
