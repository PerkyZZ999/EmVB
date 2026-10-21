/**
 * W-848 (D-057): a spin or pulse stops on its own after about 5 seconds (WCAG 2.2.2), so it repeats
 * as many whole times as fit. A pulse alternates, so it runs an even number of times and ends at
 * rest. One spin longer than 5 s, or one pulse there and back longer than 5 s, still runs once.
 */
export const ICON_ANIMATION_LIMIT_MS = 5000;

export function iconAnimationRuns(type: "spin" | "pulse", durationMs: number): number {
  if (type === "spin") return Math.max(1, Math.floor(ICON_ANIMATION_LIMIT_MS / durationMs));
  return 2 * Math.max(1, Math.floor(ICON_ANIMATION_LIMIT_MS / (2 * durationMs)));
}
