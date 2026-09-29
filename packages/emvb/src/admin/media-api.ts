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

/** Applies a library item onto an image node's props (id, URL, alt, dimensions). */
export function propsFromMedia(
  current: Record<string, unknown>,
  item: MediaLibraryItem,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current, src: item.url, mediaId: item.id };
  if (item.width) next.width = item.width;
  if (item.height) next.height = item.height;
  const alt = current.alt;
  if ((!alt || alt === "Image") && item.alt) next.alt = item.alt;
  else if (!alt || alt === "Image") next.alt = item.filename.replace(/\.[^.]+$/, "") || "Image";
  return next;
}
