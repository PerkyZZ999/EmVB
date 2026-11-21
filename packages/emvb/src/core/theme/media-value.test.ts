import { describe, expect, test } from "bun:test";
import {
  automaticImageField,
  entryImageValue,
  imageFieldsOf,
  isImageValue,
  mediaUrlOf,
} from "./media-value.ts";

/** What EmDash 1.5's admin stores when an editor picks an uploaded image. */
const picked = (key: string) => ({
  id: "01JMEDIA",
  provider: "local",
  filename: "hero.png",
  mimeType: "image/png",
  meta: { storageKey: key },
});

describe("W-1090 (#32): image field values", () => {
  test("a local upload without src points at EmDash's media route by its storage key", () => {
    expect(mediaUrlOf(picked("01JABC.png"))).toBe("/_emdash/api/media/file/01JABC.png");
    expect(mediaUrlOf(picked("a b/c.png"))).toBe("/_emdash/api/media/file/a%20b/c.png");
    expect(mediaUrlOf(picked("../etc/passwd"))).toBe("/_emdash/api/media/file/01JMEDIA");
    expect(mediaUrlOf({ id: "01JX", provider: "local" })).toBe("/_emdash/api/media/file/01JX");
  });

  test("a value's own URL wins, and an external provider without one has no URL", () => {
    expect(mediaUrlOf({ ...picked("k.png"), src: "https://cdn.test/a.jpg" })).toBe(
      "https://cdn.test/a.jpg",
    );
    expect(mediaUrlOf({ id: "x", provider: "cloudflare-images" })).toBeUndefined();
    expect(mediaUrlOf("https://cdn.test/a.jpg")).toBeUndefined();
    expect(mediaUrlOf(null)).toBeUndefined();
  });

  test("only image values count as images", () => {
    expect(isImageValue(picked("k.png"))).toBe(true);
    expect(isImageValue({ ...picked("k.pdf"), mimeType: "application/pdf" })).toBe(false);
    expect(isImageValue({ src: "https://cdn.test/a.webp" })).toBe(true);
    expect(isImageValue({ src: "https://cdn.test/a.pdf" })).toBe(false);
    expect(isImageValue("photo.png")).toBe(false);
  });

  test("unset reads featured_image first, else the first field holding an image", () => {
    const both = { title: "T", cover: picked("c.png"), featured_image: picked("f.png") };
    expect(automaticImageField(both)).toBe("featured_image");
    const coverOnly = { title: "T", featured_image: null, cover: picked("c.png") };
    expect(automaticImageField(coverOnly)).toBe("cover");
    expect(
      automaticImageField({ title: "T", file: { ...picked("x"), mimeType: "text/csv" } }),
    ).toBeUndefined();
  });

  test("a named field is read as named, even when it is empty", () => {
    const data = { featured_image: picked("f.png"), photo: null };
    expect(entryImageValue(data, "photo")).toBeNull();
    expect(mediaUrlOf(entryImageValue(data))).toBe("/_emdash/api/media/file/f.png");
  });

  test("the schema's image fields, featured_image first", () => {
    const fields = [
      { slug: "title", type: "string", label: "Title" },
      { slug: "cover", type: "image", label: "Cover" },
      { slug: "featured_image", type: "image", label: "Featured Image" },
      { slug: "doc", type: "file", label: "Document" },
    ];
    expect(imageFieldsOf(fields)).toEqual([
      { slug: "featured_image", label: "Featured Image" },
      { slug: "cover", label: "Cover" },
    ]);
  });
});
