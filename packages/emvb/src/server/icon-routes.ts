import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import {
  prepareUploadedSvg,
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
  put(id: string, data: UploadedIcon): Promise<void>;
  query(options?: {
    orderBy?: Record<string, "asc" | "desc">;
    limit?: number;
  }): Promise<{ items: Array<{ id: string; data: UploadedIcon }>; hasMore: boolean }>;
};

const store = (ctx: RouteContext<unknown>) => ctx.storage["icons"] as unknown as IconStore;

/** The most recent uploads the picker lists. */
const UPLOAD_LIST_LIMIT = 100;

/** Editors and above: the uploaded icons, newest first. */
export const iconsRoute: PluginRoute = {
  permission: "content:edit_any",
  handler: async (ctx) => {
    const page = await store(ctx).query({
      orderBy: { uploadedAt: "desc" },
      limit: UPLOAD_LIST_LIMIT,
    });
    // Only the known fields, whatever else a stored row might carry.
    const items: UploadedIconItem[] = page.items.map(({ id, data }) => ({
      id,
      name: data.name,
      svg: data.svg,
      uploadedAt: data.uploadedAt,
    }));
    return { items };
  },
};

/** A file name without its folder or extension, as the icon's label. */
export const uploadName = (name: string) =>
  name
    .replace(/^.*[\\/]/, "")
    .replace(/\.svg$/i, "")
    .trim()
    .slice(0, 80) || "Uploaded icon";

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
    const id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const item: UploadedIcon = {
      name: uploadName(ctx.input.name),
      svg: prepared.svg,
      uploadedAt: new Date().toISOString(),
    };
    await store(ctx).put(id, item);
    return { item: { id, ...item }, imagesLeftOut: prepared.imagesLeftOut };
  },
};
