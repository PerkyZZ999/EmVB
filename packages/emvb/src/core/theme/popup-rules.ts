// No zod here: the public popup runtime imports this file, and pages with popups should only
// ship the runtime.

/** Trigger limits shared by the triggers schema, the editor fields and the public runtime. */
export const TRIGGER_LIMITS = {
  maxDelayMs: 120_000,
  maxScrollPercent: 100,
  minIdleMs: 1_000,
  maxClickSelectorLength: 200,
} as const;

export const POPUP_DEVICES = ["desktop", "tablet", "mobile"] as const;
export type PopupDevice = (typeof POPUP_DEVICES)[number];

/**
 * W-956: the devices a page is edited, previewed and hidden on: Laptop sits between Desktop and
 * Tablet. Popup targeting and visitor rules keep Desktop, Tablet and Mobile (a laptop is desktop).
 */
export const DEVICES = ["desktop", "laptop", "tablet", "mobile"] as const;
export type Device = (typeof DEVICES)[number];

/** Device override layers, widest first; each narrower one wins over the wider ones. */
export const STYLE_DEVICES = ["laptop", "tablet", "mobile"] as const;
export type StyleDevice = (typeof STYLE_DEVICES)[number];

/**
 * Widths that agree with `deviceForWidth` (W-096). The canvas lays the page out at 1280 on
 * desktop (at least), 768 on tablet and 390 on mobile, scaled to fit (W-158, D-046); Preview opens
 * the same widths. Public CSS uses the matching max-width queries.
 */
export const DEVICE_PREVIEW_PX = { desktop: 1280, laptop: 1200, tablet: 768, mobile: 390 } as const;

/**
 * Public CSS queries. Bounds match `deviceForWidth`: below 768 mobile, below 1025 tablet.
 * W-506: zoom and display scaling give fractional viewport widths; with whole-pixel bounds a
 * width such as 1024.5 matched neither the tablet nor the desktop "hide" query, so an element
 * hidden on both showed. The max bounds sit just under the next device's min (as Bootstrap does).
 */
export const DEVICE_MEDIA = {
  /** W-956: laptops are 1025 to 1366 px wide. */
  laptop: "(max-width: 1366.98px)",
  tablet: "(max-width: 1024.98px)",
  mobile: "(max-width: 767.98px)",
  /** Hidden on Desktop and Laptop: every page saved before W-956 that hid on Desktop. */
  hideDesktop: "(min-width: 1025px)",
  hideDesktopOnly: "(min-width: 1367px)",
  hideLaptop: "(min-width: 1025px) and (max-width: 1366.98px)",
  hideTablet: "(min-width: 768px) and (max-width: 1024.98px)",
  hideMobile: "(max-width: 767.98px)",
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
