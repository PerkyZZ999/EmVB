/**
 * W-1090 (#32): reading an EmDash image field's value. EmDash's admin stores a local upload as
 * `{ id, provider: "local", meta: { storageKey }, mimeType }` with no `src`, and builds its URL
 * at render time, so a reader that only looked at `src` found no image at all.
 */

/** EmDash's own route for local media files (its `INTERNAL_MEDIA_PREFIX`). */
const LOCAL_MEDIA = "/_emdash/api/media/file/";
/** The field EmVB has always read when a Loop names none. */
export const DEFAULT_IMAGE_FIELD = "featured_image";
const IMAGE_PATH = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;

type MediaLike = {
  id?: unknown;
  provider?: unknown;
  src?: unknown;
  url?: unknown;
  previewUrl?: unknown;
  mimeType?: unknown;
  meta?: unknown;
};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** A storage key as a path under the media route, or undefined for one that leaves it. */
function keyPath(key: string): string | undefined {
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return undefined;
  return segments.map(encodeURIComponent).join("/");
}

/** The URL an EmDash media value points at: its own URL, else a local file's route. */
export function mediaUrlOf(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const media = value as MediaLike;
  const direct = text(media.src) ?? text(media.url) ?? text(media.previewUrl);
  if (direct) return direct;
  const provider = text(media.provider);
  if (provider && provider !== "local") return undefined;
  const meta = media.meta && typeof media.meta === "object" ? (media.meta as MediaLike) : {};
  const storageKey = text((meta as { storageKey?: unknown }).storageKey);
  const path = storageKey ? keyPath(storageKey) : undefined;
  if (path) return `${LOCAL_MEDIA}${path}`;
  // As EmDash's own image component: a local item without a storage key goes by its id.
  const id = text(media.id);
  return id ? `${LOCAL_MEDIA}${encodeURIComponent(id)}` : undefined;
}

/** True for an image field's value: a media value with an image type or an image file name. */
export function isImageValue(value: unknown): boolean {
  const url = mediaUrlOf(value);
  if (!url) return false;
  const mimeType = text((value as MediaLike).mimeType);
  if (mimeType) return mimeType.toLowerCase().startsWith("image/");
  return IMAGE_PATH.test(url) || url.startsWith(LOCAL_MEDIA);
}

/**
 * The image an entry shows when its Loop or post names no field: `featured_image` when it has
 * one, else the entry's first field holding an image (the collection's first image field).
 */
export function automaticImageField(data: Record<string, unknown>): string | undefined {
  if (isImageValue(data[DEFAULT_IMAGE_FIELD])) return DEFAULT_IMAGE_FIELD;
  return Object.keys(data).find((key) => isImageValue(data[key]));
}

/** The image value an entry shows: the named field's, or the automatic one's. */
export function entryImageValue(data: Record<string, unknown>, field?: string): unknown {
  if (field) return data[field];
  const auto = automaticImageField(data);
  return auto ? data[auto] : undefined;
}

/**
 * The image fields a collection's schema lists, for the editor's picker: `featured_image` first
 * when it is one, as the automatic choice reads it first.
 */
export function imageFieldsOf(
  fields: readonly { slug: string; type: string; label?: string | null }[],
): { slug: string; label: string }[] {
  const images = fields
    .filter((f) => f.type === "image")
    .map((f) => ({ slug: f.slug, label: f.label?.trim() || f.slug }));
  const preferred = images.findIndex((f) => f.slug === DEFAULT_IMAGE_FIELD);
  if (preferred > 0) images.unshift(...images.splice(preferred, 1));
  return images;
}
