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

/**
 * S-04 (W-991): true when anyone behind this save is below editor. EmDash 1.5's co-editing saves
 * a room's changes as one actor and lists every participant in `editedBy` (absent on 1.4, where
 * only the actor counts). Each listed user is looked up once (`users:read`); one who is missing,
 * below editor, or can't be looked up makes it a lower-role save (fail closed).
 */
async function lowerRoleSave(event: ContentHookEvent, ctx: PluginContext): Promise<boolean> {
  if (event.actor && event.actor.role < EDITOR_ROLE) return true;
  const editedBy = (event as { editedBy?: unknown }).editedBy;
  if (editedBy === undefined || editedBy === null) return false;
  if (!Array.isArray(editedBy)) return true;
  const others = new Set<string>();
  for (const id of editedBy) {
    if (typeof id !== "string" || !id) return true;
    if (id !== event.actor?.id) others.add(id);
  }
  if (others.size === 0) return false;
  const users = ctx.users;
  if (!users) return true;
  const roles = await Promise.all(
    [...others].map((id) =>
      users.get(id).then(
        (user) => user?.role,
        () => undefined,
      ),
    ),
  );
  return roles.some((role) => typeof role !== "number" || role < EDITOR_ROLE);
}

type FieldValidation =
  | { ok: true; value: unknown }
  | { ok: false; issues: { code: string; message: string }[] };

/** Theme-part fields validated on save, besides the layout (R-061). */
const THEME_PART_FIELDS: [string, (raw: unknown) => FieldValidation, string?][] = [
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
    // W-678: the message read "The theme part float are invalid."
    "float settings",
  ],
];

/**
 * `content:beforeSave` for EmVB pages and theme parts (R-006, D-020, R-060/R-061): editors and
 * above only; validate layout (and conditions on theme parts). Logs carry ids and codes only.
 */
export async function beforeSave(
  event: ContentHookEvent,
  ctx: PluginContext,
  canvasCollections: readonly string[] = [],
): Promise<Record<string, unknown> | void> {
  if (canvasCollections.includes(event.collection)) return canvasFieldsBeforeSave(event, ctx);
  // S-08 (W-997): a collection with an emvb:canvas field is gated even when the site forgot to
  // list it in `canvasCollections` (rendering and protecting were configured in two places).
  if (!OWNED.has(event.collection)) return canvasFieldsBeforeSave(event, ctx, true);
  const pageId = event.id ?? null;
  const kind = event.collection === THEME_PARTS_COLLECTION ? "theme part" : "page";
  if (await lowerRoleSave(event, ctx)) {
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
    for (const [field, validate, label = field] of THEME_PART_FIELDS) {
      if (event.content[field] === undefined) continue;
      const result = validate(parseJsonField(event.content[field]));
      if (!result.ok) {
        ctx.log.warn("emvb: theme part save rejected", {
          pageId,
          code: result.issues[0]?.code ?? `invalid_${field}`,
        });
        throw new ContentSaveRejectedError(
          `The theme part ${label} are invalid. ${result.issues
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

/** Widget id a host field picks for "Edit with EmVB" (W-P02). */
const CANVAS_WIDGET = "emvb:canvas";

/** Slugs of the collection's fields that use the `emvb:canvas` widget. */
export async function canvasFieldSlugs(ctx: PluginContext, collection: string): Promise<string[]> {
  const info = await ctx.schema?.getCollection(collection);
  return (info?.fields ?? []).filter((f) => f.widget === CANVAS_WIDGET).map((f) => f.slug);
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Same value whether it arrives as a JSON string or an object. */
function sameValue(a: unknown, b: unknown): boolean {
  const left = parseJsonField(a);
  const right = parseJsonField(b);
  if (isEmpty(left) && isEmpty(right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * W-898: `emvb:canvas` fields in host collections listed in `canvasCollections`. Editors and above
 * may set, change or clear them, and a set value must be a valid layout. Lower roles may still
 * save the entry, but the field must stay as stored (D-061), so they can't clear or wipe it.
 */
async function canvasFieldsBeforeSave(
  event: ContentHookEvent,
  ctx: PluginContext,
  unlisted = false,
): Promise<Record<string, unknown> | void> {
  const pageId = event.id ?? null;
  // An unlisted collection whose schema can't be read saves as before 1.1.2.
  const slugs = unlisted
    ? await canvasFieldSlugs(ctx, event.collection).catch(() => [])
    : await canvasFieldSlugs(ctx, event.collection);
  const fields = slugs.filter((slug) => event.content[slug] !== undefined);
  if (fields.length === 0) return;

  const lowerRole = await lowerRoleSave(event, ctx);
  if (lowerRole) {
    const stored = event.id ? await ctx.content?.get(event.collection, event.id) : null;
    for (const slug of fields) {
      if (sameValue(event.content[slug], stored?.data[slug])) continue;
      ctx.log.warn("emvb: canvas field save rejected", { pageId, code: "role" });
      throw new ContentSaveRejectedError(
        "Only editors and administrators can change an EmVB layout. Your other changes were not saved.",
      );
    }
    return;
  }

  let next: Record<string, unknown> | undefined;
  for (const slug of fields) {
    const raw = parseJsonField(event.content[slug]);
    if (isEmpty(raw)) continue;
    const result = validateLayout(raw);
    if (!result.ok) {
      ctx.log.warn("emvb: canvas field save rejected", {
        pageId,
        code: result.issues[0]?.code ?? "invalid",
      });
      throw new ContentSaveRejectedError(
        `The EmVB layout is invalid. ${summarizeIssues(result.issues)}`,
      );
    }
    const wrongPlace = nestingIssues(result.layout, 3);
    if (wrongPlace.length > 0) {
      ctx.log.warn("emvb: canvas field save rejected", { pageId, code: "nesting" });
      throw new ContentSaveRejectedError(
        `The EmVB layout has elements in the wrong place. ${wrongPlace
          .map((issue) => issue.message)
          .join("; ")}`,
      );
    }
    if (result.layout.schemaVersion !== result.upgradedFrom) {
      next = { ...(next ?? event.content), [slug]: result.layout };
    }
  }
  return next;
}
