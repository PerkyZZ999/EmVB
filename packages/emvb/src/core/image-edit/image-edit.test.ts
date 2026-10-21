import { describe, expect, test } from "bun:test";
import { validateLayout } from "../validate.ts";
import { upgradeLayout } from "../migrate/index.ts";
import { ImageEdit, ImageEditRecipe, IMAGE_EDIT_RECIPE_MAX_BYTES } from "./schema.ts";
import { summarizeImageEdit } from "./summary.ts";

const sampleEdit = (over: Record<string, unknown> = {}) => ({
  v: 1,
  engine: "photocn",
  engineVersion: "0.1.2",
  recipe: {
    version: 1,
    lights: { exposure: 0.2 },
    colors: { saturation: -0.15 },
    filters: { label: "juno", strength: 0.8 },
    geometry: { crop: { x: 0.125, y: 0, width: 0.75, height: 1 }, aspectRatio: 1, quarterTurns: 1 },
    curves: [
      [
        [0, 0],
        [0.5, 0.6],
        [1, 1],
      ],
      null,
      null,
      null,
    ],
  },
  originalMediaId: "01ORIGINAL",
  originalSrc: "/_emdash/api/media/file/01ORIGINAL.jpg",
  output: { format: "webp", quality: 0.85, maxSide: 2560, stripGps: true },
  editedAt: "2026-10-13T20:45:00.000Z",
  ...over,
});

const page = (props: Record<string, unknown>, schemaVersion = 17) => ({
  schemaVersion,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "img00001", type: "image", props: { src: "/e.webp", alt: "Shop", ...props } }],
  },
});

describe("image edit record (W-481)", () => {
  test("a full record is valid and survives a layout round trip", () => {
    const layout = page({ mediaId: "01EDITED", width: 1920, height: 1920, edit: sampleEdit() });
    expect<unknown>(validateLayout(layout)).toEqual({ ok: true, layout, upgradedFrom: 17 });
  });

  test("originalMediaId and the recipe's optional parts may be left out", () => {
    const edit = sampleEdit({ originalMediaId: undefined, recipe: { version: 1 } });
    expect(ImageEdit.safeParse(edit).success).toBe(true);
  });

  test.each([
    ["an unknown key", { extra: 1 }],
    ["another engine", { engine: "other" }],
    ["a record version 2", { v: 2 }],
    ["a non-semver engine version", { engineVersion: "latest" }],
    ["a bad timestamp", { editedAt: "yesterday" }],
    ["an unknown format", { output: { format: "gif", stripGps: true } }],
    ["a quality above 1", { output: { format: "webp", quality: 2, stripGps: true } }],
    ["no stripGps", { output: { format: "webp" } }],
    ["an empty originalSrc", { originalSrc: "" }],
  ])("refuses %s", (_, over) => {
    expect(ImageEdit.safeParse(sampleEdit(over)).success).toBe(false);
  });

  test.each([
    ["a slider out of range", { version: 1, lights: { exposure: 3 } }],
    ["an unknown slider", { version: 1, lights: { glow: 0.1 } }],
    ["NaN-like infinity", { version: 1, colors: { tint: Number.POSITIVE_INFINITY } }],
    [
      "a crop outside the image",
      { version: 1, geometry: { crop: { x: 0.5, y: 0, width: 0.75, height: 1 } } },
    ],
    ["five quarter turns", { version: 1, geometry: { quarterTurns: 5 } }],
    ["straighten past 45°", { version: 1, geometry: { straighten: 60 } }],
    ["a script-like filter name", { version: 1, filters: { label: "<img onerror>" } }],
    ["a data: blend", { version: 1, blend: { src: "data:image/png;base64,AAAA", mix: 0.5 } }],
    ["a protocol-relative blend", { version: 1, blend: { src: "//evil.example/x.png", mix: 0.5 } }],
    // W-534: browsers read "/\\host" as "//host".
    [
      "a backslash blend (W-534)",
      { version: 1, blend: { src: "/\\evil.example/x.png", mix: 0.5 } },
    ],
    ["a tab blend (W-534)", { version: 1, blend: { src: "/\t/evil.example/x.png", mix: 0.5 } }],
    ["a curve with one point", { version: 1, curves: [[[0, 0]], null, null, null] }],
    ["recipe version 2", { version: 2 }],
  ])("refuses a recipe with %s", (_, recipe) => {
    expect(ImageEditRecipe.safeParse(recipe).success).toBe(false);
  });

  test("a curve channel is capped at 32 points", () => {
    const points = (n: number) => Array.from({ length: n }, (_, i) => [i / (n - 1), i / (n - 1)]);
    const recipe = (n: number) => ({ version: 1, curves: [points(n), null, null, null] });
    expect(ImageEditRecipe.safeParse(recipe(32)).success).toBe(true);
    expect(ImageEditRecipe.safeParse(recipe(33)).success).toBe(false);
  });

  test("the 16 KB cap holds even for the largest recipe the field rules allow", () => {
    const channel = Array.from({ length: 32 }, (_, i) => [(i / 31) * 0.999999999, 0.123456789]);
    const largest = {
      version: 1,
      name: "x".repeat(80),
      lights: {
        brightness: -0.123456789,
        exposure: -0.123456789,
        gamma: -0.123456789,
        contrast: -0.123456789,
        shadows: -0.123456789,
        highlights: -0.123456789,
        bloom: -0.123456789,
      },
      blend: { src: `/${"a".repeat(1999)}`, mix: 0.123456789 },
      curves: [channel, channel, channel, channel],
    };
    expect(ImageEditRecipe.safeParse(largest).success).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(largest)).length).toBeLessThan(
      IMAGE_EDIT_RECIPE_MAX_BYTES,
    );
    expect(ImageEdit.safeParse(sampleEdit({ recipe: largest })).success).toBe(true);
  });

  test("the layout is refused with the image path when the edit is invalid", () => {
    const result = validateLayout(page({ edit: sampleEdit({ engine: "other" }) }));
    expect(result.ok).toBe(false);
  });

  test("a v15 page (no edit) upgrades to the current version unchanged", () => {
    const old = page({ caption: "Hi" }, 15);
    expect(upgradeLayout(old)).toEqual({ ok: true, doc: page({ caption: "Hi" }), from: 15 });
  });

  test("EmVB 0.5 (schema 15) refuses a schema 16 page as newer, not as invalid", () => {
    const newer = page({ edit: sampleEdit() });
    expect(upgradeLayout(newer, {}, 15)).toEqual({
      ok: false,
      reason: "newer-version",
      version: 17,
    });
  });
});

describe("summarizeImageEdit", () => {
  test("names the filter, geometry and changed sliders", () => {
    expect(summarizeImageEdit(sampleEdit().recipe as never)).toBe(
      "Juno 80% · Cropped · Rotated · Exposure +20 · Saturation -15 · +1 more",
    );
    expect(summarizeImageEdit(sampleEdit().recipe as never, 10)).toBe(
      "Juno 80% · Cropped · Rotated · Exposure +20 · Saturation -15 · Curves",
    );
  });
  test("a full-strength filter has no percentage, and an empty recipe says so", () => {
    expect(summarizeImageEdit({ version: 1, filters: { label: "lark" } })).toBe("Lark");
    expect(summarizeImageEdit({ version: 1 })).toBe("No changes");
    expect(summarizeImageEdit({ version: 1, lights: { exposure: 0 } })).toBe("No changes");
  });
  test("flip, perspective, blur and blend are listed", () => {
    expect(
      summarizeImageEdit({
        version: 1,
        geometry: { flipX: true, perspectiveX: 0.2 },
        blur: { gaussianstrength: 0.4 },
        blend: { src: "/b.png", mix: 0.5 },
        effects: { noise: 0.1 },
      }),
    ).toBe("Flipped · Perspective · Grain +10 · Blur · Blend");
  });
});

describe("W-551: edit summary skips no-op parts", () => {
  test("a blur centre alone, a 0% filter and sub-1 slider nudges are not changes", () => {
    expect(
      summarizeImageEdit({
        version: 1,
        blur: { centerX: 0.5, centerY: 0.5, bokehstrength: 0 },
        filters: { label: "juno", strength: 0 },
        lights: { exposure: 0.004, contrast: -0.002 },
      }),
    ).toBe("No changes");
    expect(summarizeImageEdit({ version: 1, blur: { gaussianstrength: 0.3, centerX: 0.5 } })).toBe(
      "Blur",
    );
  });
});
