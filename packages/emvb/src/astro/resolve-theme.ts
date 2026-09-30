import { getEmDashCollection, getEmDashEntry } from "emdash";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
  collectLoopItemPartIds,
  contentPartTypeForContext,
  defaultConditions,
  defaultTriggers,
  listMatchingThemeParts,
  parseThemePartType,
  pickThemePartWinner,
  POPUP_CHROME_CSS,
  validateConditions,
  validateTriggers,
  wrapPopupMarkup,
  type Layout,
  type ThemeDynamicData,
  type ThemePartCandidate,
  type ThemePartType,
  type ThemePostFields,
  type ThemeRequestContext,
  type TriggersDoc,
} from "../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../constants.ts";
import { loadDesign, readLayout, renderStored, type RenderedPage } from "./render.ts";
import { themeContextFrom } from "./theme-context.ts";
import { themePostFromEntry } from "./theme-posts.ts";

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
  /** Concatenated CSS for all winners (empty when none match). */
  css: string;
  /** Hosts load `EmVBPopupsRuntime` only when this is true (R-031). */
  needsPopupsRuntime: boolean;
  /** Hosts load `EmVBTabsRuntime` only when Tabs appear in a winning part (R-031 / W-078). */
  needsTabsRuntime: boolean;
};

type AstroLike = {
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
  return {
    id: String(data["id"] ?? entry.id),
    title: typeof data["title"] === "string" ? data["title"] : "",
    partType,
    layout: data["layout"],
    conditions: conditions.conditions,
    triggers: triggers.ok ? triggers.triggers : defaultTriggers(),
    updatedAt: String(data["updatedAt"] ?? data["updated_at"] ?? ""),
  };
}

const THEME_PARTS_PAGE = 50;
/** Enough pages for any real site; stops a cursor that never ends. */
const THEME_PARTS_MAX_PAGES = 20;

/** Every published theme part, page by page; a failed page ends the read with what came before. */
async function loadPublishedThemeParts(): Promise<StoredPart[]> {
  const entries: Awaited<ReturnType<typeof getEmDashCollection>>["entries"] = [];
  let cursor: string | undefined;
  for (let page = 0; page < THEME_PARTS_MAX_PAGES; page += 1) {
    let result: Awaited<ReturnType<typeof getEmDashCollection>>;
    try {
      // No orderBy: D1/SQLite columns are snake_case and camelCase orderBy fails the query.
      // Winners and popup order come from updatedAt in core/theme/conditions.ts.
      // oxlint-disable-next-line no-await-in-loop -- each page needs the previous page's cursor
      result = await getEmDashCollection(THEME_PARTS_COLLECTION, {
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

async function loadLoopTemplates(
  layout: Layout,
  parts: StoredPart[],
): Promise<Record<string, Layout>> {
  const ids = collectLoopItemPartIds(layout);
  if (ids.length === 0) return {};
  const byId = new Map(parts.map((p) => [p.id, p]));
  const templates: Record<string, Layout> = {};
  for (const id of ids) {
    const part = byId.get(id);
    if (!part || part.partType !== "loop_item") continue;
    const itemLayout = readLayout(part.layout);
    if (itemLayout) templates[id] = itemLayout;
  }
  return templates;
}

async function loadSingularPost(ctx: ThemeRequestContext): Promise<ThemePostFields | undefined> {
  if (ctx.kind !== "singular" || ctx.collection !== "posts") return undefined;
  const key = ctx.entryId || undefined;
  // Prefer slug from path `/posts/{slug}` when entry id is missing.
  const pathSlug = /^\/posts\/([^/]+)$/.exec(ctx.path)?.[1];
  const lookup = key || (pathSlug ? decodeURIComponent(pathSlug) : undefined);
  if (!lookup) return undefined;
  try {
    const { entry } = await getEmDashEntry("posts", lookup);
    if (!entry) return undefined;
    return themePostFromEntry(entry) ?? undefined;
  } catch {
    return undefined;
  }
}

async function loadArchivePosts(ctx: ThemeRequestContext): Promise<{
  posts: ThemePostFields[];
  archiveTitle?: string;
}> {
  if (ctx.kind !== "archive" || ctx.isSearch) return { posts: [] };
  try {
    const filter: {
      orderBy: { published_at: "desc" };
      limit: number;
      where?: Record<string, string>;
    } = {
      orderBy: { published_at: "desc" },
      limit: 20,
    };
    if (ctx.taxonomy?.type === "category") {
      filter.where = { category: ctx.taxonomy.slug };
    } else if (ctx.taxonomy?.type === "tag") {
      filter.where = { tag: ctx.taxonomy.slug };
    }
    const result = await getEmDashCollection("posts", filter);
    if (result.error || !result.entries) return { posts: [] };
    const posts = result.entries
      .map((entry) => themePostFromEntry(entry))
      .filter((p): p is ThemePostFields => p !== null);
    const archiveTitle = ctx.taxonomy?.slug
      ? ctx.taxonomy.slug
      : ctx.collection === "posts"
        ? "Posts"
        : undefined;
    return { posts, archiveTitle };
  } catch {
    return { posts: [] };
  }
}

async function buildDynamicForContent(
  partType: ThemePartType,
  ctx: ThemeRequestContext,
  layout: Layout,
  parts: StoredPart[],
): Promise<ThemeDynamicData | undefined> {
  const loopTemplates = await loadLoopTemplates(layout, parts);
  if (partType === "single_post") {
    const post = await loadSingularPost(ctx);
    if (!post && Object.keys(loopTemplates).length === 0) return undefined;
    return { post, loopTemplates };
  }
  if (partType === "archive") {
    const { posts, archiveTitle } = await loadArchivePosts(ctx);
    return { posts, archiveTitle, loopTemplates };
  }
  if (Object.keys(loopTemplates).length > 0) return { loopTemplates };
  return undefined;
}

/**
 * Resolve winning published theme parts for this request (R-062 / S7b–S7d).
 * Returns plain HTML/CSS; popup JS is optional and only when `needsPopupsRuntime`.
 * Single Post / Archive winners substitute post fields server-side.
 */
export async function resolveThemeParts(
  astro: AstroLike,
  ctx?: ThemeRequestContext,
): Promise<ResolvedThemeParts> {
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
    css: "",
    needsPopupsRuntime: false,
    needsTabsRuntime: false,
  };

  const parts = await loadPublishedThemeParts();
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

  if (!headerWinner && !footerWinner && !contentWinner && popupMatches.length === 0) {
    return empty;
  }

  const handler = getPublicPluginApiRouteHandler(astro.locals as never);
  const design = await loadDesign(handler, astro.url);

  const byId = new Map(parts.map((part) => [part.id, part]));
  const rendered: RenderedPage[] = [];
  const renderOne = (stored: StoredPart, dynamic?: ThemeDynamicData) => {
    const page = renderStored(stored.layout, design, stored.id, undefined, dynamic);
    rendered.push(page);
    const html = page.html
      ? `<div class="emvb-theme-${stored.partType}" data-emvb-theme-part="${stored.id}">${page.html}</div>`
      : "";
    return { html, css: page.css };
  };

  const renderPart = async (
    winner: ThemePartCandidate | null,
  ): Promise<RenderedThemePart | null> => {
    const stored = winner ? byId.get(winner.id) : undefined;
    if (!stored) return null;
    const layout = readLayout(stored.layout);
    const dynamic =
      layout && winner === contentWinner
        ? await buildDynamicForContent(stored.partType, context, layout, parts)
        : undefined;
    const { html, css } = renderOne(stored, dynamic);
    return { id: stored.id, title: stored.title, partType: stored.partType, html, css };
  };

  const header = await renderPart(headerWinner);
  const footer = await renderPart(footerWinner);
  const content = await renderPart(contentWinner);

  const popups: RenderedPopup[] = [];
  for (const match of popupMatches) {
    const stored = byId.get(match.id);
    if (!stored) continue;
    const { html, css } = renderOne(stored);
    popups.push({
      id: stored.id,
      title: stored.title,
      html: wrapPopupMarkup(stored.id, html, stored.triggers),
      css,
      triggers: stored.triggers,
    });
  }

  const cssParts = [header?.css, content?.css, footer?.css, ...popups.map((p) => p.css)];
  if (popups.length > 0) cssParts.push(POPUP_CHROME_CSS);
  const css = cssParts.filter(Boolean).join("\n");
  return {
    header,
    footer,
    content,
    popups,
    css,
    needsPopupsRuntime: popups.length > 0,
    needsTabsRuntime: rendered.some((page) => page.needsTabsRuntime),
  };
}
