import { envelopeError, readEnvelope, type Fetcher } from "./api.ts";

/** A library item as EmDash returns it from GET/POST /_emdash/api/media (with `url`). */
export type MediaLibraryItem = {
  id: string;
  filename: string;
  mimeType: string;
  size: number | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  storageKey: string;
  status: string;
  url: string;
  /** EmDash 1.4 library focal point, 0–1 (null or absent when unset). */
  focalX?: number | null;
  focalY?: number | null;
};

/** Shared EmDash media endpoint — same path on Node local and Cloudflare R2 (R-007). */
export const MEDIA_API_PATH = "/_emdash/api/media";

/** Lists ready images from the EmDash media library (R-007). */
export async function listImages(
  fetcher: Fetcher,
  opts: { limit?: number; q?: string } = {},
): Promise<MediaLibraryItem[]> {
  const params = new URLSearchParams({
    mimeType: "image/",
    limit: String(opts.limit ?? 50),
  });
  if (opts.q) params.set("q", opts.q);
  const response = await fetcher(`${MEDIA_API_PATH}?${params}`);
  const payload = await readEnvelope<{ items?: MediaLibraryItem[] }>(response);
  if (!response.ok) throw envelopeError(response, payload);
  return (payload.data?.items ?? []).filter((item) => item.status === "ready" || !item.status);
}

/**
 * Uploads a file through EmDash's multipart media endpoint. Same path on Node (local disk)
 * and Cloudflare (R2) — the host storage adapter differs, not this client (R-007).
 */
export async function uploadImage(
  fetcher: Fetcher,
  file: File,
  meta: { width?: number; height?: number; alt?: string } = {},
): Promise<MediaLibraryItem> {
  const body = new FormData();
  body.set("file", file, file.name);
  if (meta.width !== undefined) body.set("width", String(meta.width));
  if (meta.height !== undefined) body.set("height", String(meta.height));
  if (meta.alt) body.set("alt", meta.alt);
  const response = await fetcher(MEDIA_API_PATH, { method: "POST", body });
  const payload = await readEnvelope<{ item?: MediaLibraryItem; deduplicated?: boolean }>(response);
  if (!response.ok || !payload.data?.item) throw envelopeError(response, payload);
  return payload.data.item;
}

/** Applies a pasted URL onto an image node's props; the URL is already sanitized. */
export function propsFromUrl(
  current: Record<string, unknown>,
  src: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, src };
  delete next.mediaId;
  if (current.src === src) return next;
  // W-422: a different picture drops the old one's extra sizes.
  delete next.sources;
  // W-482: an image-editor record describes the old picture; kept, re-opening would edit it.
  delete next.edit;
  // W-425: a library image's width and height describe that file, not the pasted one.
  if (current.mediaId) {
    delete next.width;
    delete next.height;
  }
  return next;
}

/** The layout's Image width and height top out at 10000 (core/schema/layout.ts). */
const MAX_IMAGE_SIDE = 10_000;

/**
 * W-496: a library picture over 10000 px on a side would be written as-is and the whole draft
 * refused. Its size only sets the aspect ratio, so it is scaled down to fit, keeping the ratio.
 */
function fitImageSize(
  next: Record<string, unknown>,
  width: number | undefined | null,
  height: number | undefined | null,
): void {
  if (!width || !height) {
    if (width) next.width = Math.min(Math.round(width), MAX_IMAGE_SIDE);
    if (height) next.height = Math.min(Math.round(height), MAX_IMAGE_SIDE);
    return;
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  next.width = Math.max(1, Math.round(width * scale));
  next.height = Math.max(1, Math.round(height * scale));
}

const unitCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/**
 * W-915: EmDash 1.4 stores a focal point per library image (0–1). A newly picked picture takes it
 * as the element's focal point (0–100 %); one the editor set on this same picture is kept.
 */
function libraryFocal(
  next: Record<string, unknown>,
  current: Record<string, unknown>,
  item: MediaLibraryItem,
): void {
  const samePicture = current.src === item.url;
  if (samePicture && current.focalX !== undefined) return;
  if (unitCoordinate(item.focalX) && unitCoordinate(item.focalY)) {
    next.focalX = Math.round(item.focalX * 100);
    next.focalY = Math.round(item.focalY * 100);
  } else if (!samePicture) {
    delete next.focalX;
    delete next.focalY;
  }
}

/** Applies a library item onto an image node's props (id, URL, alt, dimensions). */
export function propsFromMedia(
  current: Record<string, unknown>,
  item: MediaLibraryItem,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, src: item.url, mediaId: item.id };
  // W-422: extra sizes belong to the old picture; kept, the browser could still show it.
  if (current.src !== item.url) {
    delete next.sources;
    // W-482: the image-editor record belongs to the old picture.
    delete next.edit;
  }
  fitImageSize(next, item.width, item.height);
  libraryFocal(next, current, item);
  const alt = current.alt;
  if ((!alt || alt === "Image") && item.alt) next.alt = item.alt;
  else if (!alt || alt === "Image") next.alt = item.filename.replace(/\.[^.]+$/, "") || "Image";
  return next;
}

/** One library item by id (EmDash GET /_emdash/api/media/:id); null when it is gone. */
export async function getMedia(fetcher: Fetcher, id: string): Promise<MediaLibraryItem | null> {
  const response = await fetcher(`${MEDIA_API_PATH}/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  const payload = await readEnvelope<{ item?: MediaLibraryItem } & Partial<MediaLibraryItem>>(
    response,
  );
  if (!response.ok) throw envelopeError(response, payload);
  const data = payload.data;
  const item = data?.item ?? (data?.id ? (data as MediaLibraryItem) : null);
  if (!item) return null;
  // GET by id has no `url` (only the list adds it); build the same file path.
  return item.url ? item : { ...item, url: `${MEDIA_API_PATH}/file/${item.storageKey}` };
}

/**
 * An edited copy replaces the picture (W-485): the new file's id, URL and size, plus the edit
 * record. Extra sizes belonged to the old file, so they go; alt and the rest stay.
 */
export function propsFromEdited(
  current: Record<string, unknown>,
  item: Pick<MediaLibraryItem, "id" | "url" | "width" | "height">,
  edit: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, src: item.url, edit };
  next.mediaId = item.id;
  delete next.sources;
  fitImageSize(next, item.width, item.height);
  return next;
}

/**
 * "Reset to original" (W-485): back to the untouched file. The edited copy stays in the library.
 * Without the library item (deleted, or no id) the recorded URL is used and the size is dropped.
 */
export function propsFromOriginal(
  current: Record<string, unknown>,
  original: Pick<MediaLibraryItem, "id" | "url" | "width" | "height"> | null,
): Record<string, unknown> | null {
  const edit = current.edit as { originalSrc?: unknown } | undefined;
  // W-583: trimmed like load.ts, so a blank record is no record.
  const originalSrc = typeof edit?.originalSrc === "string" ? edit.originalSrc.trim() : "";
  if (!original && !originalSrc) return null;
  const next: Record<string, unknown> = { ...current };
  delete next.edit;
  delete next.sources;
  if (original) {
    next.src = original.url || originalSrc;
    next.mediaId = original.id;
    delete next.width;
    delete next.height;
    fitImageSize(next, original.width, original.height);
  } else {
    next.src = originalSrc;
    delete next.mediaId;
    delete next.width;
    delete next.height;
  }
  return next;
}

/**
 * Uploads an edited copy and returns the element's new props (W-485/W-486): shared by Image
 * settings, the media picker's Edit… and the command palette.
 */
export async function saveEditedCopy(
  fetcher: Fetcher,
  current: Record<string, unknown>,
  file: File,
  copy: { width: number; height: number; edit: unknown },
): Promise<Record<string, unknown>> {
  const alt = typeof current.alt === "string" && current.alt !== "Image" ? current.alt : undefined;
  const item = await uploadImage(fetcher, file, {
    width: copy.width,
    height: copy.height,
    ...(alt ? { alt } : {}),
  });
  return propsFromEdited(
    current,
    { ...item, width: item.width ?? copy.width, height: item.height ?? copy.height },
    copy.edit,
  );
}
