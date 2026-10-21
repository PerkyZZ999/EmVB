import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ImageEdit } from "../../core/index.ts";
import {
  parseRecipeFile,
  recipeFileText,
  buildImageEdit,
  cappedWidth,
  editedFileName,
  EXPORT_FORMATS,
  hasGps,
  outputFile,
  outputSize,
  PHOTOCN_VERSION,
  savedRecipe,
} from "./save.ts";

const photo = () =>
  new Blob([readFileSync(new URL("../../../../../e2e/fixtures/photo-gps.jpg", import.meta.url))], {
    type: "image/jpeg",
  });

describe("export settings (W-485)", () => {
  test("WebP 85% comes first; JPEG and PNG follow", () => {
    expect(EXPORT_FORMATS.map((f) => [f.value, f.defaultQuality])).toEqual([
      ["webp", 0.85],
      ["jpeg", 0.85],
      ["png", 1],
    ]);
  });
  test("the longest side is capped at 2560, keeping the ratio", () => {
    expect(cappedWidth({ width: 4000, height: 3000 })).toBe(2560);
    expect(cappedWidth({ width: 3000, height: 6000 })).toBe(1280);
    expect(cappedWidth({ width: 2560, height: 100 })).toBeNull();
    expect(outputSize({ width: 4000, height: 3000 }, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(outputSize({ width: 640, height: 480 }, null)).toEqual({ width: 640, height: 480 });
    // W-581: a tall strip's height must stay within the cap after rounding the width.
    for (const full of [
      { width: 100, height: 10000 },
      { width: 7, height: 9001 },
      { width: 1001, height: 3000 },
    ]) {
      const out = outputSize(full, cappedWidth(full));
      expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2560);
    }
  });
  test("copies are named after the original, without stacking -edited", () => {
    expect(editedFileName("garden.jpg", "webp")).toBe("garden-edited.webp");
    expect(editedFileName("garden-edited.webp", "jpeg")).toBe("garden-edited.jpg");
    // W-593: names in other scripts are kept, not replaced by "image".
    expect(editedFileName("Фото сада.jpg", "webp")).toBe("Фото-сада-edited.webp");
    expect(editedFileName("写真.png", "png")).toBe("写真-edited.png");
    expect(editedFileName("My photo (1).png", "png")).toBe("My-photo-1-edited.png");
    expect(editedFileName("", "webp")).toBe("image-edited.webp");
    // W-539
    expect(editedFileName("...", "webp")).toBe("image-edited.webp");
    expect(editedFileName(".hidden.png", "png")).toBe("hidden-edited.png");
    expect(editedFileName(`${"a".repeat(300)}.png`, "webp")).toBe(`${"a".repeat(100)}-edited.webp`);
  });
  test("the photocn version matches the installed package", async () => {
    const pkg = (await import("photocn/package.json", { with: { type: "json" } })) as {
      default: { version: string };
    };
    expect(PHOTOCN_VERSION).toBe(pkg.default.version);
  });
});

describe("location data (W-485)", () => {
  test("a JPEG copy loses its GPS when asked, and keeps it when not", async () => {
    const source = photo();
    expect(await hasGps(source)).toBe(true);
    const stripped = await outputFile(source, "a-edited.jpg", "jpeg", true);
    expect(stripped.gpsRemoved).toBe(true);
    expect(stripped.file.name).toBe("a-edited.jpg");
    expect(await hasGps(stripped.file)).toBe(false);
    const kept = await outputFile(source, "a-edited.jpg", "jpeg", false);
    expect(await hasGps(kept.file)).toBe(true);
  });
  test("WebP and PNG are passed through untouched", async () => {
    const webp = new Blob(["RIFF"], { type: "image/webp" });
    const out = await outputFile(webp, "a-edited.webp", "webp", true);
    expect(out.gpsRemoved).toBe(false);
    expect(await out.file.text()).toBe("RIFF");
    expect(await hasGps(webp)).toBe(false);
  });
});

describe("the edit record (W-485)", () => {
  const output = { format: "webp" as const, quality: 0.85, maxSide: 2560, stripGps: true };
  const now = new Date("2026-10-14T12:00:00.000Z");

  test("points at the untouched original and holds the recipe", () => {
    const built = buildImageEdit({
      imageProps: { src: "/m/garden.jpg", mediaId: "01ORIG" },
      recipe: { version: 1, lights: { exposure: 0.2 }, filters: { label: "crema" } },
      output,
      now,
    });
    expect(built).toEqual({
      ok: true,
      edit: {
        v: 1,
        engine: "photocn",
        engineVersion: PHOTOCN_VERSION,
        recipe: { version: 1, lights: { exposure: 0.2 }, filters: { label: "crema" } },
        originalMediaId: "01ORIG",
        originalSrc: "/m/garden.jpg",
        output,
        editedAt: "2026-10-14T12:00:00.000Z",
      },
    });
  });

  test("an edit of an edit keeps the first original", () => {
    const first = buildImageEdit({
      imageProps: { src: "/m/garden.jpg", mediaId: "01ORIG" },
      recipe: { version: 1 },
      output,
      now,
    });
    if (!first.ok) throw new Error(first.message);
    const second = buildImageEdit({
      imageProps: { src: "/m/garden-edited.webp", mediaId: "01COPY", edit: first.edit },
      recipe: { version: 1, colors: { saturation: -0.5 } },
      output,
      now,
    });
    expect(second.ok && second.edit.originalMediaId).toBe("01ORIG");
    expect(second.ok && second.edit.originalSrc).toBe("/m/garden.jpg");
  });

  test("a damaged record still keeps the original the editor opened (W-582)", () => {
    // The editor re-opens from edit.originalSrc even when the record fails the schema
    // (e.g. a recipe key from a newer photocn), so the new record must point there too,
    // not at the edited copy, or re-opening would apply the recipe twice.
    const damaged = {
      v: 1,
      engine: "photocn",
      engineVersion: "9.0.0",
      recipe: { version: 1, future: { x: 1 } },
      originalMediaId: "01ORIG",
      originalSrc: "/m/garden.jpg",
      output,
      editedAt: "2026-10-13T12:00:00.000Z",
    };
    const built = buildImageEdit({
      imageProps: { src: "/m/garden-edited.webp", mediaId: "01COPY", edit: damaged },
      recipe: { version: 1 },
      output,
      now,
    });
    expect(built.ok && built.edit.originalSrc).toBe("/m/garden.jpg");
    expect(built.ok && built.edit.originalMediaId).toBe("01ORIG");
  });

  test("a data: blend is refused with a reason", () => {
    const built = buildImageEdit({
      imageProps: { src: "/m/a.jpg" },
      recipe: { version: 1, blend: { src: "data:image/png;base64,AAA", mix: 0.5 } },
      output,
      now,
    });
    expect(built.ok).toBe(false);
    expect(!built.ok && built.message).toContain("Blend images must be a site path");
  });

  test("savedRecipe returns the recipe of a valid record only", () => {
    const built = buildImageEdit({
      imageProps: { src: "/m/a.jpg" },
      recipe: { version: 1, effects: { vignette: 0.4 } },
      output,
      now,
    });
    if (!built.ok) throw new Error(built.message);
    expect(ImageEdit.safeParse(built.edit).success).toBe(true);
    expect(savedRecipe({ edit: built.edit })).toEqual({ version: 1, effects: { vignette: 0.4 } });
    expect(savedRecipe({ edit: { ...built.edit, v: 2 } })).toBeNull();
    expect(savedRecipe({ edit: { ...built.edit, recipe: { version: 1 } } })).toBeNull();
    expect(savedRecipe({})).toBeNull();
  });
});

describe("W-862: recipe files", () => {
  const recipe = { version: 1 as const, lights: { exposure: 0.2 } };
  test("a downloaded recipe loads back to the same recipe", () => {
    expect(parseRecipeFile(recipeFileText(recipe))).toEqual({ ok: true, recipe });
  });
  test("a bare photocn recipe loads too", () => {
    expect(parseRecipeFile(JSON.stringify(recipe))).toEqual({ ok: true, recipe });
  });
  test("anything else is refused with a plain message", () => {
    for (const text of ["not json", "{}", '{"recipe":{"version":2}}', '{"version":1,"evil":1}']) {
      expect(parseRecipeFile(text)).toEqual({
        ok: false,
        error: "This file isn't an image edit recipe.",
      });
    }
  });
});
