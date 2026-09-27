import { getEmDashCollection } from "emdash";
import { getPublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
  defaultConditions,
  pickThemePartWinner,
  validateConditions,
  type ThemePartCandidate,
  type ThemeRequestContext,
} from "../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../constants.ts";
import { loadDesign, renderStored, type RenderedPage } from "./render.ts";
import { themeContextFrom } from "./theme-context.ts";

export type RenderedThemePart = {
  id: string;
  title: string;
  partType: "header" | "footer";
  html: string;
  css: string;
};

export type ResolvedThemeParts = {
  header: RenderedThemePart | null;
  footer: RenderedThemePart | null;
  /** Concatenated CSS for both winners (empty when neither matches). */
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
  partType: "header" | "footer";
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
    const partType = data["part_type"];
    if (partType !== "header" && partType !== "footer") continue;
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
 * Resolve the winning published Header and Footer for this request (R-062).
 * Returns plain HTML/CSS only — no EmVB JS (R-031).
 */
export async function resolveThemeParts(
  astro: AstroLike,
  ctx?: ThemeRequestContext,
): Promise<ResolvedThemeParts> {
  const context =
    ctx ??
    themeContextFrom(astro.url, {
      content: (astro.props?.["content"] as
        | { collection: string; id: string; slug?: string | null }
        | undefined) ?? null,
    });

  const parts = await loadPublishedThemeParts();
  if (parts.length === 0) {
    return { header: null, footer: null, css: "" };
  }

  const candidates: ThemePartCandidate[] = parts.map((part) => ({
    id: part.id,
    partType: part.partType,
    conditions: part.conditions,
    updatedAt: part.updatedAt,
  }));

  const headerWinner = pickThemePartWinner(candidates, "header", context);
  const footerWinner = pickThemePartWinner(candidates, "footer", context);
  if (!headerWinner && !footerWinner) {
    return { header: null, footer: null, css: "" };
  }

  const handler = getPublicPluginApiRouteHandler(astro.locals as never);
  const design = await loadDesign(handler, astro.url);

  const renderPart = (
    winner: ThemePartCandidate,
  ): RenderedThemePart | null => {
    const stored = parts.find((p) => p.id === winner.id);
    if (!stored) return null;
    const rendered: RenderedPage = renderStored(
      stored.layout,
      design,
      stored.id,
    );
    // Marker wrapper only — renderPage already emits .emvb-root with design vars.
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
  const css = [header?.css, footer?.css].filter(Boolean).join("\n");
  return { header, footer, css };
}
