import { PLUGIN_ID } from "../constants.ts";
import { prepareUploadedSvg, UPLOAD_SVG_MAX_BYTES, type UploadedIconItem } from "../core/index.ts";
import { requestJson, type Fetcher } from "./api.ts";

export type { UploadedIconItem };

const BASE = `/_emdash/api/plugins/${PLUGIN_ID}`;

/** EmVB's uploaded SVG icons, newest first (W-239). */
export async function listUploadedIcons(fetcher: Fetcher): Promise<UploadedIconItem[]> {
  const data = await requestJson<{ items?: UploadedIconItem[] }>(fetcher, `${BASE}/icons`);
  return data?.items ?? [];
}

/** A new upload, or the id of an upload that already has this SVG (W-243). */
type IconUpload = { item: UploadedIconItem; imagesLeftOut: number } | { existingId: string };

/**
 * Uploads an .svg file. It is checked here first, so a refused file says why at once; the server
 * sanitizes it again whatever the browser sent. `existing` names an upload that already has the
 * cleaned SVG; then nothing is sent, so picking the same file twice doesn't store it twice.
 */
export async function uploadIconFile(
  fetcher: Fetcher,
  file: File,
  existing?: (svg: string) => string | undefined,
): Promise<IconUpload> {
  if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml")
    throw new Error("Choose an .svg file.");
  if (file.size > UPLOAD_SVG_MAX_BYTES)
    throw new Error(
      `This file is ${Math.ceil(file.size / 1024)} KB. Upload an SVG up to ${UPLOAD_SVG_MAX_BYTES / 1024} KB.`,
    );
  const svg = await file.text();
  const local = prepareUploadedSvg(svg);
  if (!local.ok) throw new Error(local.message);
  const existingId = existing?.(local.svg);
  if (existingId) return { existingId };
  return requestJson<{ item: UploadedIconItem; imagesLeftOut: number }>(
    fetcher,
    `${BASE}/icons/upload`,
    { method: "POST", body: { name: file.name, svg } },
  );
}
