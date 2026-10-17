import { Button, createKumoToastManager, Empty } from "@cloudflare/kumo";
import {
  ArrowsClockwiseIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  ClockCounterClockwiseIcon,
  GaugeIcon,
  RobotIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import {
  auditPage,
  moveDown,
  moveUp,
  renderPage,
  withPlainText,
  type LayoutNode,
  type PopupDevice,
} from "../../core/index.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import { EditedNounContext, editedNounOf, useEditedNoun } from "./edited-noun.ts";
import { indexLayout } from "../../core/tree-ops.ts";
import type { Fetcher } from "../api.ts";
import { loadFormsCapability } from "../forms-api.ts";
import { CanvasFrame, type CanvasSelection, type CanvasZoom } from "./canvas/CanvasFrame.tsx";
import { DeviceBar } from "./canvas/DeviceBar.tsx";
import type { StatePreview } from "./canvas/state-preview.ts";
import type { StyleStateChoice } from "./panels/settings/StateSwitcher.tsx";
import { EmptyCanvas } from "./canvas/EmptyCanvas.tsx";
import {
  EditorDialogs,
  hideSelectedOnDevice,
  initialState,
  useChromeFlags,
} from "./editor-chrome.tsx";
import { EditorOverlay } from "./EditorOverlay.tsx";
import { EditorToasts } from "./EditorToasts.tsx";
import { useCanvasStyles, useEditorHost } from "./host.ts";
import { LiveDataProvider, siteOrigin, useLiveData } from "./live-data.tsx";
import { newElement } from "./dnd/new-element.ts";
import { editorCommands } from "./editor-commands.ts";
import { ELEMENT_NAMES } from "./element-chrome.ts";
import { LeftPanel } from "./panels/LeftPanel.tsx";
import { SettingsPanel } from "./panels/SettingsPanel.tsx";
import { SmallScreenNotice } from "./SmallScreenNotice.tsx";
import { emptyHistory, historyReducer, isDirty } from "./store.ts";
import { TopBar } from "./TopBar.tsx";
import {
  useEditorData,
  type EditorData,
  type EditorEntry,
  type LoadedDesign,
} from "./useEditorData.ts";
import { EDITOR_MIN_WIDTH_QUERY, useMediaQuery } from "./useMediaQuery.ts";
import { usePartTemplates } from "./section-templates.ts";
import { useCollectionPreviews, withPartLayouts } from "./collection-previews.ts";
import { useRemoteChange } from "./remote-change.ts";
import { A11yScoreButton } from "./A11yCopilot.tsx";
import { restoreOnUndo, type Deletion } from "./restore-deleted.ts";
import { useEditorCommands } from "./useEditorCommands.ts";
import { editableSource } from "../image-editor/load.ts";
import { useSave } from "./useSave.ts";
import { type ShortcutHandlers, useEditorShortcuts } from "./useEditorShortcuts.ts";
import { useNodeActions } from "./useNodeActions.ts";
import { type PasteRefusal, useClipboardActions } from "./useClipboardActions.ts";
import { ListError, LoadingStatus } from "../pages/list-kit.tsx";

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
  return (
    <EditedNounContext.Provider value={editedNounOf(collection)}>
      <EditorBody data={data} fetcher={fetcher} wideEnough={wideEnough} collection={collection} />
    </EditedNounContext.Provider>
  );
}

function EditorBody({
  data,
  fetcher,
  wideEnough,
  collection,
}: {
  data: EditorData;
  fetcher: Fetcher;
  wideEnough: boolean;
  collection: string;
}) {
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
  const host = useEditorHost();
  const canvasStyles = useCanvasStyles(fetcher);
  const { exit } = host;
  const saver = useSave(fetcher, state, dispatch, collection);
  // W-466: tell the person when an agent (or anyone) changed the page while they were idle.
  const remoteChange = useRemoteChange(fetcher, collection, entry.id, state.rev, !dirty);
  const noun = useEditedNoun();
  const toasts = React.useMemo(() => createKumoToastManager(), []);
  const chrome = useChromeFlags();
  const [device, setDevice] = React.useState<PopupDevice>("desktop");
  const [zoom, setZoom] = React.useState<CanvasZoom>("fit");
  const [scale, setScale] = React.useState(1);
  const [statePreview, setStatePreview] = React.useState<StatePreview | null>(null);
  const onStyleState = React.useCallback((id: string, choice: StyleStateChoice) => {
    setStatePreview(choice === "normal" ? null : { id, state: choice });
  }, []);
  const [announcement, setAnnouncement] = React.useState("");
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
    wrap,
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
    if (chrome.leaving) exit();
  }, [chrome.leaving, exit]);

  const { sectionTemplates, loopTemplates } = usePartTemplates(state.page.layout, fetcher);
  const partDynamic = React.useMemo(
    () => ({ sectionTemplates, loopTemplates }),
    [sectionTemplates, loopTemplates],
  );
  // W-307: bound fields show live values on the canvas (site settings, preview URL parameters).
  const live = useLiveData();
  // W-308: collection Loops show real entries on the canvas.
  const previewLayout = React.useMemo(
    () =>
      withPartLayouts(state.page.layout, [
        ...Object.values(sectionTemplates),
        ...Object.values(loopTemplates),
      ]),
    [state.page.layout, sectionTemplates, loopTemplates],
  );
  const collections = useCollectionPreviews(previewLayout, fetcher);
  const rendered = React.useMemo(
    () =>
      state.page.layout
        ? renderPage(state.page.layout, state.design, {
            mode: "editor",
            // Same scope class as the public page, so canvas CSS matches published CSS (W-334).
            scope: state.id,
            dynamic: {
              ...(Object.keys(sectionTemplates).length > 0 ? { sectionTemplates } : {}),
              ...(Object.keys(loopTemplates).length > 0 ? { loopTemplates } : {}),
              site: live.site,
              params: live.params,
              ...(siteOrigin() ? { origin: siteOrigin() } : {}),
              collections,
            },
            previewDevice: device,
          })
        : null,
    [
      state.page.layout,
      state.design,
      sectionTemplates,
      loopTemplates,
      device,
      live.site,
      live.params,
      collections,
    ],
  );
  const layoutIndex = React.useMemo(
    () => (state.page.layout ? indexLayout(state.page.layout) : undefined),
    [state.page.layout],
  );
  const selectedNode =
    state.selectedId && layoutIndex ? (layoutIndex.byId.get(state.selectedId) ?? null) : null;
  // W-317: the live accessibility score.
  const a11y = React.useMemo(
    () =>
      state.page.layout ? auditPage(state.page.layout, state.design) : { score: 100, issues: [] },
    [state.page.layout, state.design],
  );
  const shortcutHandlers: ShortcutHandlers = {
    save,
    remove,
    duplicate,
    arrange,
    copy: clipboard.copy,
    paste: clipboard.paste,
    pasteStyle: clipboard.pasteStyle,
    palette: () => chrome.open("palette"),
  };
  const handlers = React.useRef(shortcutHandlers);
  handlers.current = shortcutHandlers;
  const onKeyDown = useEditorShortcuts({ latest, dispatch, handlers });

  // W-193: a saved draft is dropped on the server; unsaved edits on a published entry only locally.
  const canRevert = state.status === "changed" || (state.status === "published" && dirty);

  const selection: CanvasSelection = {
    selectedId: selectedNode ? state.selectedId : null,
    labelFor: (id) => {
      const node = layoutIndex?.byId.get(id);
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

  const canArrangeSelection =
    !!selectedNode && !!state.page.layout && selectedNode.id !== state.page.layout.root.id;
  const commandRunners = {
    duplicate,
    remove,
    wrap,
    save: () => void save(),
    publish: () => void publish(),
    preview: () => preview(device),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    deselect: () => dispatch({ type: "select", id: null }),
    openSiteStyles: () => chrome.open("siteStyles"),
    openA11y: () => chrome.open("a11y"),
    openTimeline: () => chrome.open("timeline"),
    openShare: () => chrome.open("share"),
    openWeight: () => chrome.open("perf"),
    setDevice,
    openShortcuts: () => chrome.open("shortcuts"),
    toggleHidden: () => hideSelectedOnDevice(state, device, dispatch),
    // W-486: "Edit image" in the palette, for an Image element the editor can open.
    ...(selectedNode?.type === "image" &&
    editableSource(selectedNode.props as Record<string, unknown>, window.location.origin).ok
      ? { editImage: () => chrome.open("imageEditor") }
      : {}),
  };
  const paletteActions = editorCommands({
    surface: "palette",
    targetId: selectedNode ? selectedNode.id : null,
    isRoot: !canArrangeSelection,
    isParent: false,
    device,
    canDuplicate: canArrangeSelection,
    canDelete: canArrangeSelection,
    a11yHint: `${a11y.score}/100`,
    runners: commandRunners,
  });
  const hideOnDevice = editorCommands({
    surface: "device",
    targetId: state.selectedId,
    isRoot: false,
    isParent: false,
    device,
    canDuplicate: false,
    canDelete: false,
    runners: commandRunners,
  })[0];

  return (
    <EditorOverlay
      label={`EmVB editor: ${state.page.title || "Untitled page"}`}
      dirty={dirty && !chrome.leaving}
      onPalette={() => chrome.open("palette")}
    >
      <EditorToasts toastManager={toasts}>
        {remoteChange && (
          <div className="emvb-remote-change" role="status" data-emvb-remote-change={remoteChange}>
            <span className="emvb-remote-change-icon" aria-hidden="true">
              {remoteChange === "agent" ? (
                <RobotIcon size={16} />
              ) : (
                <ArrowsClockwiseIcon size={16} />
              )}
            </span>
            <span className="emvb-remote-change-text">
              <strong>
                {remoteChange === "agent"
                  ? `An AI agent changed this ${noun}.`
                  : `This ${noun} was changed somewhere else.`}
              </strong>{" "}
              <span>Reload to see the latest draft. Its changes are in the version timeline.</span>
            </span>
            <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        )}
        {wideEnough ? (
          <>
            <TopBar
              page={{ title: state.page.title, status: state.status }}
              dirty={dirty}
              status={saver.status}
              busy={busy}
              onExit={() => (dirty ? chrome.open("leave") : exit())}
              onShortcuts={() => chrome.open("shortcuts")}
              onSiteStyles={() => chrome.open("siteStyles")}
              onPreview={(size) => preview(size ?? device)}
              onSave={() => void save()}
              onPublish={() => void publish()}
              stylesUnpublished={state.designUnpublished === true}
              canRevert={canRevert}
              onRevert={() => chrome.open("revert")}
              tools={
                <>
                  {/* UX-084: undo and redo were keyboard-only; toasts already say "Undo takes it back". */}
                  <Button
                    variant="ghost"
                    shape="square"
                    className="emvb-icon-btn"
                    aria-label="Undo"
                    title="Undo (Ctrl/Cmd+Z)"
                    data-emvb-undo=""
                    disabled={history.past.length === 0}
                    icon={<ArrowUUpLeftIcon aria-hidden="true" />}
                    onClick={() => dispatch({ type: "undo" })}
                  />
                  <Button
                    variant="ghost"
                    shape="square"
                    className="emvb-icon-btn"
                    aria-label="Redo"
                    title="Redo (Ctrl/Cmd+Shift+Z)"
                    data-emvb-redo=""
                    disabled={history.future.length === 0}
                    icon={<ArrowUUpRightIcon aria-hidden="true" />}
                    onClick={() => dispatch({ type: "redo" })}
                  />
                  <A11yScoreButton report={a11y} onOpen={() => chrome.open("a11y")} />
                  <Button
                    variant="ghost"
                    shape="square"
                    className="emvb-icon-btn"
                    aria-label="Page weight"
                    title="Page weight"
                    data-emvb-perf-open=""
                    icon={<GaugeIcon aria-hidden="true" />}
                    onClick={() => chrome.open("perf")}
                  />
                  <Button
                    variant="ghost"
                    shape="square"
                    className="emvb-icon-btn"
                    aria-label="Version timeline"
                    title="Version timeline"
                    data-emvb-timeline-open=""
                    icon={<ClockCounterClockwiseIcon aria-hidden="true" />}
                    onClick={() => chrome.open("timeline")}
                  />
                  <Button
                    variant="ghost"
                    shape="square"
                    className="emvb-icon-btn"
                    aria-label="Share as a playground link"
                    title="Share as a playground link"
                    data-emvb-share-open=""
                    icon={<ShareNetworkIcon aria-hidden="true" />}
                    onClick={() => chrome.open("share")}
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
                  hidden={!!selectedNode?.hiddenOn?.includes(device)}
                  canHide={!!hideOnDevice && !hideOnDevice.disabled}
                  hideLabel={hideOnDevice?.label ?? `Hide on ${device}`}
                  onDevice={setDevice}
                  zoom={zoom}
                  scale={scale}
                  onZoom={setZoom}
                  onToggleHidden={() => hideOnDevice?.run()}
                />
                {rendered ? (
                  <CanvasFrame
                    vnode={rendered.vnode}
                    css={rendered.css}
                    canvasStyles={canvasStyles}
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
                siteStylesOpen={chrome.flags.siteStyles}
                onCloseSiteStyles={() => chrome.close("siteStyles")}
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
        <EditorDialogs
          parts={partDynamic}
          chrome={chrome}
          fetcher={fetcher}
          collection={collection}
          state={state}
          latest={latest}
          dispatch={dispatch}
          saver={saver}
          toasts={toasts}
          save={save}
          a11y={a11y}
          canvasStyles={canvasStyles}
          selectedNode={selectedNode ?? null}
          formsAvailable={formsAvailable}
          paletteActions={paletteActions}
          addFromPanel={addFromPanel}
          addRecipe={addRecipe}
          deleteAsk={deleteAsk}
          setDeleteAsk={setDeleteAsk}
          finishDelete={finishDelete}
          playgroundUrl={host.playgroundUrl}
          setAnnouncement={setAnnouncement}
        />
      </EditorToasts>
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
  const noun = useEditedNoun();
  const Noun = noun === "page" ? "Page" : "Theme part";
  if (data.state === "not-found" || data.state === "forbidden") {
    return (
      <div className="emvb-state" data-emvb-editor-state={data.state}>
        <Empty
          title={data.state === "not-found" ? `${Noun} not found` : `You can't open this ${noun}`}
          description={
            data.state === "not-found"
              ? `It may have been deleted. Choose another ${noun} from ${back.label}.`
              : `Your role doesn't allow editing this ${noun}.`
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
        <ListError
          title={`Couldn't open this ${noun}`}
          message={data.message}
          onRetry={data.retry}
        />
      </div>
    );
  }
  return (
    <div className="emvb-state" data-emvb-editor-state="loading">
      <LoadingStatus label={`Opening the ${noun}…`} />
    </div>
  );
}
