import { z } from "zod";
import { parseDoc } from "./parse-doc.ts";
import { POPUP_DEVICES, TRIGGER_LIMITS } from "./popup-rules.ts";

export const TRIGGERS_SCHEMA_VERSION = 1;
export const MAX_POPUP_TRIGGERS = 8;
const MAX_CLICK_SELECTOR_LENGTH = 200;
const MAX_SHOW_TIMES = 100;

/** Open triggers (Elementor-inspired). URL rules / scheduling / A/B deferred (W-081). */
const PageLoadTrigger = z.strictObject({ type: z.literal("page_load") });
const DelayTrigger = z.strictObject({
  type: z.literal("delay"),
  ms: z.number().int().min(0).max(TRIGGER_LIMITS.maxDelayMs),
});
const ScrollTrigger = z.strictObject({
  type: z.literal("scroll"),
  percent: z.number().int().min(0).max(TRIGGER_LIMITS.maxScrollPercent),
});
const ClickTrigger = z.strictObject({
  type: z.literal("click"),
  selector: z.string().min(1).max(MAX_CLICK_SELECTOR_LENGTH),
});
const ExitIntentTrigger = z.strictObject({ type: z.literal("exit_intent") });
const InactivityTrigger = z.strictObject({
  type: z.literal("inactivity"),
  ms: z.number().int().min(TRIGGER_LIMITS.minIdleMs).max(TRIGGER_LIMITS.maxDelayMs),
});

const PopupOpenTriggerSchema = z.discriminatedUnion("type", [
  PageLoadTrigger,
  DelayTrigger,
  ScrollTrigger,
  ClickTrigger,
  ExitIntentTrigger,
  InactivityTrigger,
]);

export type PopupOpenTrigger = z.infer<typeof PopupOpenTriggerSchema>;

const DeviceSchema = z.enum(POPUP_DEVICES);

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
  const parsed = parseDoc(raw, TriggersDocSchema, "triggers", "Triggers");
  if (!parsed.ok) return parsed;
  for (const [i, trigger] of parsed.doc.open.entries()) {
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
  return { ok: true, triggers: parsed.doc };
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
