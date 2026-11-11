import { DEVICE_PREVIEW_PX, WIDE_PREVIEW_PX, type EditorDevice } from "../../../core/index.ts";

/** Fit scales the canvas down to the stage; Actual shows it at 100% and scrolls (W-158). */
export type CanvasZoom = "fit" | "actual";

/**
 * The canvas's page width and on-screen scale (W-158, D-046). Desktop lays the page out at least
 * 1280 px wide (wider when the stage is), Tablet at 768 and Mobile at 390. Fit scales it down to
 * the stage width, never up; Actual keeps 100% and the stage scrolls sideways.
 */
export function canvasScale(
  device: EditorDevice,
  stageWidth: number,
  zoom: CanvasZoom,
): { width: number; scale: number } {
  const base = device === "wide" ? WIDE_PREVIEW_PX : DEVICE_PREVIEW_PX[device];
  const width = device === "desktop" ? Math.max(base, Math.floor(stageWidth)) : base;
  if (zoom === "actual" || stageWidth <= 0) return { width, scale: 1 };
  return { width, scale: Math.min(1, stageWidth / width) };
}
