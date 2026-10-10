import { decodeSlug, getEmDashEntry } from "emdash";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { PAGES_COLLECTION } from "../constants.ts";
import { formIdsInLayout, loadFormDefinitions } from "./forms-definitions.ts";
import { loadDesign, readLayout, renderStored, type RenderedPage } from "./render.ts";
import { bindingDataFor } from "./request-data.ts";
import type { HostVisitor, VisitorAstro } from "./visitor.ts";
import { sectionTemplatesFor } from "./resolve-theme.ts";

type EmDashEntry = NonNullable<Awaited<ReturnType<typeof getEmDashEntry>>["entry"]>;

export type ResolvedEmVBPage = RenderedPage & {
  /** The EmDash entry, for `getSeoMeta` and the host's layout. */
  entry: EmDashEntry;
  title: string;
  canvasMode: "site-layout" | "blank";
  /** A valid `_preview` token is serving the draft: don't cache the response. */
  isPreview: boolean;
};

type AstroLike = VisitorAstro & {
  params: Record<string, string | undefined>;
  url: URL;
  locals: unknown;
};

/**
 * Looks up the published EmVB page for this request's slug (or its draft under a preview token),
 * so a host route can try EmVB first and fall through to its own content (R-030, R-052).
 * A fixed route such as `/` passes the page's slug explicitly: `{ slug: "home" }`.
 */
export async function resolveEmVBPage(
  astro: AstroLike,
  options: {
    /** The route parameter that holds the URL-encoded slug (default `"slug"`). */
    param?: string;
    /** The page's slug, used as-is (not URL-decoded) in place of the route parameter. */
    slug?: string;
    /** What the host knows about the visitor: segments and facts Visitors rules use (W-329). */
    visitor?: HostVisitor;
  } = {},
): Promise<ResolvedEmVBPage | null> {
  const slug = options.slug ?? decodeSlug(astro.params[options.param ?? "slug"]);
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
  const layout = readLayout(data["layout"]);
  const formDefinitions = layout
    ? await loadFormDefinitions(handler, astro.url, formIdsInLayout(layout))
    : undefined;
  const sectionTemplates = layout ? await sectionTemplatesFor(layout) : {};
  const dynamic = {
    ...(Object.keys(sectionTemplates).length > 0 ? { sectionTemplates } : {}),
    ...(await bindingDataFor(
      layout,
      astro.url,
      astro,
      Object.values(sectionTemplates),
      options.visitor ? { visitor: options.visitor } : {},
    )),
  };
  return {
    ...renderStored(
      data["layout"],
      design,
      String(data["id"] ?? slug),
      formDefinitions,
      Object.keys(dynamic).length > 0 ? dynamic : undefined,
    ),
    entry,
    title: typeof data["title"] === "string" ? data["title"] : "",
    canvasMode: data["canvas_mode"] === "blank" ? "blank" : "site-layout",
    isPreview: Boolean(found.isPreview),
  };
}
