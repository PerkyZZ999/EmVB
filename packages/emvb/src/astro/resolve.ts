import { PAGES_COLLECTION } from "../constants.ts";
import { forEachNode } from "../core/tree-ops.ts";
import type { Layout, LayoutNode } from "../core/schema/layout.ts";
import { emdashContent, type ContentPort } from "./content-port.ts";
import { formIdsInLayouts } from "./forms-definitions.ts";
import { readLayout, renderStored, type RenderedPage } from "./render.ts";
import { designFor, formsFor } from "./render-session.ts";
import { bindingDataFor } from "./request-data.ts";
import type { HostVisitor, VisitorAstro } from "./visitor.ts";
import { referencedTemplatesFor } from "./resolve-theme.ts";
import { withResponsiveSources, type ResponsiveGetImage } from "./responsive-images.ts";

type EmDashEntry = NonNullable<Awaited<ReturnType<ContentPort["getEntry"]>>["entry"]>;

export type ResolvedEmVBPage = RenderedPage & {
  /** The EmDash entry, for `getSeoMeta` and the host's layout. */
  entry: EmDashEntry;
  /** The collection the entry came from: `emvb_pages`, or the host collection (W-901). */
  collection: string;
  title: string;
  canvasMode: "site-layout" | "blank";
  /** A valid `_preview` token is serving the draft: don't cache the response. */
  isPreview: boolean;
  /** W-935 (D-068): the locale asked for (option or Astro's), when the site has one. */
  locale?: string;
  /**
   * W-935: set when that locale has no translation of the page and EmDash served this one from
   * its fallback chain instead. Hosts can say so, or link to the requested language's home.
   */
  fallbackLocale?: string;
  /**
   * W-937: this page in each published language (the shown one marked current), when the site
   * has languages. Pass it to `resolveThemeParts` for a Language switcher in the header.
   */
  translations?: { locale: string; href: string; current: boolean }[];
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
    /** The page's language, e.g. "fr-CA", for Post Dates; defaults to Astro's locale (W-688). */
    lang?: string;
    /**
     * W-901: a host collection listed in `canvasCollections`, read instead of EmVB's own pages.
     * Its entry is an EmVB page only while `field` (an emvb:canvas field) holds a layout.
     */
    collection?: string;
    /** The emvb:canvas field of `collection` (default `"canvas"`). */
    field?: string;
    /**
     * W-915: Astro's `getImage` from `astro:assets`. When passed, library Images get a srcset
     * from the host's image service (authorise the site origin in `image.remotePatterns`).
     */
    getImage?: ResponsiveGetImage;
    /**
     * W-935: which translation to read (EmDash's row-per-locale model, D-068). Defaults to
     * Astro's `currentLocale`; EmDash falls back along its chain when there is none.
     */
    locale?: string;
    /**
     * W-937: where a translation of this page lives, for the Language switcher. Defaults to
     * `/<slug>` for the default locale and `/<locale>/<slug>` for the others.
     */
    translationHref?: (translation: { locale: string; slug: string }) => string;
  } = {},
): Promise<ResolvedEmVBPage | null> {
  return resolveEmVBPageWith(emdashContent, astro, options);
}

/** Same as `resolveEmVBPage`, with a content port so tests can pass a fake (W-359). */
export async function resolveEmVBPageWith(
  content: ContentPort,
  astro: AstroLike,
  options: {
    param?: string;
    slug?: string;
    visitor?: HostVisitor;
    /** The page's language, e.g. "fr-CA", for Post Dates; defaults to Astro's locale (W-688). */
    lang?: string;
    /**
     * W-901: a host collection listed in `canvasCollections`, read instead of EmVB's own pages.
     * Its entry is an EmVB page only while `field` (an emvb:canvas field) holds a layout.
     */
    collection?: string;
    /** The emvb:canvas field of `collection` (default `"canvas"`). */
    field?: string;
    /**
     * W-915: Astro's `getImage` from `astro:assets`. When passed, library Images get a srcset
     * from the host's image service (authorise the site origin in `image.remotePatterns`).
     */
    getImage?: ResponsiveGetImage;
    /** W-935: which translation to read; defaults to Astro's `currentLocale`. */
    locale?: string;
    /**
     * W-937: where a translation of this page lives, for the Language switcher. Defaults to
     * `/<slug>` for the default locale and `/<locale>/<slug>` for the others.
     */
    translationHref?: (translation: { locale: string; slug: string }) => string;
  } = {},
): Promise<ResolvedEmVBPage | null> {
  const slug = options.slug ?? content.decodeSlug(astro.params[options.param ?? "slug"]);
  if (!slug) return null;
  const locale = options.locale ?? astro.currentLocale;
  let found: Awaited<ReturnType<ContentPort["getEntry"]>>;
  try {
    found = await content.getEntry(
      options.collection ?? PAGES_COLLECTION,
      slug,
      locale ? { locale } : undefined,
    );
  } catch {
    // No emvb_pages collection yet (EmVB not set up): not an EmVB page.
    return null;
  }
  const entry = found.entry;
  if (!entry) return null;
  const data = entry.data as Record<string, unknown>;
  const hosted = options.collection !== undefined && options.collection !== PAGES_COLLECTION;
  const stored = hosted ? data[options.field ?? "canvas"] : data["layout"];
  // An empty canvas field leaves the entry to the host's own template.
  if (hosted && (stored === null || stored === undefined || stored === "")) return null;
  const handler = content.pluginHandler(astro.locals as never);
  const design = await designFor(astro, handler, astro.url);
  const layout = readLayout(stored);
  const referenced = layout
    ? await referencedTemplatesFor(layout, content, astro)
    : { sectionTemplates: {}, loopTemplates: {} };
  const { sectionTemplates, loopTemplates } = referenced;
  const formDefinitions = layout
    ? await formsFor(
        astro,
        handler,
        astro.url,
        formIdsInLayouts([
          layout,
          ...Object.values(sectionTemplates),
          ...Object.values(loopTemplates),
        ]),
      )
    : undefined;
  const translations =
    content.getI18nConfig?.() ||
    (layout &&
      [layout, ...Object.values(sectionTemplates)].some((l) => hasType(l, "language-switcher")))
      ? await translationLinks(content, {
          collection: options.collection ?? PAGES_COLLECTION,
          entryId: String(data["id"] ?? entry.id),
          ...(options.translationHref ? { hrefOf: options.translationHref } : {}),
        })
      : undefined;
  const dynamic = {
    ...(translations ? { translations } : {}),
    ...(Object.keys(sectionTemplates).length > 0 ? { sectionTemplates } : {}),
    ...(Object.keys(loopTemplates).length > 0 ? { loopTemplates } : {}),
    ...(await bindingDataFor(
      layout,
      astro.url,
      astro,
      // W-666: Loop Item parts too. A Visitors rule, A/B test, bound field or collection Loop in
      // one was never seen, so the visitor was never read and "only for" elements stayed hidden.
      [...Object.values(sectionTemplates), ...Object.values(loopTemplates)],
      options.visitor ? { visitor: options.visitor } : {},
      content,
    )),
  };
  const responsive =
    layout && options.getImage
      ? await withResponsiveSources(layout, options.getImage, astro.url.origin)
      : stored;
  return {
    ...renderStored(
      responsive,
      design,
      String(data["id"] ?? slug),
      formDefinitions,
      Object.keys(dynamic).length > 0 ? dynamic : undefined,
      false,
      options.lang ?? found.fallbackLocale ?? locale,
    ),
    entry,
    collection: hosted ? (options.collection as string) : PAGES_COLLECTION,
    title: typeof data["title"] === "string" ? data["title"] : "",
    canvasMode: !hosted && data["canvas_mode"] === "blank" ? "blank" : "site-layout",
    isPreview: Boolean(found.isPreview),
    ...(locale ? { locale } : {}),
    ...(found.fallbackLocale ? { fallbackLocale: found.fallbackLocale } : {}),
    ...(translations ? { translations } : {}),
  };
}

function hasType(layout: Layout, type: string): boolean {
  let found = false;
  forEachNode(layout.root as LayoutNode, (node) => {
    if (node.type === type) found = true;
  });
  return found;
}

/**
 * W-937: the page's languages for its Language switcher. Only published translations are
 * linked (a draft never is); the page being shown is always listed and marked current.
 */
async function translationLinks(
  content: ContentPort,
  input: {
    collection: string;
    entryId: string;
    hrefOf?: (translation: { locale: string; slug: string }) => string;
  },
): Promise<{ locale: string; href: string; current: boolean }[] | undefined> {
  if (!content.getTranslations) return undefined;
  const found = await content.getTranslations(input.collection, input.entryId).catch(() => null);
  if (!found || found.error) return undefined;
  const defaultLocale = content.getI18nConfig?.()?.defaultLocale;
  const hrefOf =
    input.hrefOf ??
    ((t: { locale: string; slug: string }) =>
      t.locale === defaultLocale ? `/${t.slug}` : `/${t.locale}/${t.slug}`);
  return found.translations
    .filter((t) => t.slug && (t.status === "published" || t.id === input.entryId))
    .map((t) => ({
      locale: t.locale,
      href: hrefOf({ locale: t.locale, slug: t.slug as string }),
      current: t.id === input.entryId,
    }));
}
