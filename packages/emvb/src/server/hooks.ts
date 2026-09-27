import { ContentSaveRejectedError, type ContentHookEvent, type PluginContext } from "emdash";
import { summarizeIssues, validateLayout } from "../core/index.ts";
import { EDITOR_ROLE, PAGES_COLLECTION } from "../constants.ts";

function parseLayout(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * `content:beforeSave` for EmVB pages (R-006, D-020): editors and above only, then upgrade and
 * validate the layout. Logs carry the page id and the issue code, never layout content.
 */
export async function beforeSave(
  event: ContentHookEvent,
  ctx: PluginContext,
): Promise<Record<string, unknown> | void> {
  if (event.collection !== PAGES_COLLECTION) return;
  const pageId = event.id ?? null;
  if (event.actor && event.actor.role < EDITOR_ROLE) {
    ctx.log.warn("emvb: page save rejected", { pageId, code: "role" });
    throw new ContentSaveRejectedError("Only editors and administrators can save EmVB pages.");
  }
  if (event.content["layout"] === undefined) return;
  const result = validateLayout(parseLayout(event.content["layout"]));
  if (!result.ok) {
    ctx.log.warn("emvb: page save rejected", { pageId, code: result.issues[0]?.code ?? "invalid" });
    throw new ContentSaveRejectedError(
      `The page layout is invalid. ${summarizeIssues(result.issues)}`,
    );
  }
  if (result.upgradedFrom !== result.layout.schemaVersion) {
    return { ...event.content, layout: result.layout };
  }
}
