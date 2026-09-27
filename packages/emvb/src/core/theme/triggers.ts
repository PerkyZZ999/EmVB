import { z } from "zod";

export const TRIGGERS_SCHEMA_VERSION = 1;
export const MAX_POPUP_TRIGGERS = 8;
const MAX_CLICK_SELECTOR_LENGTH = 200;
const MAX_DELAY_MS = 120_000;
const MAX_SCROLL_PERCENT = 100;
const MAX_SHOW_TIMES = 100;

/** MVP open triggers (Elementor-inspired). Exit-intent / inactivity deferred. */
const PageLoadTrigger = z.strictObject({ type: z.literal("page_load") });
const DelayTrigger = z.strictObject({
  type: z.literal("delay"),
  ms: z.number().int().min(0).max(MAX_DELAY_MS),
});
const ScrollTrigger = z.strictObject({
  type: z.literal("scroll"),
  percent: z.number().int().min(0).max(MAX_SCROLL_PERCENT),
});
const ClickTrigger = z.strictObject({
  type: z.literal("click"),
  selector: z.string().min(1).max(MAX_CLICK_SELECTOR_LENGTH),
});

const PopupOpenTriggerSchema = z.discriminatedUnion("type", [
  PageLoadTrigger,
  DelayTrigger,
  ScrollTrigger,
  ClickTrigger,
]);

export type PopupOpenTrigger = z.infer<typeof PopupOpenTriggerSchema>;

const DeviceSchema = z.enum(["desktop", "tablet", "mobile"]);
export type PopupDevice = z.infer<typeof DeviceSchema>;

/**
 * Advanced rules — MVP-thin (D-TB-11).
 * `showTimes` null = unlimited; `devices` null/empty = all devices.
 */
const AdvancedRulesSchema = z.strictObject({
  showTimes: z.number().int().min(1).max(MAX_SHOW_TIMES).nullable().optional(),
  devices: z.array(DeviceSchema).max(3).nullable().optional(),
});

export type PopupAdvancedRules = z.infer<typeof AdvancedRulesSchema>;

const TriggersDocSchema = z.strictObject({
  schemaVersion: z.literal(TRIGGERS_SCHEMA_VERSION),
  open: z.array(PopupOpenTriggerSchema).min(1).max(MAX_POPUP_TRIGGERS),
  advanced: AdvancedRulesSchema.default({}),
});

export type TriggersDoc = z.infer<typeof TriggersDocSchema>;

/** Default: open on page load (Elementor default). */
export const defaultTriggers = (): TriggersDoc => ({
  schemaVersion: TRIGGERS_SCHEMA_VERSION,
  open: [{ type: "page_load" }],
  advanced: {},
});

export type TriggersValidation =
  | { ok: true; triggers: TriggersDoc }
  | { ok: false; issues: { path: string; code: string; message: string }[] };

export function validateTriggers(raw: unknown): TriggersValidation {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return {
        ok: false,
        issues: [{ path: "triggers", code: "invalid_json", message: "Triggers must be JSON." }],
      };
    }
  }
  const parsed = TriggersDocSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.length ? `triggers.${issue.path.join(".")}` : "triggers",
        code: issue.code,
        message: issue.message,
      })),
    };
  }
  for (const [i, trigger] of parsed.data.open.entries()) {
    if (trigger.type === "click" && !isSafeClickSelector(trigger.selector)) {
      return {
        ok: false,
        issues: [
          {
            path: `triggers.open[${i}].selector`,
            code: "unsafe_selector",
            message: "Click selector may only use simple CSS selectors (no scripts).",
          },
        ],
      };
    }
  }
  return { ok: true, triggers: parsed.data };
}

/**
 * Reject selectors that look like they could smuggle JS or break out of attributes.
 * Public runtime uses querySelector; keep the surface small.
 */
export function isSafeClickSelector(selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed || trimmed.length > MAX_CLICK_SELECTOR_LENGTH) return false;
  if (/[<>`]/.test(trimmed)) return false;
  if (/javascript:/i.test(trimmed)) return false;
  // Allow common CSS selector chars only.
  return /^[a-zA-Z0-9\s\-_.#[\]=,:()>+~*"'|/]+$/.test(trimmed);
}

/** Breakpoints aligned with common Elementor/EmVB device tiers. */
export function deviceForWidth(width: number): PopupDevice {
  if (width < 768) return "mobile";
  if (width < 1025) return "tablet";
  return "desktop";
}

/** True when advanced.devices is unset/empty or includes the current device. */
export function matchesPopupDevices(
  advanced: PopupAdvancedRules | undefined,
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
  advanced: PopupAdvancedRules | undefined,
  timesShown: number,
): boolean {
  const limit = advanced?.showTimes;
  if (limit === null || limit === undefined) return true;
  return timesShown < limit;
}
