/**
 * The image stage (W-483). In the crop tool it shows the whole image dimmed around the crop frame;
 * in every other tool it shows the result, with pinch or Ctrl/⌘-scroll zoom and press-and-hold to
 * compare.
 *
 * Ported from photocn's `canvas.tsx` (https://github.com/rbbydotdev/photocn,
 * apps/www/src/registry/image-editor), MIT License, Copyright (c) 2026 rbbydotdev. Dropping and
 * opening files are left out: the editor opens the Image element's picture.
 */
import {
  CircleNotchIcon,
  CornersOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react";
import { IconButton } from "./parts.tsx";
import * as React from "react";
import { BlurFocus } from "./BlurFocus.tsx";
import { CornerHandlesOverlay, CropFrameOverlay } from "./CropOverlay.tsx";
import {
  blendViews,
  fitView,
  rectToStage,
  type StageSize,
  type StageView,
} from "./crop-geometry.ts";
import { useImageEditor } from "./engine.ts";

type UserView = { scale: number; x: number; y: number };
const IDENTITY_VIEW: UserView = { scale: 1, x: 0, y: 0 };
const MAX_ZOOM = 8;
/** W-861 (IE-6): one Zoom in or Zoom out press. */
const ZOOM_STEP = 1.5;

/** Zoom by `factor` keeping the stage point (cx, cy) still; back to 1 is the plain fit. */
function zoomAt(prev: UserView, factor: number, cx: number, cy: number): UserView {
  const scale = Math.min(MAX_ZOOM, Math.max(1, prev.scale * factor));
  if (scale === 1) return IDENTITY_VIEW;
  const f = scale / prev.scale;
  return { scale, x: cx - (cx - prev.x) * f, y: cy - (cy - prev.y) * f };
}
const SETTLE_MS = 240;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function EditorCanvas({ alt, padding = 24 }: { alt: string; padding?: number }) {
  const editor = useImageEditor();
  const { geometry } = editor;
  const [stage, setStage] = React.useState<StageSize | null>(null);
  const [frozenView, setFrozenView] = React.useState<StageView | null>(null);
  // After a drag, ease from the frozen view to the re-fitted one (Photos-style).
  const [settle, setSettle] = React.useState<{ from: StageView; start: number } | null>(null);
  const [, setFrame] = React.useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const freezeView = (next: StageView | null) => {
    if (next === null && frozenView && !reducedMotion) {
      setSettle({ from: frozenView, start: performance.now() });
    } else if (next !== null) {
      setSettle(null);
    }
    setFrozenView(next);
  };
  React.useEffect(() => {
    if (!settle) return;
    let raf = 0;
    const tick = () => {
      if (performance.now() - settle.start >= SETTLE_MS) {
        setSettle(null);
        return;
      }
      setFrame((frame) => frame + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settle]);
  const [userView, setUserView] = React.useState<UserView>(IDENTITY_VIEW);
  const stageRef = editor.stageRef;
  const isCropView = geometry.view === "full";
  const isCorners = geometry.editingCorners;

  React.useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStage((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [stageRef, editor.imageSrc]);

  // A new image, or switching between crop and result, starts un-zoomed.
  const viewKey = `${editor.imageSrc}|${geometry.view}`;
  const [trackedKey, setTrackedKey] = React.useState(viewKey);
  if (viewKey !== trackedKey) {
    setTrackedKey(viewKey);
    setUserView(IDENTITY_VIEW);
    setFrozenView(null);
    setSettle(null);
  }

  const oriented = geometry.orientedSize;
  let view: StageView | null = null;
  if (stage && oriented) {
    if (frozenView) {
      view = frozenView;
    } else if (isCropView) {
      // The frame stays put: fit the crop (or, while dragging corners, the whole image) and let
      // the image move and zoom under it.
      view = fitView(isCorners ? geometry.bounds : geometry.crop, oriented, stage, padding * 1.5);
      if (settle) {
        const t = Math.min(1, (performance.now() - settle.start) / SETTLE_MS);
        view = blendViews(settle.from, view, stage, easeOutCubic(t));
      }
    } else {
      const fit = fitView(geometry.displayRect, oriented, stage, padding);
      view = {
        k: fit.k * userView.scale,
        ox: fit.ox * userView.scale + userView.x,
        oy: fit.oy * userView.scale + userView.y,
      };
    }
  }
  const canvasBox = view && oriented ? rectToStage(view, oriented, geometry.displayRect) : null;

  // Ctrl/⌘-scroll or pinch zooms the result; plain scroll pans once zoomed.
  const zoomRef = React.useRef<(event: WheelEvent) => void>(() => undefined);
  zoomRef.current = (event: WheelEvent) => {
    if (isCropView || !stage || !stageRef.current) return;
    const zooming = event.ctrlKey || event.metaKey;
    if (!zooming && userView.scale === 1) return;
    event.preventDefault();
    const rect = stageRef.current.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    setUserView((prev) => {
      if (!zooming) return { ...prev, x: prev.x - event.deltaX, y: prev.y - event.deltaY };
      return zoomAt(prev, Math.exp(-event.deltaY * 0.01), cx, cy);
    });
  };
  React.useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => zoomRef.current(event);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [stageRef, editor.imageSrc]);

  // Press and hold the result to see the original.
  const comparePointer = React.useRef<number | null>(null);
  const canCompare = !isCropView && editor.tool !== "blur" && !editor.disabled;
  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canCompare || (event.pointerType === "mouse" && event.button !== 0)) return;
    comparePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    editor.compare.setActive(true);
  };
  const endCompare = (event: React.PointerEvent<HTMLDivElement>) => {
    if (comparePointer.current !== event.pointerId) return;
    comparePointer.current = null;
    editor.compare.setActive(false);
  };

  return (
    <div
      className="emvb-ie-canvas"
      data-slot="image-editor-canvas"
      data-settling={settle ? "" : undefined}
      data-view={isCropView ? "crop" : "result"}
      data-emvb-image-view={isCropView ? "crop" : "result"}
    >
      <div
        className="emvb-ie-stage"
        data-slot="image-editor-stage"
        onPointerCancel={endCompare}
        onPointerDown={onStagePointerDown}
        onPointerUp={endCompare}
        ref={stageRef}
      >
        {/* A canvas handed to the render worker can't be reused; canvasKey mounts a fresh one. */}
        <canvas
          aria-label={alt}
          className="emvb-ie-canvas-el"
          data-emvb-image-canvas=""
          key={editor.canvasKey}
          ref={editor.canvasRef}
          role="img"
          style={
            canvasBox
              ? {
                  left: canvasBox.left,
                  top: canvasBox.top,
                  width: canvasBox.width,
                  height: canvasBox.height,
                }
              : { visibility: "hidden" }
          }
        />
        {!editor.isReady && editor.status !== "error" ? (
          <div className="emvb-ie-loading" aria-busy="true">
            <CircleNotchIcon aria-hidden="true" />
            <span className="emvb-ie-sr">Opening the picture…</span>
          </div>
        ) : null}
        {view && stage && isCropView && !isCorners ? (
          <CropFrameOverlay
            disabled={editor.disabled}
            geometry={geometry}
            onFreezeView={freezeView}
            stage={stage}
            view={view}
          />
        ) : null}
        {view && stage && isCropView && isCorners ? (
          <CornerHandlesOverlay
            disabled={editor.disabled}
            geometry={geometry}
            onFreezeView={freezeView}
            stage={stage}
            view={view}
          />
        ) : null}
        {canvasBox && !isCropView && editor.tool === "blur" && editor.isReady ? (
          <div
            className="emvb-ie-overlay-box"
            style={{
              left: canvasBox.left,
              top: canvasBox.top,
              width: canvasBox.width,
              height: canvasBox.height,
            }}
          >
            <BlurFocus
              centerX={editor.blur.value.centerX}
              centerY={editor.blur.value.centerY}
              disabled={editor.disabled}
              onChange={editor.blur.setCenter}
              onCommit={editor.blur.commitCenter}
            />
          </div>
        ) : null}
        {!isCropView ? (
          // W-861 (IE-6): Zoom out, Zoom in and Fit, as photocn's toolbar actions; Ctrl/⌘-scroll
          // and pinch still zoom too.
          <div
            className="emvb-ie-zoom"
            role="group"
            aria-label="Zoom"
            data-emvb-image-zoom={Math.round(userView.scale * 100)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <IconButton
              label="Zoom out"
              variant="outline"
              icon={<MagnifyingGlassMinusIcon aria-hidden="true" />}
              disabled={editor.disabled || userView.scale <= 1}
              onClick={() =>
                setUserView((prev) =>
                  zoomAt(prev, 1 / ZOOM_STEP, (stage?.width ?? 0) / 2, (stage?.height ?? 0) / 2),
                )
              }
              data-emvb-image-zoom-out=""
            />
            <IconButton
              label="Zoom in"
              variant="outline"
              icon={<MagnifyingGlassPlusIcon aria-hidden="true" />}
              disabled={editor.disabled || !editor.isReady || userView.scale >= MAX_ZOOM}
              onClick={() =>
                setUserView((prev) =>
                  zoomAt(prev, ZOOM_STEP, (stage?.width ?? 0) / 2, (stage?.height ?? 0) / 2),
                )
              }
              data-emvb-image-zoom-in=""
            />
            {userView !== IDENTITY_VIEW ? (
              <IconButton
                label="Fit to screen"
                variant="outline"
                icon={<CornersOutIcon aria-hidden="true" />}
                onClick={() => setUserView(IDENTITY_VIEW)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
