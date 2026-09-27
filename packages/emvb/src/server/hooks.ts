import { ContentSaveRejectedError, type ContentHookEvent, type PluginContext } from "emdash";
import {
  summarizeIssues,
  validateConditions,
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
    if (result.upgradedFrom !== result.layout.schemaVersion) {
      next = { ...(next ?? event.content), layout: result.layout };
    }
  }

  if (event.collection === THEME_PARTS_COLLECTION && event.content["conditions"] !== undefined) {
    const result = validateConditions(parseJsonField(event.content["conditions"]));
    if (!result.ok) {
      ctx.log.warn("emvb: theme part save rejected", {
        pageId,
        code: result.issues[0]?.code ?? "invalid_conditions",
      });
      throw new ContentSaveRejectedError(
        `The theme part conditions are invalid. ${result.issues
          .slice(0, 3)
          .map((i) => i.message)
          .join("; ")}`,
      );
    }
    next = { ...(next ?? event.content), conditions: result.conditions };
  }

  if (event.collection === THEME_PARTS_COLLECTION && event.content["triggers"] !== undefined) {
    const result = validateTriggers(parseJsonField(event.content["triggers"]));
    if (!result.ok) {
      ctx.log.warn("emvb: theme part save rejected", {
        pageId,
        code: result.issues[0]?.code ?? "invalid_triggers",
      });
      throw new ContentSaveRejectedError(
        `The theme part triggers are invalid. ${result.issues
          .slice(0, 3)
          .map((i) => i.message)
          .join("; ")}`,
      );
    }
    next = { ...(next ?? event.content), triggers: result.triggers };
  }

  return next;
}
