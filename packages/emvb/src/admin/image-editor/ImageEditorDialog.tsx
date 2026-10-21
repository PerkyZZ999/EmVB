/**
 * The full-screen image editor (W-482, laid out like photocn's editor in W-483). Loaded on demand
 * from the Image settings; photocn and this file never ship in the main editor chunk or on public
 * pages.
 *
 * The desktop layout (toolbar on top, canvas, resizable sidebar with the tool switcher, histogram
 * and panel) and the compact phone layout (photo first, tools at the bottom, controls in a sheet)
 * follow photocn's `image-editor.tsx`, `layout.tsx` and `compact-layout.tsx`
 * (https://github.com/rbbydotdev/photocn, apps/www/src/registry/image-editor), MIT License,
 * Copyright (c) 2026 rbbydotdev. Rebuilt with Kumo components and EmVB tokens.
 */
import { Badge, Button, Dialog, DropdownMenu, TooltipProvider } from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  ScrollIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { SOLID_PRIMARY, UI_CSS } from "../ui.ts";
import { EditorCanvas } from "./Canvas.tsx";
import {
  aspectRatioOptions,
  errorMessage,
  ImageEditorProvider,
  planEngine,
  useImageEditor,
  useImageEditorState,
} from "./engine.ts";
import { IMAGE_EDITOR_CSS } from "./image-editor-css.ts";
import { Announcer } from "./announce.tsx";
import { withDataUrlFetch } from "./data-url-fetch.ts";
import { ExportDialog, type ExportResult, type ExportSettings } from "./ExportDialog.tsx";
import { fitSourceToGpu } from "./gpu-fit.ts";
import { loadEditableSource, type LoadedSource } from "./load.ts";
import { ImageNameContext } from "./MetadataPanel.tsx";
import { ToolPanel } from "./panels.tsx";
import {
  CompactToolBar,
  CompareButton,
  Histogram,
  RedoButton,
  ResetAllButton,
  ToolSwitcher,
  UndoButton,
} from "./parts.tsx";
import {
  buildImageEdit,
  editedFileName,
  hasGps,
  outputFile,
  parseRecipeFile,
  RECIPE_FILE_MAX_BYTES,
  recipeFileText,
  savedRecipe,
} from "./save.ts";
import { displayName, elementAspectOption, sizeLabel, type ImageEditorToolId } from "./tools.ts";
import type { RenderMode } from "./worker.ts";
import type { ImageEdit } from "../../core/index.ts";

export type ImageEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Image element's props (`src`, `alt`, `edit`, `width`, `height`…). */
  imageProps: Record<string, unknown>;
  /** Tests and the spike force main-thread rendering. */
  forceRenderMode?: RenderMode;
  onClosed?: () => void;
  /**
   * Saves the edited copy (W-485): upload `file` as a new media item and point the element at
   * it with `edit`. Rejecting keeps the editor open with the error and a Retry. Without it the
   * export step only downloads.
   */
  onSave?: (file: File, copy: SavedCopy) => Promise<void>;
};

export type SavedCopy = {
  width: number;
  height: number;
  /** The validated `ImageEdit` record for `props.edit`. */
  edit: ImageEdit;
};

type SaveApi = { open: () => void; enabled: boolean };
const SaveContext = React.createContext<SaveApi>({ open: () => undefined, enabled: false });

/** Below this editor width the compact (phone) layout is used (photocn COMPACT_WIDTH). */
export const COMPACT_WIDTH = 640;

function withoutEdit(props: Record<string, unknown>): Record<string, unknown> {
  const { edit: _edit, ...rest } = props;
  return rest;
}
const SIDEBAR = { default: 338, min: 288, max: 544, canvasMin: 384 };
/** Sheet heights as a fraction of the editor: peek and expanded (photocn SNAP_POINTS). */
const SNAP_POINTS = [0.42, 0.9] as const;

type Ready = {
  source: Extract<LoadedSource, { ok: true }>;
  renderMode: RenderMode;
  spawnWorker?: () => Worker;
  reason?: string;
};
type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "ready"; ready: Ready };

/** The editor's width, measured before paint (null until then). */
function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width || window.innerWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** W-862 (IE-2): download the current edits as a recipe file, or load one onto this picture. */
function useRecipeFile(name: string) {
  const editor = useImageEditor();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const current = editor.recipes.current;
  const download = () => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([recipeFileText(current as Parameters<typeof recipeFileText>[0])], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\.[^.]+$/, "") || "image"}.recipe.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const load = async (file: File | undefined) => {
    if (!file) return;
    // W-881: a huge file picked by mistake isn't read into memory, and a failed apply says so.
    if (file.size > RECIPE_FILE_MAX_BYTES) {
      setError("This file is too large to be an image edit recipe.");
      return;
    }
    try {
      const result = parseRecipeFile(await file.text());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      await editor.recipes.apply(result.recipe as Parameters<typeof editor.recipes.apply>[0]);
    } catch {
      setError("This recipe couldn't be applied to this picture.");
    }
  };
  const pick = () => fileRef.current?.click();
  // W-884: the phone layout's More menu offers the same two items, so both layouts render these.
  const errorNote = error ? (
    <span className="emvb-ie-recipe-error" role="alert" data-emvb-image-recipe-error="">
      <WarningCircleIcon aria-hidden="true" />
      {error}
    </span>
  ) : null;
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      hidden
      aria-label="Load recipe file"
      data-emvb-image-recipe-file=""
      onChange={(event) => {
        const input = event.currentTarget;
        void load(input.files?.[0]).finally(() => {
          input.value = "";
        });
      }}
    />
  );
  return { current, download, pick, errorNote, fileInput };
}

function RecipeMenu({ name }: { name: string }) {
  const editor = useImageEditor();
  const recipe = useRecipeFile(name);
  return (
    <>
      {recipe.errorNote}
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="emvb-ie-btn"
              icon={<ScrollIcon aria-hidden="true" />}
              disabled={editor.disabled || !editor.hasImage}
              data-emvb-image-recipe=""
            >
              Recipe
            </Button>
          }
        />
        <DropdownMenu.Content align="end">
          <RecipeItems recipe={recipe} />
        </DropdownMenu.Content>
      </DropdownMenu>
      {recipe.fileInput}
    </>
  );
}

function RecipeItems({ recipe }: { recipe: ReturnType<typeof useRecipeFile> }) {
  return (
    <>
      <DropdownMenu.Item
        icon={DownloadSimpleIcon}
        disabled={!recipe.current}
        onClick={recipe.download}
      >
        Download recipe
      </DropdownMenu.Item>
      <DropdownMenu.Item icon={FileArrowUpIcon} onClick={recipe.pick}>
        Load recipe…
      </DropdownMenu.Item>
    </>
  );
}

function SaveCopyButton() {
  const save = React.useContext(SaveContext);
  const editor = useImageEditor();
  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      className="emvb-ie-btn"
      style={SOLID_PRIMARY}
      icon={<DownloadSimpleIcon aria-hidden="true" />}
      disabled={!save.enabled || !editor.isReady || editor.disabled}
      onClick={save.open}
      aria-haspopup="dialog"
      data-emvb-image-save=""
    >
      Save copy
    </Button>
  );
}

function CancelButton({ compact = false }: { compact?: boolean }) {
  return (
    <Dialog.Close
      render={(props) =>
        compact ? (
          <Button
            {...props}
            type="button"
            variant="ghost"
            size="sm"
            shape="square"
            className="emvb-ie-btn emvb-ie-btn-icon emvb-ie-touch"
            aria-label="Close editor"
            icon={<XIcon aria-hidden="true" />}
            data-emvb-image-cancel=""
          />
        ) : (
          <Button
            {...props}
            type="button"
            variant="outline"
            size="sm"
            className="emvb-ie-btn"
            data-emvb-image-cancel=""
          >
            Cancel
          </Button>
        )
      }
    />
  );
}

/** Loading or error (photocn ImageEditorStatusBadge), plus the main-thread fallback note. */
function StatusBadge({ renderMode, reason }: { renderMode: RenderMode; reason?: string }) {
  const editor = useImageEditor();
  if (editor.status === "error") {
    const message = errorMessage(editor.error);
    return (
      <span className="emvb-ie-badge" title={message}>
        <Badge variant="error">
          <WarningCircleIcon aria-hidden="true" /> {message}
        </Badge>
      </span>
    );
  }
  if (editor.status === "loading" || editor.status === "idle") {
    return (
      <span className="emvb-ie-badge">
        <Badge variant="neutral">Loading</Badge>
      </span>
    );
  }
  if (renderMode !== "main") return null;
  return (
    <span className="emvb-ie-badge" title={reason} data-emvb-image-mode="main">
      <Badge variant="neutral">Standard preview</Badge>
    </span>
  );
}

/** File name and output size, where photocn has its Open button. */
function FileLabel({ name }: { name: string }) {
  const editor = useImageEditor();
  const size = editor.geometry.outputSize;
  return (
    <span className="emvb-ie-file" data-emvb-image-editor-file="" title={name}>
      <span className="emvb-ie-file-name">{name}</span>
      {size ? (
        <span className="emvb-ie-file-size">{sizeLabel(size.width, size.height)}</span>
      ) : null}
    </span>
  );
}

function DesktopLayout({ ready, name }: { ready: Ready; name: string }) {
  const [sidebar, setSidebar] = React.useState(SIDEBAR.default);
  const workspaceRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ id: number; x: number; start: number } | null>(null);
  const clamp = (w: number) => {
    const total = workspaceRef.current?.getBoundingClientRect().width ?? 0;
    const max = total ? Math.min(SIDEBAR.max, total - SIDEBAR.canvasMin) : SIDEBAR.max;
    return Math.round(Math.max(SIDEBAR.min, Math.min(Math.max(SIDEBAR.min, max), w)));
  };
  return (
    <div className="emvb-ie-layout" data-slot="image-editor-layout">
      <div className="emvb-ie-toolbar" data-slot="editor-toolbar">
        <UndoButton />
        <RedoButton />
        <FileLabel name={name} />
        <StatusBadge renderMode={ready.renderMode} reason={ready.reason} />
        {ready.source.reducedFrom ? (
          <span
            className="emvb-ie-badge"
            data-emvb-image-reduced=""
            title={`The original is ${sizeLabel(ready.source.reducedFrom.width, ready.source.reducedFrom.height)}, more than this browser can edit. The copy is saved at the reduced size; the original stays untouched.`}
          >
            <Badge variant="neutral">Reduced to fit</Badge>
          </span>
        ) : null}
        <div className="emvb-ie-toolbar-end">
          <RecipeMenu name={name} />
          <ResetAllButton />
          <CompareButton />
          <CancelButton />
          <SaveCopyButton />
        </div>
      </div>
      <div
        className="emvb-ie-workspace"
        ref={workspaceRef}
        style={{ gridTemplateColumns: `minmax(0, 1fr) 0 ${sidebar}px` }}
        data-slot="editor-workspace"
      >
        <main className="emvb-ie-main" data-slot="editor-canvas">
          <EditorCanvas alt={name} />
        </main>
        <div
          className="emvb-ie-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the sidebar"
          aria-valuemin={SIDEBAR.min}
          aria-valuemax={SIDEBAR.max}
          aria-valuenow={sidebar}
          tabIndex={0}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 48 : 16;
            if (event.key === "ArrowLeft") setSidebar((w) => clamp(w + step));
            else if (event.key === "ArrowRight") setSidebar((w) => clamp(w - step));
            else return;
            event.preventDefault();
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.current = { id: event.pointerId, x: event.clientX, start: sidebar };
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (d?.id === event.pointerId) setSidebar(clamp(d.start - (event.clientX - d.x)));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <span aria-hidden="true" />
        </div>
        <aside className="emvb-ie-sidebar" data-slot="editor-sidebar">
          <div className="emvb-ie-sidebar-tools">
            <ToolSwitcher />
          </div>
          <Histogram />
          <ToolPanel />
        </aside>
      </div>
    </div>
  );
}

/** A non-modal bottom sheet: the photo stays touchable, e.g. to drag the crop frame. */
function PanelSheet({
  open,
  onOpenChange,
  snap,
  onSnapChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snap: number;
  onSnapChange: (snap: number) => void;
  label: string;
  children: React.ReactNode;
}) {
  const drag = React.useRef<{
    pointerId: number;
    startY: number;
    startSnap: number;
    latest: number | null;
  } | null>(null);
  const [dragSnap, setDragSnap] = React.useState<number | null>(null);
  const height = dragSnap ?? snap;
  const onGripKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const [peek, expanded] = SNAP_POINTS;
    const key = event.key;
    let next: number | "close" | null = null;
    if (key === "ArrowUp" || key === "PageUp") next = expanded;
    else if (key === "ArrowDown" || key === "PageDown") next = snap > peek ? peek : "close";
    else if (key === "Home") next = peek;
    else if (key === "End") next = expanded;
    if (next === null) return;
    event.preventDefault();
    if (next === "close") onOpenChange(false);
    else onSnapChange(next);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    // W-748: a quick flick can release before React re-renders with the last move.
    const released = d.latest ?? snap;
    setDragSnap(null);
    if (released < SNAP_POINTS[0] * 0.6) {
      onOpenChange(false);
      return;
    }
    onSnapChange(
      SNAP_POINTS.reduce((best, point) =>
        Math.abs(point - released) < Math.abs(best - released) ? point : best,
      ),
    );
  };
  return (
    <section
      aria-hidden={!open}
      aria-label={`${label} controls`}
      className="emvb-ie-sheet"
      data-open={open || undefined}
      data-dragging={dragSnap === null ? undefined : ""}
      data-emvb-image-sheet={open ? "open" : "closed"}
      inert={!open}
      style={{ height: `${height * 100}%` }}
    >
      <div
        aria-label="Resize panel"
        aria-orientation="horizontal"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(height * 100)}
        aria-valuetext={
          height === SNAP_POINTS[1] ? "Expanded" : height === SNAP_POINTS[0] ? "Peek" : undefined
        }
        className="emvb-ie-sheet-grip"
        role="separator"
        tabIndex={0}
        onKeyDown={onGripKey}
        onPointerCancel={onPointerUp}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startSnap: snap,
            latest: null,
          };
        }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (!d || d.pointerId !== event.pointerId) return;
          const container = event.currentTarget.closest(".emvb-ie-compact");
          const containerHeight = container?.clientHeight || window.innerHeight;
          const next = d.startSnap - (event.clientY - d.startY) / containerHeight;
          d.latest = Math.min(0.96, Math.max(0.08, next));
          setDragSnap(d.latest);
        }}
        onPointerUp={onPointerUp}
      >
        <span />
      </div>
      {children}
    </section>
  );
}

function CompactLayout({ name }: { name: string }) {
  const editor = useImageEditor();
  const recipe = useRecipeFile(name);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [rootHeight, setRootHeight] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    setRootHeight(element.getBoundingClientRect().height);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRootHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [snap, setSnap] = React.useState<number>(SNAP_POINTS[0]);
  const selectTool = (tool: ImageEditorToolId) => {
    if (tool === editor.tool) {
      setPanelOpen((open) => !open);
      return;
    }
    editor.setTool(tool);
    setPanelOpen(true);
    setSnap(SNAP_POINTS[0]);
  };
  const closePanel = () => {
    rootRef.current
      ?.querySelector<HTMLButtonElement>(':scope > nav [aria-pressed="true"]')
      ?.focus();
    setPanelOpen(false);
  };
  // Keep the photo above the sheet: pad the canvas by the sheet's peek height.
  const inset = panelOpen && rootHeight ? Math.max(0, rootHeight * SNAP_POINTS[0] - 28) : undefined;
  const label =
    editor.tool === "compose" ? "Crop" : editor.tool.charAt(0).toUpperCase() + editor.tool.slice(1);
  return (
    <div className="emvb-ie-compact" ref={rootRef} data-slot="image-editor-compact">
      <header className="emvb-ie-compact-head">
        <UndoButton className="emvb-ie-touch" />
        <RedoButton className="emvb-ie-touch" />
        <div className="emvb-ie-toolbar-end">
          <CompareButton showLabel={false} />
          <SaveCopyButton />
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  shape="square"
                  size="sm"
                  aria-label="More"
                  className="emvb-ie-btn emvb-ie-btn-icon emvb-ie-touch"
                  icon={<DotsThreeIcon aria-hidden="true" weight="bold" />}
                  data-emvb-image-more=""
                />
              }
            />
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item
                icon={ArrowCounterClockwiseIcon}
                variant="danger"
                disabled={!editor.hasImage || editor.recipes.current === null}
                onClick={() => editor.resetAll()}
              >
                Reset all edits
              </DropdownMenu.Item>
              <RecipeItems recipe={recipe} />
            </DropdownMenu.Content>
          </DropdownMenu>
          {recipe.fileInput}
          <CancelButton compact />
        </div>
      </header>
      {recipe.errorNote ? <div className="emvb-ie-compact-note">{recipe.errorNote}</div> : null}
      <div className="emvb-ie-compact-canvas" style={{ paddingBottom: inset }}>
        <EditorCanvas alt={name} padding={12} />
      </div>
      <CompactToolBar onSelect={selectTool} disabled={!editor.hasImage || editor.disabled} />
      <PanelSheet
        label={label}
        open={panelOpen}
        onOpenChange={(next) => (next ? setPanelOpen(true) : closePanel())}
        snap={snap}
        onSnapChange={setSnap}
      >
        <div className="emvb-ie-sheet-tools">
          <CompactToolBar
            className="emvb-ie-compact-tools-inline"
            disabled={editor.disabled}
            onSelect={(tool) => editor.setTool(tool)}
          />
          <Button
            type="button"
            variant="ghost"
            shape="square"
            size="sm"
            aria-label="Close panel"
            className="emvb-ie-btn emvb-ie-btn-icon emvb-ie-touch"
            icon={<XIcon aria-hidden="true" />}
            onClick={closePanel}
          />
        </div>
        {/* Focusable so the keyboard can scroll a panel with no controls (Metadata, W-486). */}
        <div className="emvb-ie-sheet-body" tabIndex={0} role="region" aria-label={label}>
          <ToolPanel />
        </div>
      </PanelSheet>
    </div>
  );
}

function EditorView({
  ready,
  imageProps,
  escapeRef,
  onSave,
  onSaved,
}: {
  ready: Ready;
  imageProps: Record<string, unknown>;
  escapeRef: React.MutableRefObject<(() => void) | null>;
  onSave?: (file: File, copy: SavedCopy) => Promise<void>;
  onSaved: () => void;
}) {
  const fitValue = elementAspectOption(imageProps.width, imageProps.height);
  const fitKey = fitValue ? `${fitValue.value}|${fitValue.label}` : "";
  // A stable list: a new one each render would look like new options to the hook.
  const options = React.useMemo(
    () => (fitValue ? withElementOption(fitValue) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitKey stands for fitValue.
    [fitKey],
  );
  const editor = useImageEditorState({
    src: ready.source.blob,
    decodeOptions: { name: ready.source.name, type: ready.source.type },
    renderMode: ready.renderMode,
    ...(ready.spawnWorker ? { spawnWorker: ready.spawnWorker } : {}),
    defaultTool: "adjust",
    ...(options ? { aspectRatioOptions: options } : {}),
  });
  // Esc leaves corner editing before it closes the editor.
  const { editingCorners, setEditingCorners } = editor.geometry;
  escapeRef.current = editingCorners ? () => setEditingCorners(false) : null;
  const mainThread = ready.renderMode === "main";
  // Re-opening an edited picture: the original is loaded, then the saved recipe goes back on.
  const applied = React.useRef(false);
  const { isReady, recipes } = editor;
  React.useEffect(() => {
    if (!isReady || applied.current) return;
    applied.current = true;
    const recipe = ready.source.fromOriginal ? savedRecipe(imageProps) : null;
    if (!recipe) return;
    const task = () => recipes.apply(recipe as Parameters<typeof recipes.apply>[0]);
    void (mainThread ? withDataUrlFetch(task) : task()).catch(() => undefined);
  }, [isReady, recipes, imageProps, ready.source.fromOriginal, mainThread]);
  const [gps, setGps] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    void hasGps(ready.source.blob).then(
      (found) => alive && setGps(found),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [ready.source.blob]);
  const [exportOpen, setExportOpen] = React.useState(false);
  const save = React.useMemo<SaveApi>(
    () => ({ open: () => setExportOpen(true), enabled: Boolean(onSave) }),
    [onSave],
  );
  const currentRecipe = editor.recipes.current;
  const saveCopy = async (result: ExportResult, settings: ExportSettings) => {
    if (!onSave) return;
    // W-493: with the original gone, the copy becomes the new original of this edit.
    const base = ready.source.originalMissing ? withoutEdit(imageProps) : imageProps;
    const built = buildImageEdit({ imageProps: base, recipe: currentRecipe, output: settings });
    if (!built.ok) throw new Error(built.message);
    const name = editedFileName(ready.source.name, settings.format);
    const { file } = await outputFile(result.blob, name, settings.format, settings.stripGps);
    try {
      await onSave(file, { width: result.width, height: result.height, edit: built.edit });
    } catch (caught) {
      const why = caught instanceof Error && caught.message ? ` ${caught.message}` : "";
      throw new Error(`Couldn't save the copy.${why}`, { cause: caught });
    }
    setExportOpen(false);
    onSaved();
  };
  const width = useWidth(editor.rootRef);
  const compact = width !== null && width < COMPACT_WIDTH;
  const name = displayName(ready.source.name, imageProps.alt);
  return (
    <ImageEditorProvider editor={editor}>
      <SaveContext.Provider value={save}>
        <ImageNameContext.Provider value={name}>
          <div
            className="emvb-ie"
            ref={editor.rootRef}
            data-emvb-dialog="image-editor"
            data-emvb-image-editor={
              editor.status === "error" ? "error" : editor.isReady ? "ready" : "loading"
            }
            data-emvb-render-mode={ready.renderMode}
            data-layout={compact ? "compact" : "desktop"}
            data-emvb-image-tool-active={editor.tool}
          >
            {width === null ? null : compact ? (
              <CompactLayout name={name} />
            ) : (
              <DesktopLayout ready={ready} name={name} />
            )}
            <Announcer />
          </div>
          {exportOpen ? <div className="emvb-ie-scrim" aria-hidden="true" /> : null}
          {onSave ? (
            <ExportDialog
              open={exportOpen}
              onOpenChange={setExportOpen}
              mainThread={mainThread}
              sourceHasGps={gps}
              sourceType={ready.source.blob.type}
              downloadName={editedFileName(ready.source.name, "jpeg")}
              onSave={saveCopy}
            />
          ) : null}
        </ImageNameContext.Provider>
      </SaveContext.Provider>
    </ImageEditorProvider>
  );
}

/** photocn's presets with "Fit this element" after Original (W-483). */
function withElementOption(fit: { value: string; label: string }) {
  const rest = aspectRatioOptions.filter((o) => o.value !== fit.value);
  const at = rest.findIndex((o) => o.value === "original") + 1;
  return [...rest.slice(0, at), fit, ...rest.slice(at)];
}

/** Before the picture loads, or when it can't: the same frame with a message in the stage. */
function StateFrame({
  phase,
  onRetry,
}: {
  phase: Exclude<Phase, { kind: "ready" }>;
  onRetry: () => void;
}) {
  return (
    <div
      className="emvb-ie"
      data-emvb-dialog="image-editor"
      data-emvb-image-editor={phase.kind}
      data-layout="desktop"
    >
      <div className="emvb-ie-layout">
        <div className="emvb-ie-toolbar">
          <span className="emvb-ie-file">
            <span className="emvb-ie-file-name">
              {phase.kind === "error" ? "Couldn't open the picture" : "Opening the picture…"}
            </span>
          </span>
          <div className="emvb-ie-toolbar-end">
            <CancelButton />
          </div>
        </div>
        <main className="emvb-ie-main emvb-ie-main-solo">
          <div className="emvb-ie-stage emvb-ie-stage-message">
            {phase.kind === "loading" ? (
              <div className="emvb-ie-loading" aria-busy="true">
                <span className="emvb-ie-spinner" aria-hidden="true" />
                <span className="emvb-ie-sr">Opening the picture…</span>
              </div>
            ) : (
              <div className="emvb-ie-error" role="alert" data-emvb-image-error="">
                <span className="emvb-ie-error-icon" aria-hidden="true">
                  <WarningCircleIcon weight="duotone" />
                </span>
                <h3>Can't edit this picture</h3>
                <p>{phase.message}</p>
                {phase.retry ? (
                  <Button variant="outline" size="sm" className="emvb-ie-btn" onClick={onRetry}>
                    Try again
                  </Button>
                ) : (
                  <Dialog.Close
                    render={(props) => (
                      <Button {...props} variant="outline" size="sm" className="emvb-ie-btn">
                        Back to the page
                      </Button>
                    )}
                  />
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Editor({
  imageProps,
  forceRenderMode,
  escapeRef,
  onSave,
  onSaved,
}: {
  imageProps: Record<string, unknown>;
  forceRenderMode?: RenderMode;
  escapeRef: React.MutableRefObject<(() => void) | null>;
  onSave?: (file: File, copy: SavedCopy) => Promise<void>;
  onSaved: () => void;
}) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setPhase({ kind: "loading" });
    void (async () => {
      const source = await loadEditableSource(imageProps, window.location.origin);
      if (!alive) return;
      if (!source.ok) {
        setPhase({ kind: "error", message: source.message, retry: source.reason === "network" });
        return;
      }
      const plan = await planEngine(forceRenderMode ? { force: forceRenderMode } : {});
      if (!alive) return;
      if (!plan.ok) {
        setPhase({ kind: "error", message: plan.message, retry: false });
        return;
      }
      const fitted = await fitSourceToGpu(source).catch(() => null);
      if (!alive) return;
      if (!fitted) {
        setPhase({
          kind: "error",
          retry: false,
          message: "This picture is too large to edit in the browser. Use a smaller copy.",
        });
        return;
      }
      setPhase({
        kind: "ready",
        ready: {
          source: fitted,
          renderMode: plan.renderMode,
          ...(plan.spawnWorker ? { spawnWorker: plan.spawnWorker } : {}),
          ...(plan.reason ? { reason: plan.reason } : {}),
        },
      });
    })().catch((error: unknown) => {
      if (alive) {
        setPhase({
          kind: "error",
          retry: true,
          message: `Couldn't open this picture${error instanceof Error && error.message ? `: ${error.message}` : "."}`,
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [imageProps, forceRenderMode, attempt]);
  if (phase.kind !== "ready") {
    return <StateFrame phase={phase} onRetry={() => setAttempt((n) => n + 1)} />;
  }
  return (
    <EditorView
      key={attempt}
      ready={phase.ready}
      imageProps={imageProps}
      escapeRef={escapeRef}
      onSave={onSave}
      onSaved={onSaved}
    />
  );
}

export default function ImageEditorDialog({
  open,
  onOpenChange,
  imageProps,
  forceRenderMode,
  onClosed,
  onSave,
}: ImageEditorDialogProps) {
  const escapeRef = React.useRef<(() => void) | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        // photocn's Esc leaves the corner handles; it shouldn't also close the editor.
        const leave = escapeRef.current;
        if (!next && leave && details?.reason === "escape-key") {
          leave();
          return;
        }
        onOpenChange(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
      }}
    >
      <Dialog className="emvb-image-editor-popup" data-emvb-image-editor-popup="">
        <style>{UI_CSS + IMAGE_EDITOR_CSS}</style>
        <Dialog.Title className="emvb-ie-sr" data-emvb-dialog="image-editor-shell">
          Edit image
        </Dialog.Title>
        <Dialog.Description className="emvb-ie-sr">
          Crop, rotate and adjust a copy of this picture.
        </Dialog.Description>
        <TooltipProvider>
          {open ? (
            <Editor
              imageProps={imageProps}
              forceRenderMode={forceRenderMode}
              escapeRef={escapeRef}
              onSave={onSave}
              onSaved={() => onOpenChange(false)}
            />
          ) : null}
        </TooltipProvider>
      </Dialog>
    </Dialog.Root>
  );
}
