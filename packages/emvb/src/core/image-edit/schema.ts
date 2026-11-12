import { boundedArray } from "../bounded-array.ts";
import { z } from "zod";

/**
 * Editor-only record of an image edit (W-481, D-061). Stored on `image.props.edit`; never
 * rendered. `src`/`mediaId`/`width`/`height` on the element point at the edited file, this
 * record points back at the untouched original and holds the photocn recipe to re-open it.
 *
 * The recipe mirrors photocn's `RecipeV1` but is strict and capped, so a crafted recipe can't
 * bloat the layout or crash the renderer. This module has no photocn import (core stays pure).
 */

/** Max JSON size of a recipe, in UTF-8 bytes. */
export const IMAGE_EDIT_RECIPE_MAX_BYTES = 16 * 1024;
/** Max points per tone curve channel. */
export const IMAGE_EDIT_CURVE_POINTS_MAX = 32;

const Slider = z.number().finite().min(-1).max(1);
const Unit = z.number().finite().min(0).max(1);

const Lights = z
  .strictObject({
    brightness: Slider,
    exposure: Slider,
    gamma: Slider,
    contrast: Slider,
    shadows: Slider,
    highlights: Slider,
    bloom: Slider,
  })
  .partial();
const Colors = z
  .strictObject({
    temperature: Slider,
    tint: Slider,
    vibrance: Slider,
    saturation: Slider,
    sepia: Slider,
  })
  .partial();
const Effects = z.strictObject({ clarity: Slider, noise: Slider, vignette: Slider }).partial();
const Blur = z
  .strictObject({
    bokehstrength: Unit,
    bokehlensout: Unit,
    gaussianstrength: Unit,
    gaussianlensout: Unit,
    centerX: Unit,
    centerY: Unit,
  })
  .partial();

const CurvePoint = z.tuple([Unit, Unit]);
const CurveChannel = boundedArray(CurvePoint, IMAGE_EDIT_CURVE_POINTS_MAX, 2).nullable();
const Curves = z.tuple([CurveChannel, CurveChannel, CurveChannel, CurveChannel]);

/** Corner targets may sit a little outside the frame (perspective pulls). */
const Corner = z.tuple([z.number().finite().min(-2).max(3), z.number().finite().min(-2).max(3)]);
const Rect = z
  .strictObject({
    x: Unit,
    y: Unit,
    width: z.number().finite().gt(0).max(1),
    height: z.number().finite().gt(0).max(1),
  })
  .refine(
    (r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001,
    "The crop must stay inside the image",
  );
const Geometry = z
  .strictObject({
    quarterTurns: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    flipX: z.boolean(),
    straighten: z.number().finite().min(-45).max(45),
    perspectiveX: Slider,
    perspectiveY: Slider,
    corners: z.tuple([Corner, Corner, Corner, Corner]).nullable(),
    crop: Rect.nullable(),
    aspectRatio: z.number().finite().min(0.01).max(100).nullable(),
  })
  .partial();

/** photocn filter labels are short names ("juno"); unknown ones are ignored by the renderer. */
const FilterLabel = z.string().regex(/^[A-Za-z0-9 _-]{1,32}$/, "Filter names are short words");

/** Backslashes and control characters, which URL parsing rewrites or drops. */
function hasUnsafeUrlChar(s: string): boolean {
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * A blend image must be a same-site path or an https URL; `data:` blends (picked files) are
 * refused because they would put a whole image into the layout.
 */
const BlendSrc = z
  .string()
  .max(2000)
  .refine(
    // A backslash or control character can turn "/\\host" into another host (W-534).
    (s) => !hasUnsafeUrlChar(s) && (/^\/(?!\/)/.test(s) || /^https:\/\//i.test(s)),
    "Blend images must be a site path or an https URL",
  );

export const ImageEditRecipe = z.strictObject({
  version: z.literal(1),
  name: z.string().max(80).optional(),
  lights: Lights.optional(),
  colors: Colors.optional(),
  effects: Effects.optional(),
  blur: Blur.optional(),
  curves: Curves.optional(),
  blend: z.strictObject({ src: BlendSrc, mix: Unit }).optional(),
  filters: z.strictObject({ label: FilterLabel, strength: Unit.optional() }).optional(),
  geometry: Geometry.optional(),
});
export type ImageEditRecipe = z.infer<typeof ImageEditRecipe>;

export const IMAGE_EDIT_FORMATS = ["webp", "jpeg", "png"] as const;

export const ImageEditOutput = z.strictObject({
  format: z.enum(IMAGE_EDIT_FORMATS),
  /** 0..1 for webp and jpeg. */
  quality: z.number().finite().min(0.1).max(1).optional(),
  /** The longest side was capped to this many pixels. */
  maxSide: z.number().int().min(16).max(10000).optional(),
  stripGps: z.boolean(),
});
export type ImageEditOutput = z.infer<typeof ImageEditOutput>;

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export const ImageEdit = z.strictObject({
  /** Our record version. */
  v: z.literal(1),
  engine: z.literal("photocn"),
  engineVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,32})?$/, "A version like 0.1.2"),
  recipe: ImageEditRecipe.refine((r) => byteLength(r) <= IMAGE_EDIT_RECIPE_MAX_BYTES, {
    message: `The edit recipe is larger than ${IMAGE_EDIT_RECIPE_MAX_BYTES / 1024} KB`,
  }),
  /** The untouched source in the media library. */
  originalMediaId: z.string().min(1).max(128).optional(),
  /** Same-origin URL of the source, for re-opening when the media item is gone. */
  originalSrc: z.string().min(1).max(2000),
  output: ImageEditOutput,
  /** ISO 8601 timestamp of the save. */
  editedAt: z.iso.datetime({ offset: true }),
});
export type ImageEdit = z.infer<typeof ImageEdit>;
