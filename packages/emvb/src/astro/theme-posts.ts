import type { ThemePostFields } from "../core/index.ts";

type MediaLike = {
  src?: unknown;
  url?: unknown;
  previewUrl?: unknown;
  alt?: unknown;
};

/** Pull a sanitized-ready image URL + alt from an EmDash media / image field value. */
export function mediaFieldsFrom(value: unknown): {
  featuredImageUrl?: string;
  featuredImageAlt?: string;
} {
  if (!value || typeof value !== "object") return {};
  const media = value as MediaLike;
  const candidates = [media.src, media.url, media.previewUrl];
  let featuredImageUrl: string | undefined;
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      featuredImageUrl = candidate.trim();
      break;
    }
  }
  const featuredImageAlt =
    typeof media.alt === "string" && media.alt.trim() ? media.alt.trim() : undefined;
  return { featuredImageUrl, featuredImageAlt };
}

/**
 * An entry timestamp as an ISO string (W-302). EmDash hands system dates (`updatedAt`,
 * `publishedAt`) to templates as `Date` objects, so `String()` gave "Sun Sep 06 2026 …".
 */
export function entryTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Normalize an EmDash posts collection entry (or plain data bag) into ThemePostFields.
 * Permalink defaults to `/posts/{slug}` to match the demo routes.
 */
export function themePostFromEntry(
  entry: { id?: string; data?: Record<string, unknown> } | Record<string, unknown>,
  options: { permalinkPrefix?: string } = {},
): ThemePostFields | null {
  const data =
    "data" in entry && entry.data && typeof entry.data === "object"
      ? (entry.data as Record<string, unknown>)
      : (entry as Record<string, unknown>);
  const id = String(data["id"] ?? ("id" in entry ? entry.id : "") ?? "");
  const slug = typeof data["slug"] === "string" ? data["slug"] : id;
  if (!slug && !id) return null;
  const title = typeof data["title"] === "string" ? data["title"] : "";
  const excerpt = typeof data["excerpt"] === "string" ? data["excerpt"] : "";
  const content = data["content"] ?? "";
  const prefix = options.permalinkPrefix ?? "/posts";
  const permalink = `${prefix.replace(/\/$/, "")}/${slug || id}`;
  const media = mediaFieldsFrom(data["featured_image"]);
  const publishedAt = firstString(data, ["published_at", "publishedAt", "date"]);
  const authorName = authorFrom(data);
  return {
    id: id || slug,
    slug: slug || id,
    title,
    excerpt,
    content,
    permalink,
    ...(publishedAt ? { publishedAt } : {}),
    ...(authorName ? { authorName } : {}),
    ...media,
  };
}

function firstString(data: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function authorFrom(data: Record<string, unknown>): string | undefined {
  const direct = firstString(data, ["author_name", "authorName"]);
  if (direct) return direct;
  const author = data["author"];
  if (typeof author === "string" && author.trim()) return author.trim();
  if (author && typeof author === "object" && "name" in author) {
    const name = (author as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return undefined;
}
