import { ContentSaveRejectedError, type ContentHookEvent, type PluginContext } from "emdash";
import {
  summarizeIssues,
  validateConditions,
  validateFloatSettings,
  nestingIssues,
  validateLayout,
  validateTriggers,
} from "../core/index.ts";
import { EDITOR_ROLE, PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../constants.ts";

function parseJsonField(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

const OWNED = new Set([PAGES_COLLECTION, THEME_PARTS_COLLECTION]);

type FieldValidation =
  | { ok: true; value: unknown }
  | { ok: false; issues: { code: string; message: string }[] };

/** Theme-part fields validated on save, besides the layout (R-061). */
const THEME_PART_FIELDS: [string, (raw: unknown) => FieldValidation][] = [
  [
    "conditions",
    (raw) => {
      const result = validateConditions(raw);
      return result.ok ? { ok: true, value: result.conditions } : result;
    },
  ],
  [
    "triggers",
    (raw) => {
      const result = validateTriggers(raw);
      return result.ok ? { ok: true, value: result.triggers } : result;
    },
  ],
  [
    "float",
    (raw) => {
      const result = validateFloatSettings(raw);
      return result.ok ? { ok: true, value: result.settings } : result;
    },
  ],
];

/**
 * `content:beforeSave` for EmVB pages and theme parts (R-006, D-020, R-060/R-061): editors and
 * above only; validate layout (and conditions on theme parts). Logs carry ids and codes only.
 */
export async function beforeSave(
  event: ContentHookEvent,
  ctx: PluginContext,
): Promise<Record<string, unknown> | void> {
  if (!OWNED.has(event.collection)) return;
  const pageId = event.id ?? null;
  const kind = event.collection === THEME_PARTS_COLLECTION ? "theme part" : "page";
  if (event.actor && event.actor.role < EDITOR_ROLE) {
    ctx.log.warn(`emvb: ${kind} save rejected`, { pageId, code: "role" });
    throw new ContentSaveRejectedError(`Only editors and administrators can save EmVB ${kind}s.`);
  }

  let next: Record<string, unknown> | undefined;

  if (event.content["layout"] !== undefined) {
    const result = validateLayout(parseJsonField(event.content["layout"]));
    if (!result.ok) {
      ctx.log.warn(`emvb: ${kind} save rejected`, {
        pageId,
        code: result.issues[0]?.code ?? "invalid",
      });
      throw new ContentSaveRejectedError(
        `The ${kind} layout is invalid. ${summarizeIssues(result.issues)}`,
      );
    }
    // Elements in a parent the editor never allows (menu item outside a Menu, field outside a
    // form…) render broken markup; refuse them with the editor's own reason (W-225).
    const misplaced = nestingIssues(result.layout, 3);
    if (misplaced.length > 0) {
      ctx.log.warn(`emvb: ${kind} save rejected`, { pageId, code: "nesting" });
      throw new ContentSaveRejectedError(
        `The ${kind} layout has elements in the wrong place. ${misplaced
          .map((issue) => issue.message)
          .join("; ")}`,
      );
    }
    if (result.upgradedFrom !== result.layout.schemaVersion) {
      next = { ...(next ?? event.content), layout: result.layout };
    }
  }

  if (event.collection === THEME_PARTS_COLLECTION) {
    for (const [field, validate] of THEME_PART_FIELDS) {
      if (event.content[field] === undefined) continue;
      const result = validate(parseJsonField(event.content[field]));
      if (!result.ok) {
        ctx.log.warn("emvb: theme part save rejected", {
          pageId,
          code: result.issues[0]?.code ?? `invalid_${field}`,
        });
        throw new ContentSaveRejectedError(
          `The theme part ${field} are invalid. ${result.issues
            .slice(0, 3)
            .map((i) => i.message)
            .join("; ")}`,
        );
      }
      next = { ...(next ?? event.content), [field]: result.value };
    }
  }

  return next;
}
