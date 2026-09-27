import { getEmDashCollection } from "emdash";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
  contentPartTypeForContext,
  defaultConditions,
  parseThemePartType,
  pickThemePartWinner,
  validateConditions,
  type ThemePartCandidate,
  type ThemePartType,
  type ThemeRequestContext,
} from "../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../constants.ts";
import { loadDesign, renderStored, type RenderedPage } from "./render.ts";
import { themeContextFrom } from "./theme-context.ts";

export type RenderedThemePart = {
  id: string;
  title: string;
  partType: ThemePartType;
  html: string;
  css: string;
};

export type ResolvedThemeParts = {
  header: RenderedThemePart | null;
  footer: RenderedThemePart | null;
  /**
   * Body/main replacement when an Error 404, Search Results, or Single Page part wins.
   * Null when none match — hosts keep their route slot content.
   */
  content: RenderedThemePart | null;
  /** Concatenated CSS for all winners (empty when none match). */
  css: string;
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
  updatedAt: string;
};

async function loadPublishedThemeParts(): Promise<StoredPart[]> {
  let result: Awaited<ReturnType<typeof getEmDashCollection>>;
  try {
    result = await getEmDashCollection(THEME_PARTS_COLLECTION, {
      status: "published",
      limit: 50,
      orderBy: { updatedAt: "desc" },
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
    parts.push({
      id: String(data["id"] ?? entry.id),
      title: typeof data["title"] === "string" ? data["title"] : "",
      partType,
      layout: data["layout"],
      conditions: validated.conditions,
      updatedAt: String(data["updatedAt"] ?? data["updated_at"] ?? ""),
    });
  }
  return parts;
}

/**
 * Resolve winning published theme parts for this request (R-062 / S7c).
 * Returns plain HTML/CSS only — no EmVB JS (R-031).
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
    css: "",
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

  if (!headerWinner && !footerWinner && !contentWinner) return empty;

  const handler = getPublicPluginApiRouteHandler(astro.locals as never);
  const design = await loadDesign(handler, astro.url);

  const renderPart = (winner: ThemePartCandidate): RenderedThemePart | null => {
    const stored = parts.find((p) => p.id === winner.id);
    if (!stored) return null;
    const rendered: RenderedPage = renderStored(stored.layout, design, stored.id);
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

  const header = headerWinner ? renderPart(headerWinner) : null;
  const footer = footerWinner ? renderPart(footerWinner) : null;
  const content = contentWinner ? renderPart(contentWinner) : null;
  const css = [header?.css, content?.css, footer?.css].filter(Boolean).join("\n");
  return { header, footer, content, css };
}
