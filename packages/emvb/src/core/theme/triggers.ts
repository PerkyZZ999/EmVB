import { boundedArray } from "../bounded-array.ts";
import { z } from "zod";
import { parseDoc } from "./parse-doc.ts";
import { COUNTDOWN_TARGET } from "../schema/layout.ts";
import {
  MAX_URL_PARAM_RULES,
  POPUP_DEVICES,
  TRIGGER_LIMITS,
  URL_PARAM_NAME,
} from "./popup-rules.ts";

export const TRIGGERS_SCHEMA_VERSION = 1;
export const MAX_POPUP_TRIGGERS = 8;
const MAX_CLICK_SELECTOR_LENGTH = TRIGGER_LIMITS.maxClickSelectorLength;
const MAX_SHOW_TIMES = 100;

/** Open triggers (Elementor-inspired). A/B stays deferred (W-081). */
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
/**
 * W-1081: one rule on the page address's query. With `value`, the parameter has that value;
 * without, it is there at all. `absent` turns the rule round: the parameter (or that value) isn't.
 */
const UrlParamRuleSchema = z.strictObject({
  name: z.string().regex(URL_PARAM_NAME, "Use letters, digits, - _ . [ or ] (up to 64)"),
  value: z.string().max(200).optional(),
  absent: z.literal(true).optional(),
});

/** W-1081: a date and time with its UTC offset, as for a Countdown. */
const ShowDate = z
  .string()
  .regex(COUNTDOWN_TARGET, "Use a date, time and UTC offset such as 2026-12-01T09:00-05:00")
  .refine(onTheCalendar, "This date doesn't exist");

/**
 * W-1081: the day exists in its month. `Date.parse` rolls 30 February over to 2 March in Bun and
 * Node, so it can't tell. (A Countdown's target keeps its looser check: tightening it would
 * refuse pages saved by 1.3, D-065.)
 */
function onTheCalendar(value: string): boolean {
  const match = COUNTDOWN_TARGET.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const AdvancedRulesSchema = z
  .strictObject({
    showTimes: z.number().int().min(1).max(MAX_SHOW_TIMES).nullable().optional(),
    devices: boundedArray(DeviceSchema, 3).nullable().optional(),
    urlParams: boundedArray(UrlParamRuleSchema, MAX_URL_PARAM_RULES).nullable().optional(),
    /** W-1081: shown from this moment on. */
    from: ShowDate.nullable().optional(),
    /** W-1081: no longer shown from this moment. */
    until: ShowDate.nullable().optional(),
  })
  .refine((a) => !a.from || !a.until || Date.parse(a.until) > Date.parse(a.from), {
    message: "The end must come after the start.",
    path: ["until"],
  });

export type PopupAdvancedRules = z.infer<typeof AdvancedRulesSchema>;

/** W-1071: the edges an off-canvas panel slides in from, and its widths. */
const PANEL_EDGES = ["left", "right"] as const;
export const PANEL_SIZES = ["narrow", "medium", "wide"] as const;

/**
 * W-1071: shows the popup as an off-canvas panel: full height at the `edge`, sliding in (not for
 * reduced motion), `size` narrow 20rem, medium 24rem (unset) or wide 32rem, never wider than the
 * screen less 3rem. Unset: a centred popup.
 */
const PanelSchema = z.strictObject({
  edge: z.enum(PANEL_EDGES),
  size: z.enum(PANEL_SIZES).optional(),
});

const TriggersDocSchema = z.strictObject({
  schemaVersion: z.literal(TRIGGERS_SCHEMA_VERSION),
  open: boundedArray(PopupOpenTriggerSchema, MAX_POPUP_TRIGGERS, 1),
  advanced: AdvancedRulesSchema.default({}),
  panel: PanelSchema.optional(),
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
  // W-613: `>` is the child combinator; the config attribute escapes it, like every quote.
  if (/[<`]/.test(trimmed)) return false;
  if (/javascript:/i.test(trimmed)) return false;
  // Allow common CSS selector chars only.
  return /^[a-zA-Z0-9\s\-_.#[\]=,:()>+~*"'|/]+$/.test(trimmed);
}
