import { decodeSlug, getEmDashEntry } from "emdash";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { PAGES_COLLECTION } from "../constants.ts";
import { loadDesign, renderStored, type RenderedPage } from "./render.ts";

type EmDashEntry = NonNullable<Awaited<ReturnType<typeof getEmDashEntry>>["entry"]>;

export type ResolvedEmVBPage = RenderedPage & {
  /** The EmDash entry, for `getSeoMeta` and the host's layout. */
  entry: EmDashEntry;
  title: string;
  canvasMode: "site-layout" | "blank";
  /** A valid `_preview` token is serving the draft: don't cache the response. */
  isPreview: boolean;
};

type AstroLike = {
  params: Record<string, string | undefined>;
  url: URL;
  locals: unknown;
};

/**
 * Looks up the published EmVB page for this request's slug (or its draft under a preview token),
 * so a host route can try EmVB first and fall through to its own content (R-030, R-052).
 */
export async function resolveEmVBPage(
  astro: AstroLike,
  options: { param?: string } = {},
): Promise<ResolvedEmVBPage | null> {
  const slug = decodeSlug(astro.params[options.param ?? "slug"]);
  if (!slug) return null;
  let found: Awaited<ReturnType<typeof getEmDashEntry>>;
  try {
    found = await getEmDashEntry(PAGES_COLLECTION, slug);
  } catch {
    // No emvb_pages collection yet (EmVB not set up): not an EmVB page.
    return null;
  }
  const entry = found.entry;
  if (!entry) return null;
  const data = entry.data as Record<string, unknown>;
  const handler = getPublicPluginApiRouteHandler(astro.locals as never);
  const design = await loadDesign(handler, astro.url);
  return {
    ...renderStored(data["layout"], design, String(data["id"] ?? slug)),
    entry,
    title: typeof data["title"] === "string" ? data["title"] : "",
    canvasMode: data["canvas_mode"] === "blank" ? "blank" : "site-layout",
    isPreview: Boolean(found.isPreview),
  };
}
