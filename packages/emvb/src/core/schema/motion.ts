/** Scroll motion effects (W-319). */
export const MOTION_EFFECTS = ["fade", "move-x", "move-y", "scale", "rotate", "blur"] as const;
export type MotionEffect = (typeof MOTION_EFFECTS)[number];
/**
 * Allowed `from`/`to` per effect: opacity %, px offsets, scale %, degrees, blur px (W-319).
 */
export const MOTION_LIMITS: Record<MotionEffect, readonly [number, number]> = {
  fade: [0, 100],
  "move-x": [-1000, 1000],
  "move-y": [-1000, 1000],
  scale: [0, 400],
  rotate: [-720, 720],
  blur: [0, 50],
};
