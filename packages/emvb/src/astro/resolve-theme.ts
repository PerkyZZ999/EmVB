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

async function loadPublishedThemeParts(): Promise<StoredPart[]> {
  let result: Awaited<ReturnType<typeof getEmDashCollection>>;
  try {
    // Order in JS: D1/SQLite columns are snake_case; camelCase orderBy fails the query.
    result = await getEmDashCollection(THEME_PARTS_COLLECTION, {
      status: "published",
      limit: 50,
    });
  } catch {
    return [];
  }
  if (result.error || !result.entries?.length) return [];
  const parts: StoredPart[] = [];
  for (const entry of result.entries) {
    const data = entry.data as Record<string, unknown>;
    const partType = parseThemePartType(data["part_type"]);
    if (!partType) continue;
    const conditionsRaw = data["conditions"];
    const validated = validateConditions(
      conditionsRaw === undefined || conditionsRaw === null || conditionsRaw === ""
        ? defaultConditions()
        : conditionsRaw,
    );
    if (!validated.ok) continue;
    const triggersRaw = data["triggers"];
    const triggersValidated = validateTriggers(
      triggersRaw === undefined || triggersRaw === null || triggersRaw === ""
        ? defaultTriggers()
        : triggersRaw,
    );
    // Invalid triggers fail closed for popups; other part types ignore triggers.
    const triggers = triggersValidated.ok ? triggersValidated.triggers : defaultTriggers();
    if (partType === "popup" && !triggersValidated.ok) continue;
    parts.push({
      id: String(data["id"] ?? entry.id),
      title: typeof data["title"] === "string" ? data["title"] : "",
      partType,
      layout: data["layout"],
      conditions: validated.conditions,
      triggers,
      updatedAt: String(data["updatedAt"] ?? data["updated_at"] ?? ""),
    });
  }
  parts.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return parts;
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

  const renderPart = async (winner: ThemePartCandidate): Promise<RenderedThemePart | null> => {
    const stored = parts.find((p) => p.id === winner.id);
    if (!stored) return null;
    const layout = readLayout(stored.layout);
    const dynamic =
      layout && contentWinner && winner.id === contentWinner.id
        ? await buildDynamicForContent(stored.partType, context, layout, parts)
        : undefined;
    const rendered: RenderedPage = renderStored(
      stored.layout,
      design,
      stored.id,
      undefined,
      dynamic,
    );
    const html = rendered.html
      ? `<div class="emvb-theme-${stored.partType}" data-emvb-theme-part="${stored.id}">${rendered.html}</div>`
      : "";
    return {
      id: stored.id,
      title: stored.title,
      partType: stored.partType,
      html,
      css: rendered.css,
    };
  };

  const header = headerWinner ? await renderPart(headerWinner) : null;
  const footer = footerWinner ? await renderPart(footerWinner) : null;
  const content = contentWinner ? await renderPart(contentWinner) : null;

  const popups: RenderedPopup[] = [];
  for (const match of popupMatches) {
    const stored = parts.find((p) => p.id === match.id);
    if (!stored) continue;
    const rendered: RenderedPage = renderStored(stored.layout, design, stored.id);
    const body = rendered.html
      ? `<div class="emvb-theme-popup" data-emvb-theme-part="${stored.id}">${rendered.html}</div>`
      : "";
    popups.push({
      id: stored.id,
      title: stored.title,
      html: wrapPopupMarkup(stored.id, body, stored.triggers),
      css: rendered.css,
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
  };
}
