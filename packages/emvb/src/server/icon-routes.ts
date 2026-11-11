import { clipText } from "../core/limits.ts";
import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import {
  prepareUploadedSvg,
  sanitizeSvgMarkup,
  serialize,
  UPLOAD_SVG_MAX_BYTES,
  type UploadedIcon,
  type UploadedIconItem,
} from "../core/index.ts";

/**
 * Upload SVG (W-239): EmVB's own list of uploaded icons. EmDash's media library refuses
 * image/svg+xml by default (it has no upload-time SVG check, so a stored SVG could carry a
 * script), so EmVB keeps uploads in its plugin storage instead, already sanitized on the server.
 * An Icon stores `upload:<id>` plus the SVG itself, so pages never read this list.
 */

type IconStore = {
  get(id: string): Promise<UploadedIcon | null>;
  put(id: string, data: UploadedIcon): Promise<void>;
  delete(id: string): Promise<boolean>;
  query(options?: {
    orderBy?: Record<string, "asc" | "desc">;
    limit?: number;
    cursor?: string;
  }): Promise<{
    items: Array<{ id: string; data: UploadedIcon }>;
    hasMore: boolean;
    cursor?: string;
  }>;
};

const store = (ctx: RouteContext<unknown>) => ctx.storage["icons"] as unknown as IconStore;

/**
 * The most My uploads holds, and the uploads the picker lists (W-535; 500 since W-972). EmDash
 * returns plugin storage 100 rows at a time, so the list is read page by page.
 */
export const UPLOAD_LIST_LIMIT = 500;
const STORAGE_PAGE = 100;

/** Every upload, newest first, up to the limit, following EmDash's storage cursor (W-972). */
async function allUploads(ctx: RouteContext<unknown>) {
  const items: Array<{ id: string; data: UploadedIcon }> = [];
  let cursor: string | undefined;
  for (let page = 0; page < UPLOAD_LIST_LIMIT / STORAGE_PAGE; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each page needs the previous page's cursor
    const result = await store(ctx).query({
      orderBy: { uploadedAt: "desc" },
      limit: STORAGE_PAGE,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...result.items);
    if (!result.hasMore || !result.cursor) break;
    cursor = result.cursor;
  }
  return items.slice(0, UPLOAD_LIST_LIMIT);
}

/** An icon's label as typed: trimmed and capped (W-655: a rename may hold a slash, as in "AC/DC"). */
// W-656: control characters become spaces and invisible or direction-changing marks go, so a
// name like "evil\u202Egvs.exe" can't show reversed in the picker.
const iconLabel = (name: string) =>
  clipText(
    Array.from(name.normalize("NFC"), (ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159) ? " " : ch;
    })
      .join("")
      .replace(/[\u200B\u2060\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
      .replace(/ {2,}/g, " ")
      .trim(),
    80,
  ).trim() || "Uploaded icon";

/** A file name without its folder or extension, as the icon's label. */
export const uploadName = (name: string) =>
  iconLabel(name.replace(/^.*[\\/]/, "").replace(/\.svg$/i, ""));

/**
 * One stored upload safe to send to the editor. Markup that no longer passes the SVG allowlist
 * is left out, so a row written past the upload route cannot carry a script into the picker.
 */
export function publicUploadedIcon(id: string, data: UploadedIcon): UploadedIconItem | undefined {
  if (typeof data.svg !== "string") return undefined;
  const tree = sanitizeSvgMarkup(data.svg);
  if (!tree) return undefined;
  return {
    id,
    name: iconLabel(typeof data.name === "string" ? data.name : ""),
    svg: serialize(tree),
    uploadedAt: typeof data.uploadedAt === "string" ? data.uploadedAt : "",
  };
}

/** Editors and above: the uploaded icons, newest first. A row that fails the allowlist is omitted. */
export const iconsRoute: PluginRoute = {
  permission: "content:edit_any",
  handler: async (ctx) => {
    const items = (await allUploads(ctx)).flatMap(({ id, data }) => {
      const item = publicUploadedIcon(id, data);
      return item ? [item] : [];
    });
    return { items };
  },
};

const UploadInput = z.object({
  name: z.string().max(255),
  // A JSON string: the file plus escaping room is still bounded by the route body limit.
  svg: z.string().min(1).max(UPLOAD_SVG_MAX_BYTES),
});

/** Editors and above. Sanitizes on the server, whatever the client did, then stores. */
export const iconUploadRoute: PluginRoute<z.infer<typeof UploadInput>> = {
  permission: "content:edit_any",
  input: UploadInput,
  handler: async (ctx) => {
    const prepared = prepareUploadedSvg(ctx.input.svg);
    if (!prepared.ok) throw new PluginRouteError("INVALID_SVG", prepared.message, 422);
    const held = await allUploads(ctx);
    // W-972: the same SVG uploaded again (twice at once from two tabs, or later) is the icon
    // already in My uploads; the check runs on the sanitized markup, so it is the same drawing.
    const same = held.find(({ data }) => data.svg === prepared.svg);
    if (same) {
      return {
        item: { id: same.id, ...same.data },
        imagesLeftOut: prepared.imagesLeftOut,
        duplicate: true,
      };
    }
    if (held.length >= UPLOAD_LIST_LIMIT) {
      throw new PluginRouteError(
        "UPLOADS_FULL",
        `My uploads holds up to ${UPLOAD_LIST_LIMIT} icons. Delete one you no longer use, then upload again.`,
        409,
      );
    }
    // W-972: the id is the drawing's hash, so two uploads of the same SVG at the same moment
    // land on one row instead of two.
    const id = await svgId(prepared.svg);
    const item: UploadedIcon = {
      name: uploadName(ctx.input.name),
      svg: prepared.svg,
      uploadedAt: new Date().toISOString(),
    };
    await store(ctx).put(id, item);
    return { item: { id, ...item }, imagesLeftOut: prepared.imagesLeftOut };
  },
};

/** The first 16 hex digits of the SHA-256 of the sanitized markup. */
async function svgId(svg: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(svg));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const IdInput = z.object({
  id: z.string().regex(/^[0-9a-f]{16}$/, "Unknown icon"),
});

const RenameInput = IdInput.extend({
  name: z.string().min(1).max(255),
});

/** Editors and above. Renames an upload. Pages keep the SVG they already stored. */
export const iconRenameRoute: PluginRoute<z.infer<typeof RenameInput>> = {
  permission: "content:edit_any",
  input: RenameInput,
  handler: async (ctx) => {
    const current = await store(ctx).get(ctx.input.id);
    if (!current) throw new PluginRouteError("NOT_FOUND", "That upload is not in My uploads.", 404);
    const name = iconLabel(ctx.input.name.trim().replace(/\.svg$/i, ""));
    // W-390: answer with the same checked markup the list sends; a row that fails the
    // allowlist is not renamed or echoed back.
    const item = publicUploadedIcon(ctx.input.id, { ...current, name });
    if (!item) throw new PluginRouteError("NOT_FOUND", "That upload is not in My uploads.", 404);
    await store(ctx).put(ctx.input.id, { ...current, name });
    return { item };
  },
};

/**
 * Editors and above. Removes an upload from My uploads. Icons already placed on a page keep
 * their own copy of the SVG, so those pages do not change.
 */
export const iconDeleteRoute: PluginRoute<z.infer<typeof IdInput>> = {
  permission: "content:edit_any",
  input: IdInput,
  handler: async (ctx) => {
    const removed = await store(ctx).delete(ctx.input.id);
    if (!removed) throw new PluginRouteError("NOT_FOUND", "That upload is not in My uploads.", 404);
    return { id: ctx.input.id };
  },
};
