// No zod here: the public popup runtime imports this file, and pages with popups should only
// ship the runtime.

/** Trigger limits shared by the triggers schema, the editor fields and the public runtime. */
export const TRIGGER_LIMITS = {
  maxDelayMs: 120_000,
  maxScrollPercent: 100,
  minIdleMs: 1_000,
} as const;

export const POPUP_DEVICES = ["desktop", "tablet", "mobile"] as const;
export type PopupDevice = (typeof POPUP_DEVICES)[number];

/**
 * Widths that agree with `deviceForWidth` (W-096). The canvas lays the page out at 1280 on
 * desktop (at least), 768 on tablet and 390 on mobile, scaled to fit (W-158, D-046); Preview opens
 * the same widths. Public CSS uses the matching max-width queries.
 */
export const DEVICE_PREVIEW_PX = { desktop: 1280, tablet: 768, mobile: 390 } as const;

/** Public CSS queries. Bounds match `deviceForWidth`: 767 mobile, 1024 tablet, 1025 desktop. */
export const DEVICE_MEDIA = {
  tablet: "(max-width: 1024px)",
  mobile: "(max-width: 767px)",
  hideDesktop: "(min-width: 1025px)",
  hideTablet: "(min-width: 768px) and (max-width: 1024px)",
  hideMobile: "(max-width: 767px)",
} as const;

/** A scroll percent as a number from 0 to 100; anything unreadable is 0. */
export const clampScrollPercent = (value: unknown): number =>
  Math.min(TRIGGER_LIMITS.maxScrollPercent, Math.max(0, Number(value) || 0));

/** Breakpoints aligned with common Elementor/EmVB device tiers. */
export function deviceForWidth(width: number): PopupDevice {
  if (width < 768) return "mobile";
  if (width < 1025) return "tablet";
  return "desktop";
}

/** True when advanced.devices is unset/empty or includes the current device. */
export function matchesPopupDevices(
  advanced: { devices?: readonly PopupDevice[] | null | undefined } | undefined,
  width: number,
): boolean {
  const devices = advanced?.devices;
  if (!devices || devices.length === 0) return true;
  return devices.includes(deviceForWidth(width));
}

/**
 * Pure check for show-times (localStorage count is supplied by the runtime).
 * `null`/`undefined` showTimes = unlimited.
 */
export function withinShowTimes(
  advanced: { showTimes?: number | null | undefined } | undefined,
  timesShown: number,
): boolean {
  const limit = advanced?.showTimes;
  if (limit === null || limit === undefined) return true;
  return timesShown < limit;
}
