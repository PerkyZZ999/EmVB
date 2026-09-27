import { describe, expect, test } from "bun:test";
import type { Fetcher } from "./api.ts";
import { propsFromMedia, type MediaLibraryItem } from "./media-api.ts";

const item = (over: Partial<MediaLibraryItem> = {}): MediaLibraryItem => ({
  id: "01MEDIA",
  filename: "hero.png",
  mimeType: "image/png",
  size: 12,
  width: 640,
  height: 480,
  alt: "Hero shot",
  storageKey: "01MEDIA.png",
  status: "ready",
  url: "/_emdash/api/media/file/01MEDIA.png",
  ...over,
});

describe("propsFromMedia (W-024)", () => {
  test("stores id, URL and dimensions from the library item", () => {
    expect(propsFromMedia({ alt: "Image" }, item())).toEqual({
      alt: "Hero shot",
      src: "/_emdash/api/media/file/01MEDIA.png",
      mediaId: "01MEDIA",
      width: 640,
      height: 480,
    });
  });

  test("keeps a custom alt the editor already set", () => {
    expect(propsFromMedia({ alt: "Custom" }, item()).alt).toBe("Custom");
  });

  test("falls back to the filename stem when the item has no alt", () => {
    expect(propsFromMedia({ alt: "Image" }, item({ alt: null })).alt).toBe("hero");
  });
});

describe("media API path (W-024, R-007)", () => {
  test("list and upload share one EmDash media endpoint", async () => {
    const { MEDIA_API_PATH, listImages, uploadImage } = await import("./media-api.ts");
    expect(MEDIA_API_PATH).toBe("/_emdash/api/media");

    const seen: string[] = [];
    const fetcher: Fetcher = async (path, init) => {
      seen.push(`${init?.method ?? "GET"} ${path.split("?")[0]}`);
      if ((init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ data: { items: [] } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: {
            item: {
              id: "01UP",
              filename: "x.png",
              mimeType: "image/png",
              size: 1,
              width: 1,
              height: 1,
              alt: null,
              storageKey: "01UP.png",
              status: "ready",
              url: "/_emdash/api/media/file/01UP.png",
            },
          },
        }),
        { status: 201 },
      );
    };
    await listImages(fetcher);
    await uploadImage(fetcher, new File([new Uint8Array([1])], "x.png", { type: "image/png" }));
    expect(seen).toEqual(["GET /_emdash/api/media", "POST /_emdash/api/media"]);
  });
});
