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
  // W-303: EmDash's own publish date is `data.publishedAt`, a `Date`; a custom field may be text.
  const publishedAt = ["published_at", "publishedAt", "date"]
    .map((key) => entryTimestamp(data[key]))
    .find(Boolean);
  const authorName = authorFrom(data);
  const fields = plainFieldsOf(data);
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
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  };
}

/** Field names a binding may read; EmDash's internal fields are left out. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
/** Already on ThemePostFields under their own names. */
const MAPPED = new Set(["id", "slug", "title", "excerpt", "content"]);

/**
 * The entry's plain fields for data bindings (W-307): text, numbers, true/false, and an image
 * field's URL. Rich text and other objects are left out; at most 100 fields, text cut at 2000.
 */
export function plainFieldsOf(
  data: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const fields: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Object.keys(fields).length >= 100) break;
    if (!FIELD_NAME.test(key) || MAPPED.has(key)) continue;
    if (typeof value === "string") fields[key] = value.slice(0, 2000);
    else if (typeof value === "number" && Number.isFinite(value)) fields[key] = value;
    else if (typeof value === "boolean") fields[key] = value;
    else if (value instanceof Date) {
      const iso = entryTimestamp(value);
      if (iso) fields[key] = iso;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const url = mediaFieldsFrom(value).featuredImageUrl;
      if (url) fields[key] = url;
    }
  }
  return fields;
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
  // W-304: EmDash hydrates the primary byline onto `data.byline` (a BylineSummary).
  const byline = data["byline"];
  if (byline && typeof byline === "object" && "displayName" in byline) {
    const name = (byline as { displayName?: unknown }).displayName;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return undefined;
}
