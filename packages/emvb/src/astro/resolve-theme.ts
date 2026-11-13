import { emdashContent, type ContentPort } from "./content-port.ts";
import { formIdsInLayouts } from "./forms-definitions.ts";
import {
  collectLoopItemPartIds,
  escapeAttr,
  collectSectionPartIds,
  contentPartTypeForContext,
  defaultConditions,
  defaultFloatSettings,
  defaultTriggers,
  FLOAT_CHROME_CSS,
  floatHasOwnSurface,
  listMatchingThemeParts,
  parseThemePartType,
  pickThemePartWinner,
  POPUP_CHROME_CSS,
  sharedPartCss,
  validateConditions,
  validateFloatSettings,
  validateTriggers,
  wrapFloatMarkup,
  wrapPopupMarkup,
  type ChromeLabels,
  type FloatSettings,
  type Layout,
  type ThemeDynamicData,
  type ThemePartCandidate,
  type ThemePartType,
  type ThemePostFields,
  type ThemeRequestContext,
  type TriggersDoc,
  archivePagePath,
  loopPerPage,
  paginationArchiveTitle,
  paginationTitleText,
  type ArchivePagination,
} from "../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../constants.ts";
import { readLayout, renderStored, type RenderedPage } from "./render.ts";
import type { WidgetRuntime } from "../core/elements/widgets.ts";
import { designFor, formsFor, layoutFor, partsFor } from "./render-session.ts";
import type { HostVisitor, VisitorAstro } from "./visitor.ts";
import { bindingDataFor } from "./request-data.ts";
import { decodePathSegment, themeContextFrom } from "./theme-context.ts";
import { entryTimestamp, themePostFromEntry } from "./theme-posts.ts";
import { probeCounter, totalPagesFor, type PostCounter } from "./page-count.ts";

/** The landmark element for a part's wrapper (W-216); other parts get a plain div. */
const WRAPPER_TAGS: Partial<Record<string, "header" | "footer">> = {
  header: "header",
  footer: "footer",
};

export type RenderedThemePart = {
  id: string;
  title: string;
  partType: ThemePartType;
  html: string;
  css: string;
};

export type RenderedPopup = {
  id: string;
  title: string;
  html: string;
  css: string;
  triggers: TriggersDoc;
};

export type RenderedFloat = {
  id: string;
  title: string;
  html: string;
  css: string;
  settings: FloatSettings;
};

export type ResolvedThemeParts = {
  header: RenderedThemePart | null;
  footer: RenderedThemePart | null;
  /**
   * Body/main replacement when a content theme part wins (404, search, page, post, archive).
   * Null when none match — hosts keep their route slot content.
   */
  content: RenderedThemePart | null;
  /** Matching published popups for this request (S7b). May be more than one. */
  popups: RenderedPopup[];
  /** Matching published floats. May be more than one. Not dialogs. */
  floats: RenderedFloat[];
  /** Concatenated CSS for all winners (empty when none match). */
  css: string;
  /** Hosts load `EmVBPopupsRuntime` only when this is true (R-031). */
  needsPopupsRuntime: boolean;
  /** Hosts load `EmVBFloatsRuntime` only when a float matches (R-031). */
  needsFloatsRuntime: boolean;
  /** Hosts load `EmVBTabsRuntime` only when Tabs appear in a winning part (R-031 / W-078). */
  needsTabsRuntime: boolean;
  /** Hosts load `EmVBMenuRuntime` only when a winning part has a Menu dropdown (W-197). */
  needsMenuRuntime: boolean;
  /** Hosts load `EmVBFormsRuntime` only when a winning part renders a form. */
  needsFormsRuntime: boolean;
  /**
   * W-1025: the opt-in widget scripts the winning parts need; set only when there is one. Mount
   * `<EmVBWidgetRuntimes names={theme.runtimes} />` from `@perkyzz/emvb/astro/widgets`.
   */
  runtimes?: WidgetRuntime[];
  /**
   * True for an archive page past the last one (`/posts/page/9` with no posts there). Hosts
   * answer 404 (W-221). Page 1 with no posts is not a 404.
   */
  notFound: boolean;
  /**
   * The canonical path of an archive page: the bare archive path for page 1 (also for
   * `/page/1`, which hosts should redirect there), else `<archive>/page/N` (W-221).
   */
  canonicalPath?: string;
  /**
   * The archive's title when an Archive part renders: "Posts", or the category/tag slug
   * (W-229). Hosts build "Posts – page 2" with `archivePageTitle` and `archiveTitleText`.
   */
  archiveTitle?: string;
  /** The archive page number when an Archive part renders (1 for the bare URL). */
  archivePage?: number;
  /**
   * The Archive part's Pagination "Page title text", when set (W-529). Pass it to
   * `archivePageTitle(archiveTitle, page, archiveTitleText)` for the site's own wording.
   */
  archiveTitleText?: string;
  /** The site's text direction from Site styles when a part renders, for `<html dir>` (W-230). */
  dir?: "ltr" | "rtl" | "auto";
};

type AstroLike = VisitorAstro & {
  url: URL;
  locals: unknown;
  props?: Record<string, unknown>;
};

type StoredPart = {
  id: string;
  title: string;
  partType: ThemePartType;
  layout: unknown;
  conditions: ReturnType<typeof defaultConditions>;
  triggers: TriggersDoc;
  float: FloatSettings;
  updatedAt: string;
};

/** A stored JSON field, or `fallback` when the field was never set. */
const storedOr = <T>(raw: unknown, fallback: () => T): unknown =>
  raw === undefined || raw === null || raw === "" ? fallback() : raw;

/** A published entry as a theme part, or undefined when its type or conditions are invalid. */
function storedPartFrom(entry: { id: string; data: unknown }): StoredPart | undefined {
  const data = entry.data as Record<string, unknown>;
  const partType = parseThemePartType(data["part_type"]);
  if (!partType) return undefined;
  const conditions = validateConditions(storedOr(data["conditions"], defaultConditions));
  if (!conditions.ok) return undefined;
  const triggers = validateTriggers(storedOr(data["triggers"], defaultTriggers));
  // Invalid triggers fail closed for popups; other part types ignore triggers.
  if (partType === "popup" && !triggers.ok) return undefined;
  const float = validateFloatSettings(storedOr(data["float"], defaultFloatSettings));
  // Invalid float settings fail closed for floats; other part types ignore them.
  if (partType === "float" && !float.ok) return undefined;
  return {
    id: String(data["id"] ?? entry.id),
    title: typeof data["title"] === "string" ? data["title"] : "",
    partType,
    layout: data["layout"],
    conditions: conditions.conditions,
    triggers: triggers.ok ? triggers.triggers : defaultTriggers(),
    float: float.ok ? float.settings : defaultFloatSettings(),
    updatedAt: entryTimestamp(data["updatedAt"] ?? data["updated_at"]) ?? "",
  };
}

const THEME_PARTS_PAGE = 50;
/** Enough pages for any real site; stops a cursor that never ends. */
const THEME_PARTS_MAX_PAGES = 20;

/** Every published theme part, page by page; a failed page ends the read with what came before. */
async function fetchPublishedThemeParts(content: ContentPort): Promise<StoredPart[]> {
  const entries: Awaited<ReturnType<ContentPort["getCollection"]>>["entries"] = [];
  let cursor: string | undefined;
  for (let page = 0; page < THEME_PARTS_MAX_PAGES; page += 1) {
    let result: Awaited<ReturnType<ContentPort["getCollection"]>>;
    try {
      // No orderBy: D1/SQLite columns are snake_case and camelCase orderBy fails the query.
      // Winners and popup order come from updatedAt in core/theme/conditions.ts.
      // oxlint-disable-next-line no-await-in-loop -- each page needs the previous page's cursor
      result = await content.getCollection(THEME_PARTS_COLLECTION, {
        status: "published",
        limit: THEME_PARTS_PAGE,
        ...(cursor ? { cursor } : {}),
      });
    } catch {
      break;
    }
    if (result.error) break;
    entries.push(...(result.entries ?? []));
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return entries.map(storedPartFrom).filter((part): part is StoredPart => part !== undefined);
}

function loadPublishedThemeParts(content: ContentPort, request?: object): Promise<StoredPart[]> {
  const load = () => fetchPublishedThemeParts(content);
  return request ? partsFor(request, load) : load();
}

async function loadLoopTemplates(
  layout: Layout,
  parts: StoredPart[],
  request?: object,
): Promise<Record<string, Layout>> {
  const queue = collectLoopItemPartIds(layout);
  if (queue.length === 0) return {};
  const byId = new Map(parts.map((p) => [p.id, p]));
  const templates: Record<string, Layout> = {};
  const seen = new Set<string>();
  // W-654: a Loop inside a loop item part can use another loop item part; load those too.
  while (queue.length > 0 && seen.size < 32) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const part = byId.get(id);
    if (!part || part.partType !== "loop_item") continue;
    const itemLayout = layoutFor(request, part.id, part.layout);
    if (!itemLayout) continue;
    templates[id] = itemLayout;
    queue.push(...collectLoopItemPartIds(itemLayout));
  }
  return templates;
}

/** Section parts referenced by `layout`, including sections nested inside those parts. */
function loadSectionTemplates(
  layout: Layout,
  parts: StoredPart[],
  request?: object,
): Record<string, Layout> {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const templates: Record<string, Layout> = {};
  const queue = collectSectionPartIds(layout);
  const seen = new Set<string>();
  while (queue.length > 0 && seen.size < 32) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const part = byId.get(id);
    if (!part || part.partType !== "section") continue;
    const itemLayout = layoutFor(request, part.id, part.layout);
    if (!itemLayout) continue;
    templates[id] = itemLayout;
    queue.push(...collectSectionPartIds(itemLayout));
  }
  return templates;
}

/** Section and loop-item layouts a layout references, including sections nested in those loop items. */
async function templatesFrom(
  layout: Layout,
  parts: StoredPart[],
  request?: object,
): Promise<{ sectionTemplates: Record<string, Layout>; loopTemplates: Record<string, Layout> }> {
  const loopTemplates = await loadLoopTemplates(layout, parts, request);
  const sectionTemplates = loadSectionTemplates(layout, parts, request);
  for (const item of Object.values(loopTemplates)) {
    const nested = loadSectionTemplates(item, parts, request);
    for (const [id, value] of Object.entries(nested)) {
      if (!sectionTemplates[id]) sectionTemplates[id] = value;
    }
  }
  return { sectionTemplates, loopTemplates };
}

/** Published section and loop-item layouts a page references. */
export async function referencedTemplatesFor(
  layout: Layout,
  content: ContentPort = emdashContent,
  request?: object,
): Promise<{
  sectionTemplates: Record<string, Layout>;
  loopTemplates: Record<string, Layout>;
}> {
  if (collectSectionPartIds(layout).length === 0 && collectLoopItemPartIds(layout).length === 0) {
    return { sectionTemplates: {}, loopTemplates: {} };
  }
  return templatesFrom(layout, await loadPublishedThemeParts(content, request), request);
}

async function loadSingularPost(
  ctx: ThemeRequestContext,
  content: ContentPort,
): Promise<ThemePostFields | undefined> {
  if (ctx.kind !== "singular" || ctx.collection !== "posts") return undefined;
  const key = ctx.entryId || undefined;
  // Prefer slug from path `/posts/{slug}` when entry id is missing.
  const pathSlug = /^\/posts\/([^/]+)$/.exec(ctx.path)?.[1];
  const lookup = key || (pathSlug ? decodePathSegment(pathSlug) : undefined);
  if (!lookup) return undefined;
  try {
    const { entry } = await content.getEntry("posts", lookup);
    if (!entry) return undefined;
    return themePostFromEntry(entry) ?? undefined;
  } catch {
    return undefined;
  }
}

/** A taxonomy term's label for archive titles; the slug when the term can't be read (W-263). */
async function termLabel(taxonomy: string, slug: string, content: ContentPort): Promise<string> {
  try {
    const term = await content.getTerm(taxonomy, slug);
    return term?.label?.trim() || slug;
  } catch {
    return slug;
  }
}

async function loadArchivePosts(
  ctx: ThemeRequestContext,
  perPage: number,
  content: ContentPort,
  postsTitle = "Posts",
  counter?: PostCounter,
): Promise<{
  posts: ThemePostFields[];
  archiveTitle?: string;
  pagination?: ArchivePagination;
}> {
  if (ctx.kind !== "archive" || ctx.isSearch) return { posts: [] };
  const page = ctx.page ?? 1;
  try {
    // Offset paging for numbered `/page/N` routes (W-221); EmDash reports `hasMore`.
    const filter: {
      orderBy: { published_at: "desc" };
      limit: number;
      offset?: number;
      where?: Record<string, string>;
    } = {
      orderBy: { published_at: "desc" },
      limit: perPage,
      ...(page > 1 ? { offset: (page - 1) * perPage } : {}),
    };
    if (ctx.taxonomy?.type === "category") {
      filter.where = { category: ctx.taxonomy.slug };
    } else if (ctx.taxonomy?.type === "tag") {
      filter.where = { tag: ctx.taxonomy.slug };
    }
    const result = await content.getCollection("posts", filter);
    if (result.error || !result.entries) return { posts: [] };
    const hasMore = (result as { hasMore?: boolean }).hasMore === true;
    const posts = result.entries
      .map((entry) => themePostFromEntry(entry))
      .filter((p): p is ThemePostFields => p !== null);
    // W-263: a category or tag archive is titled by its term's label ("News"), not its slug.
    const archiveTitle = ctx.taxonomy?.slug
      ? await termLabel(ctx.taxonomy.type, ctx.taxonomy.slug, content)
      : ctx.collection === "posts"
        ? postsTitle
        : undefined;
    const pagination: ArchivePagination = { page, hasMore, basePath: ctx.path };
    if (counter && (hasMore || result.entries.length > 0)) {
      // W-916: the last page needs no count; later pages are counted past the ones seen.
      const seen = (page - 1) * perPage + result.entries.length;
      const count = hasMore
        ? await counter({
            collection: "posts",
            ...(filter.where ? { where: filter.where } : {}),
            atLeast: seen + 1,
          })
        : seen;
      const totalPages = totalPagesFor(count, perPage, page);
      if (totalPages !== undefined) pagination.totalPages = totalPages;
    }
    return { posts, archiveTitle, pagination };
  } catch {
    return { posts: [] };
  }
}

async function buildDynamicForContent(
  partType: ThemePartType,
  ctx: ThemeRequestContext,
  layout: Layout,
  parts: StoredPart[],
  content: ContentPort,
  request?: object,
  counter?: PostCounter,
): Promise<ThemeDynamicData | undefined> {
  const { sectionTemplates, loopTemplates } = await templatesFrom(layout, parts, request);
  const referenced: ThemeDynamicData = {
    ...(Object.keys(loopTemplates).length > 0 ? { loopTemplates } : {}),
    ...(Object.keys(sectionTemplates).length > 0 ? { sectionTemplates } : {}),
  };
  if (partType === "single_post") {
    const post = await loadSingularPost(ctx, content);
    if (!post && Object.keys(referenced).length === 0) return undefined;
    return { ...referenced, post };
  }
  if (partType === "archive") {
    const { posts, archiveTitle, pagination } = await loadArchivePosts(
      ctx,
      loopPerPage(layout),
      content,
      // W-532: the Pagination element's "Posts archive title" words it in the site's language.
      paginationArchiveTitle(layout),
      counter,
    );
    return { ...referenced, posts, archiveTitle, ...(pagination ? { pagination } : {}) };
  }
  if (Object.keys(referenced).length > 0) return referenced;
  return undefined;
}

/** W-1025: every widget runtime the rendered parts need, once each, or nothing. */
function partRuntimes(rendered: readonly RenderedPage[]): { runtimes?: WidgetRuntime[] } {
  const names = [...new Set(rendered.flatMap((page) => page.runtimes ?? []))].toSorted();
  return names.length > 0 ? { runtimes: names } : {};
}

/**
 * Resolve winning published theme parts for this request (R-062 / S7b–S7d).
 * Returns plain HTML/CSS; popup JS is optional and only when `needsPopupsRuntime`.
 * Single Post / Archive winners substitute post fields server-side.
 */
export async function resolveThemeParts(
  astro: AstroLike,
  ctx?: ThemeRequestContext,
  /** What the host knows about the visitor: segments and facts Visitors rules use (W-329). */
  options: {
    visitor?: HostVisitor;
    /** The page's language, e.g. "fr-CA", for Post Dates; defaults to Astro's locale (W-688). */
    lang?: string;
    /** Popup and float screen reader names in the site's language (W-690). */
    labels?: ChromeLabels;
    /**
     * W-916: count archive pages for "Page N of M" and the Last link. Off by default; `true`
     * uses EmVB's own one-row probe queries, or pass a counter (e.g. an EmDash count API).
     */
    pageCount?: boolean | PostCounter;
    /**
     * W-937: the page's languages, for a Language switcher in a header or footer. Pass
     * `resolveEmVBPage(...)?.translations` (or your own list of published translations).
     */
    translations?: readonly { locale: string; href: string; current: boolean }[];
  } = {},
): Promise<ResolvedThemeParts> {
  return resolveThemePartsWith(emdashContent, astro, ctx, options);
}

/** S-02: a part that fails to render is left out, so the rest of the site still renders. */
async function orSkip<T>(id: string, render: () => Promise<T | null>): Promise<T | null> {
  try {
    return await render();
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error("emvb: theme part failed to render", {
      partId: id,
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

/** Same as `resolveThemeParts`, with a content port so tests can pass a fake (W-359). */
export async function resolveThemePartsWith(
  port: ContentPort,
  astro: AstroLike,
  ctx?: ThemeRequestContext,
  options: {
    visitor?: HostVisitor;
    /** The page's language, e.g. "fr-CA", for Post Dates; defaults to Astro's locale (W-688). */
    lang?: string;
    /** Popup and float screen reader names in the site's language (W-690). */
    labels?: ChromeLabels;
    /**
     * W-916: count archive pages for "Page N of M" and the Last link. Off by default; `true`
     * uses EmVB's own one-row probe queries, or pass a counter (e.g. an EmDash count API).
     */
    pageCount?: boolean | PostCounter;
    /**
     * W-937: the page's languages, for a Language switcher in a header or footer. Pass
     * `resolveEmVBPage(...)?.translations` (or your own list of published translations).
     */
    translations?: readonly { locale: string; href: string; current: boolean }[];
  } = {},
): Promise<ResolvedThemeParts> {
  const counter =
    typeof options.pageCount === "function"
      ? options.pageCount
      : options.pageCount === true
        ? probeCounter(port)
        : undefined;
  const context =
    ctx ??
    themeContextFrom(astro.url, {
      content:
        (astro.props?.["content"] as
          | { collection: string; id: string; slug?: string | null }
          | undefined) ?? null,
    });

  const empty: ResolvedThemeParts = {
    header: null,
    footer: null,
    content: null,
    popups: [],
    floats: [],
    css: "",
    needsPopupsRuntime: false,
    needsFloatsRuntime: false,
    needsTabsRuntime: false,
    needsMenuRuntime: false,
    needsFormsRuntime: false,
    notFound: false,
    ...(context.kind === "archive" && !context.isSearch
      ? { canonicalPath: archivePagePath(context.path, context.page ?? 1) }
      : {}),
  };

  const parts = await loadPublishedThemeParts(port, astro);
  if (parts.length === 0) return empty;

  const candidates: ThemePartCandidate[] = parts.map((part) => ({
    id: part.id,
    partType: part.partType,
    conditions: part.conditions,
    updatedAt: part.updatedAt,
  }));

  const headerWinner = pickThemePartWinner(candidates, "header", context);
  const footerWinner = pickThemePartWinner(candidates, "footer", context);
  const contentType = contentPartTypeForContext(context);
  const contentWinner = contentType ? pickThemePartWinner(candidates, contentType, context) : null;
  const popupMatches = listMatchingThemeParts(candidates, "popup", context);
  const floatMatches = listMatchingThemeParts(candidates, "float", context);

  if (
    !headerWinner &&
    !footerWinner &&
    !contentWinner &&
    popupMatches.length === 0 &&
    floatMatches.length === 0
  ) {
    return empty;
  }

  const handler = port.pluginHandler(astro.locals as never);
  const design = await designFor(astro, handler, astro.url);

  const byId = new Map(parts.map((part) => [part.id, part]));
  const rendered: RenderedPage[] = [];
  // W-971: each part's scoped sheet, to write the shared rules once in `css`.
  const sheets = new Map<string, { css: string; scope: string; baseTypes: readonly string[] }>();
  // W-307: bound fields in a part read site settings and URL parameters too.
  // W-312/W-313: synced sections and Loop items the part uses count too.
  const boundFor = (stored: StoredPart, referenced: ThemeDynamicData | undefined) =>
    bindingDataFor(
      readLayout(stored.layout),
      astro.url,
      astro,
      [
        ...Object.values(referenced?.sectionTemplates ?? {}),
        ...Object.values(referenced?.loopTemplates ?? {}),
      ],
      options.visitor ? { visitor: options.visitor } : {},
      port,
    );
  const renderOne = async (
    stored: StoredPart,
    partDynamic: ThemeDynamicData | undefined,
    bound: Awaited<ReturnType<typeof bindingDataFor>>,
  ) => {
    const withBound = Object.keys(bound).length > 0 ? { ...partDynamic, ...bound } : partDynamic;
    const dynamic = options.translations
      ? { ...withBound, translations: options.translations }
      : withBound;
    const formDefinitions = await formsFor(
      astro,
      handler,
      astro.url,
      formIdsInLayouts([
        readLayout(stored.layout),
        ...Object.values(dynamic?.sectionTemplates ?? {}),
        ...Object.values(dynamic?.loopTemplates ?? {}),
      ]),
    );
    const page = renderStored(
      stored.layout,
      design,
      stored.id,
      formDefinitions,
      dynamic,
      true,
      options.lang ?? astro.currentLocale,
    );
    rendered.push(page);
    if (page.css)
      sheets.set(stored.id, { css: page.css, scope: stored.id, baseTypes: page.baseTypes ?? [] });
    // W-216: a header or footer part is the page's banner or contentinfo landmark (hosts put it
    // straight in <body> instead of their own <header>/<footer>).
    // W-586: a part that already has its own header or footer box keeps that one as the landmark;
    // a second wrapper around it would nest <header> in <header> (invalid, two banners).
    const ownLandmark = /<(?:header|footer)[\s>]/.test(page.html);
    const tag = (!ownLandmark && WRAPPER_TAGS[stored.partType]) || "div";
    const partId = escapeAttr(stored.id);
    const html = page.html
      ? `<${tag} class="emvb-theme-${stored.partType}" data-emvb-theme-part="${partId}">${page.html}</${tag}>`
      : "";
    return { html, css: page.css };
  };

  /** Synced sections and loop items a part uses, for every part type (W-200). */
  const templatesFor = async (stored: StoredPart): Promise<ThemeDynamicData | undefined> => {
    const layout = readLayout(stored.layout);
    const { sectionTemplates, loopTemplates } = layout
      ? await templatesFrom(layout, parts, astro)
      : { sectionTemplates: {}, loopTemplates: {} };
    return Object.keys(sectionTemplates).length > 0 || Object.keys(loopTemplates).length > 0
      ? {
          ...(Object.keys(loopTemplates).length > 0 ? { loopTemplates } : {}),
          ...(Object.keys(sectionTemplates).length > 0 ? { sectionTemplates } : {}),
        }
      : undefined;
  };

  let pastLastPage = false;
  let archiveInfo: { title?: string; page: number; titleText?: string } | undefined;
  const renderPart = (winner: ThemePartCandidate | null): Promise<RenderedThemePart | null> =>
    orSkip(winner?.id ?? "", () => renderPartOf(winner));
  const renderPartOf = async (
    winner: ThemePartCandidate | null,
  ): Promise<RenderedThemePart | null> => {
    const stored = winner ? byId.get(winner.id) : undefined;
    if (!stored) return null;
    const layout = readLayout(stored.layout);
    const referenced = await templatesFor(stored);
    const dynamic =
      layout && winner === contentWinner
        ? {
            ...referenced,
            ...(await buildDynamicForContent(
              stored.partType,
              context,
              layout,
              parts,
              port,
              astro,
              counter,
            )),
          }
        : referenced;
    // A page past the last one has no posts; the host answers 404 (W-221).
    if (winner === contentWinner && dynamic?.pagination) {
      archiveInfo = {
        title: dynamic.archiveTitle,
        page: dynamic.pagination.page,
        titleText: layout ? paginationTitleText(layout) : undefined,
      };
    }
    if (winner === contentWinner && (dynamic?.pagination?.page ?? 1) > 1) {
      pastLastPage = (dynamic?.posts ?? []).length === 0;
    }
    const { html, css } = await renderOne(stored, dynamic, await boundFor(stored, referenced));
    return { id: stored.id, title: stored.title, partType: stored.partType, html, css };
  };

  const header = await renderPart(headerWinner);
  const footer = await renderPart(footerWinner);
  const content = await renderPart(contentWinner);

  const extraParts = [...popupMatches, ...floatMatches]
    .map((match) => byId.get(match.id))
    .filter((stored): stored is StoredPart => stored !== undefined);
  const extraTemplates = new Map(
    await Promise.all(
      extraParts.map(async (stored) => [stored.id, await templatesFor(stored)] as const),
    ),
  );
  const extraBound = new Map(
    await Promise.all(
      extraParts.map(
        async (stored) =>
          [stored.id, await boundFor(stored, extraTemplates.get(stored.id))] as const,
      ),
    ),
  );

  const popups = (
    await Promise.all(
      popupMatches.map((match) =>
        orSkip(match.id, async () => {
          const stored = byId.get(match.id);
          if (!stored) return null;
          const { html, css } = await renderOne(
            stored,
            extraTemplates.get(stored.id),
            extraBound.get(stored.id) ?? {},
          );
          const popup: RenderedPopup = {
            id: stored.id,
            title: stored.title,
            html: wrapPopupMarkup(stored.id, html, stored.triggers, options.labels),
            css,
            triggers: stored.triggers,
          };
          return popup;
        }),
      ),
    )
  ).filter((popup): popup is RenderedPopup => popup !== null);

  const floats = (
    await Promise.all(
      floatMatches.map((match) =>
        orSkip(match.id, async () => {
          const stored = byId.get(match.id);
          if (!stored) return null;
          const { html, css } = await renderOne(
            stored,
            extraTemplates.get(stored.id),
            extraBound.get(stored.id) ?? {},
          );
          const layout = readLayout(stored.layout);
          const surface = !layout || !floatHasOwnSurface(layout, design);
          const item: RenderedFloat = {
            id: stored.id,
            title: stored.title,
            html: wrapFloatMarkup(
              stored.id,
              stored.title,
              html,
              stored.float,
              surface,
              options.labels?.close,
            ),
            css,
            settings: stored.float,
          };
          return item;
        }),
      ),
    )
  ).filter((item): item is RenderedFloat => item !== null);

  // W-971: the parts' shared rules (scope wrapper, element base rules, print) are written once.
  const ordered = [header, content, footer, ...popups, ...floats].flatMap((part) => {
    const sheet = part ? sheets.get(part.id) : undefined;
    return sheet ? [sheet] : [];
  });
  const cssParts = [sharedPartCss(ordered)];
  if (popups.length > 0) cssParts.push(POPUP_CHROME_CSS);
  if (floats.length > 0) cssParts.push(FLOAT_CHROME_CSS);
  const css = cssParts.filter(Boolean).join("\n");
  return {
    header,
    footer,
    content,
    popups,
    floats,
    css,
    needsPopupsRuntime: popups.length > 0,
    needsFloatsRuntime: floats.length > 0,
    needsTabsRuntime: rendered.some((page) => page.needsTabsRuntime),
    needsMenuRuntime: rendered.some((page) => page.needsMenuRuntime),
    needsFormsRuntime: rendered.some((page) => page.needsFormsRuntime),
    ...partRuntimes(rendered),
    notFound: pastLastPage,
    ...(design.direction ? { dir: design.direction } : {}),
    ...(archiveInfo?.title ? { archiveTitle: archiveInfo.title } : {}),
    ...(archiveInfo ? { archivePage: archiveInfo.page } : {}),
    ...(archiveInfo?.titleText ? { archiveTitleText: archiveInfo.titleText } : {}),
    ...(empty.canonicalPath ? { canonicalPath: empty.canonicalPath } : {}),
  };
}
