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

describe("media API requests (W-091, R-007)", () => {
  test("listImages asks for images with a limit and search, and keeps only ready ones", async () => {
    const { listImages } = await import("./media-api.ts");
    const urls: string[] = [];
    const fetcher: Fetcher = async (path) => {
      urls.push(path);
      const items = [
        item({ id: "a" }),
        item({ id: "b", status: "pending" }),
        item({ id: "c", status: undefined }),
      ];
      return new Response(JSON.stringify({ data: { items } }), { status: 200 });
    };
    const found = await listImages(fetcher, { limit: 40, q: "hero" });
    expect(found.map((media) => media.id)).toEqual(["a", "c"]);
    await listImages(fetcher);
    expect(urls).toEqual([
      "/_emdash/api/media?mimeType=image%2F&limit=40&q=hero",
      "/_emdash/api/media?mimeType=image%2F&limit=50",
    ]);
  });

  test("uploadImage sends the file with its size, and alt only when given", async () => {
    const { uploadImage } = await import("./media-api.ts");
    const bodies: FormData[] = [];
    const fetcher: Fetcher = async (_path, init) => {
      bodies.push(init?.body as FormData);
      return new Response(JSON.stringify({ data: { item: item() } }), { status: 201 });
    };
    const file = new File([new Uint8Array([1])], "hero.png", { type: "image/png" });
    expect((await uploadImage(fetcher, file, { width: 0, height: 480, alt: "Hero" })).id).toBe(
      "01MEDIA",
    );
    await uploadImage(fetcher, file);
    const fields = bodies.map((body) =>
      [...body.keys()].toSorted().map((key) => {
        const value = body.get(key);
        return `${key}=${typeof value === "string" ? value : (value as File).name}`;
      }),
    );
    expect(fields).toEqual([
      ["alt=Hero", "file=hero.png", "height=480", "width=0"],
      ["file=hero.png"],
    ]);
  });

  test("an upload answered without an item is an error", async () => {
    const { uploadImage } = await import("./media-api.ts");
    const fetcher: Fetcher = async () =>
      new Response(JSON.stringify({ data: {} }), { status: 200 });
    const file = new File([new Uint8Array([1])], "hero.png", { type: "image/png" });
    await expect(uploadImage(fetcher, file)).rejects.toMatchObject({ status: 200 });
  });
});
