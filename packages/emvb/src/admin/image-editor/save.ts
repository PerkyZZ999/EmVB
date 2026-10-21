/**
 * Saving an edited picture (W-485): export settings, the output file and the `edit` record.
 * No photocn import here, so this stays testable without WebGL.
 */
import { IMAGE_EDIT_RECIPE_MAX_BYTES, ImageEdit, ImageEditRecipe } from "../../core/index.ts";
import type { ImageEditOutput } from "../../core/image-edit/schema.ts";
import { stripJpegGps } from "./exif.ts";

/** photocn version the recipes are written for (checked against package.json in tests). */
export const PHOTOCN_VERSION = "0.1.2";

export type ExportFormat = ImageEditOutput["format"];

/** photocn's export formats, WebP first and recommended for the site (W-485 defaults). */
export const EXPORT_FORMATS = [
  { value: "webp", label: "WebP (recommended)", lossy: true, defaultQuality: 0.85 },
  { value: "jpeg", label: "JPEG", lossy: true, defaultQuality: 0.85 },
  { value: "png", label: "PNG", lossy: false, defaultQuality: 1 },
] as const satisfies readonly {
  value: ExportFormat;
  label: string;
  lossy: boolean;
  defaultQuality: number;
}[];

/** The longest side of a saved copy is capped to this by default. */
export const DEFAULT_MAX_SIDE = 2560;
const EXT: Record<ExportFormat, string> = { webp: "webp", jpeg: "jpg", png: "png" };

export function formatInfo(format: ExportFormat) {
  return EXPORT_FORMATS.find((f) => f.value === format) ?? EXPORT_FORMATS[0];
}

type Size = { width: number; height: number };

/** The default output width: full size, or less so the longest side fits `maxSide`. */
export function cappedWidth(full: Size, maxSide = DEFAULT_MAX_SIDE): number | null {
  const longest = Math.max(full.width, full.height);
  if (longest <= maxSide) return null;
  // W-581: floor, so rounding never pushes the following height past the cap (tall strips).
  return Math.max(1, Math.floor((full.width * maxSide) / longest));
}

/** Output size for a chosen width (null = full size); the height follows the crop. */
export function outputSize(full: Size, width: number | null): Size {
  if (!width) return full;
  return { width, height: Math.max(1, Math.round((width * full.height) / full.width)) };
}

/** "garden.jpg" + webp → "garden-edited.webp"; an earlier "-edited" isn't repeated. */
export function editedFileName(name: string, format: ExportFormat): string {
  const base =
    name
      .replace(/\.[^./]+$/, "")
      .replace(/-edited$/, "")
      // W-593: letters and digits in any script are kept (pageSlug does the same, W-591).
      .replace(/[^\p{L}\p{M}\p{N}_.-]+/gu, "-")
      // W-539: no leading dots (a hidden file) and at most 100 characters.
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 100)
      .replace(/[-.]+$/g, "") || "image";
  return `${base}-edited.${EXT[format]}`;
}

/** The file to upload: JPEG location data is removed when asked (photocn copies the EXIF). */
export async function outputFile(
  blob: Blob,
  name: string,
  format: ExportFormat,
  stripGps: boolean,
): Promise<{ file: File; gpsRemoved: boolean }> {
  const type = blob.type || `image/${format}`;
  if (format !== "jpeg" || !stripGps) {
    return { file: new File([blob], name, { type }), gpsRemoved: false };
  }
  const { bytes, removed } = stripJpegGps(await blob.arrayBuffer());
  return { file: new File([bytes], name, { type }), gpsRemoved: removed };
}

/** True when a JPEG source carries GPS location data. */
export async function hasGps(blob: Blob): Promise<boolean> {
  if (!/jpe?g/i.test(blob.type)) return false;
  return stripJpegGps(await blob.arrayBuffer()).removed;
}

/**
 * The record saved on the element. It always points at the untouched original: an edit of an
 * edit keeps the first original, so re-opening never stacks losses.
 */
export function buildImageEdit(input: {
  imageProps: Record<string, unknown>;
  recipe: unknown;
  output: ImageEditOutput;
  now?: Date;
}): { ok: true; edit: ImageEdit } | { ok: false; message: string } {
  const { imageProps, output } = input;
  const prior = ImageEdit.safeParse(imageProps.edit);
  // W-582: a damaged record (e.g. a newer photocn's recipe key) still names the original the
  // editor opened (load.ts reads edit.originalSrc leniently), so keep pointing there.
  const raw = (imageProps.edit ?? {}) as { originalSrc?: unknown; originalMediaId?: unknown };
  const rawSrc = typeof raw.originalSrc === "string" ? raw.originalSrc.trim() : "";
  const rawId = typeof raw.originalMediaId === "string" ? raw.originalMediaId : "";
  const originalSrc = prior.success
    ? prior.data.originalSrc
    : rawSrc
      ? rawSrc
      : typeof imageProps.src === "string"
        ? imageProps.src
        : "";
  const priorId = prior.success
    ? prior.data.originalMediaId
    : rawSrc && rawId.length >= 1 && rawId.length <= 128
      ? rawId
      : undefined;
  const originalMediaId =
    priorId ?? (typeof imageProps.mediaId === "string" ? imageProps.mediaId : undefined);
  const parsed = ImageEdit.safeParse({
    v: 1,
    engine: "photocn",
    engineVersion: PHOTOCN_VERSION,
    recipe: (input.recipe as ImageEditRecipe | null) ?? { version: 1 },
    ...(originalMediaId ? { originalMediaId } : {}),
    originalSrc,
    output,
    editedAt: (input.now ?? new Date()).toISOString(),
  });
  if (parsed.success) return { ok: true, edit: parsed.data };
  const issue = parsed.error.issues[0];
  return {
    ok: false,
    message: `This edit can't be saved${issue?.message ? `: ${issue.message}` : "."}`,
  };
}

/** The recipe to re-apply when re-opening, or null for none or a damaged record. */
export function savedRecipe(imageProps: Record<string, unknown>): ImageEditRecipe | null {
  const parsed = ImageEdit.safeParse(imageProps.edit);
  if (!parsed.success) return null;
  const { recipe } = parsed.data;
  return Object.keys(recipe).some((k) => k !== "version" && k !== "name") ? recipe : null;
}

/** W-862 (IE-2): the edit recipe as a JSON file, as photocn's recipe export. */
export function recipeFileText(recipe: ImageEditRecipe): string {
  return `${JSON.stringify({ emvbImageRecipe: 1, photocn: PHOTOCN_VERSION, recipe }, null, 2)}\n`;
}

/** A recipe file larger than this isn't read at all (W-881). */
export const RECIPE_FILE_MAX_BYTES = IMAGE_EDIT_RECIPE_MAX_BYTES * 4;

export type RecipeFileResult = { ok: true; recipe: ImageEditRecipe } | { ok: false; error: string };

/** Reads a recipe file (ours, or a bare photocn recipe) and checks it like a saved edit. */
export function parseRecipeFile(text: string): RecipeFileResult {
  const bad = { ok: false, error: "This file isn't an image edit recipe." } as const;
  if (text.length > RECIPE_FILE_MAX_BYTES) return bad;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad;
  }
  const inner =
    raw && typeof raw === "object" && "recipe" in raw ? (raw as { recipe: unknown }).recipe : raw;
  const parsed = ImageEditRecipe.safeParse(inner);
  if (!parsed.success) return bad;
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > IMAGE_EDIT_RECIPE_MAX_BYTES) {
    return { ok: false, error: "This recipe is too large." };
  }
  return { ok: true, recipe: parsed.data };
}
