import { describe, expect, test } from "bun:test";
import type { Fetcher } from "./api.ts";
import { ImageBoxNode, ImageNode } from "../core/schema/layout.ts";
import { defaultElement } from "../core/elements/index.ts";
import {
  getMedia,
  propsFromEdited,
  propsFromMedia,
  propsFromOriginal,
  propsFromUrl,
  type MediaLibraryItem,
} from "./media-api.ts";

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

describe("library pick drops the old extra sizes (W-422)", () => {
  test("a different library image removes sources; the same one keeps them", () => {
    const sources = [{ src: "/old-480.png", width: 480 }];
    expect(propsFromMedia({ alt: "A", src: "/old.png", sources }, item()).sources).toBeUndefined();
    expect(
      propsFromMedia({ alt: "A", src: "/_emdash/api/media/file/01MEDIA.png", sources }, item())
        .sources,
    ).toEqual(sources);
  });
});

describe("propsFromUrl (W-425)", () => {
  test("a URL pasted over a library image drops its width and height", () => {
    const lib = { src: "/a.png", mediaId: "01M", width: 800, height: 600, alt: "A" };
    expect(propsFromUrl(lib, "/b.png")).toEqual({ src: "/b.png", alt: "A" });
  });
  test("a URL image keeps its own width and height", () => {
    const own = { src: "/a.png", width: 800, height: 600, alt: "A" };
    expect(propsFromUrl(own, "/b.png")).toEqual({
      src: "/b.png",
      width: 800,
      height: 600,
      alt: "A",
    });
  });
});

describe("a picture change drops the image-editor record (W-482)", () => {
  const edit = { v: 1, engine: "photocn", originalSrc: "/a.jpg" };
  test("a different library image clears edit; the same one keeps it", () => {
    const current = { src: "/a.webp", alt: "Shop", mediaId: "01OLD", edit };
    expect(propsFromMedia(current, item({ id: "01NEW", url: "/b.png" })).edit).toBeUndefined();
    expect(propsFromMedia(current, item({ id: "01OLD", url: "/a.webp" })).edit).toEqual(edit);
  });
  test("a different pasted URL clears edit; the same URL keeps it", () => {
    const current = { src: "/a.webp", alt: "Shop", edit };
    expect(propsFromUrl(current, "https://example.com/x.jpg").edit).toBeUndefined();
    expect(propsFromUrl(current, "/a.webp").edit).toEqual(edit);
  });
});

describe("edited copies and Reset to original (W-485)", () => {
  const edit = { v: 1, engine: "photocn", originalSrc: "/m/a.jpg", originalMediaId: "01ORIG" };
  const original = {
    src: "/m/a.jpg",
    mediaId: "01ORIG",
    width: 4000,
    height: 3000,
    alt: "Garden",
    sources: [{ src: "/m/a-800.jpg", width: 800 }],
  };

  test("saving points the element at the new file, keeps alt, drops old sizes", () => {
    const next = propsFromEdited(
      original,
      { id: "01COPY", url: "/m/a-edited.webp", width: 2560, height: 1920 },
      edit,
    );
    expect(next).toEqual({
      src: "/m/a-edited.webp",
      mediaId: "01COPY",
      width: 2560,
      height: 1920,
      alt: "Garden",
      edit,
    });
  });

  test("reset restores the library original and removes the record", () => {
    const edited = propsFromEdited(
      original,
      { id: "01COPY", url: "/m/a-edited.webp", width: 2560, height: 1920 },
      edit,
    );
    expect(
      propsFromOriginal(edited, { id: "01ORIG", url: "/m/a.jpg", width: 4000, height: 3000 }),
    ).toEqual({ src: "/m/a.jpg", mediaId: "01ORIG", width: 4000, height: 3000, alt: "Garden" });
  });

  test("reset without the library item falls back to the recorded URL", () => {
    const edited = { src: "/m/a-edited.webp", mediaId: "01COPY", width: 10, height: 10, edit };
    expect(propsFromOriginal(edited, null)).toEqual({ src: "/m/a.jpg" });
    expect(propsFromOriginal({ src: "/m/x.webp" }, null)).toBeNull();
  });

  test("reset trims the recorded URL and treats a blank one as none (W-583)", () => {
    const padded = { src: "/m/x.webp", edit: { ...edit, originalSrc: "  /m/a.jpg \n" } };
    expect(propsFromOriginal(padded, null)).toEqual({ src: "/m/a.jpg" });
    const blank = { src: "/m/x.webp", edit: { ...edit, originalSrc: "   " } };
    expect(propsFromOriginal(blank, null)).toBeNull();
  });

  test("getMedia reads one item, builds its URL, and returns null when it's gone", async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string) => {
      seen.push(url);
      if (url.endsWith("/gone")) {
        return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
      }
      return new Response(
        JSON.stringify({ data: { item: item({ id: "01ORIG", url: undefined as never }) } }),
        { headers: { "content-type": "application/json" } },
      );
    }) as unknown as Fetcher;
    const found = await getMedia(fetcher, "01ORIG");
    expect(seen[0]).toBe("/_emdash/api/media/01ORIG");
    expect(found?.url).toBe(`/_emdash/api/media/file/${found?.storageKey}`);
    expect(await getMedia(fetcher, "gone")).toBeNull();
  });
});

describe("pictures over 10000 px on a side (W-496)", () => {
  const bigItem = (width: number, height: number) => ({
    id: "01BIG",
    url: "/_emdash/api/media/file/big.png",
    filename: "big.png",
    mimeType: "image/png",
    width,
    height,
  });
  test("picking one keeps its ratio inside the layout's 10000 px limit", () => {
    const next = propsFromMedia({ alt: "A" }, bigItem(12000, 600) as never);
    expect([next.width, next.height]).toEqual([10000, 500]);
    expect(ImageNode.safeParse({ id: "img00001", type: "image", props: next }).success).toBe(true);
  });
  test("a tall one, an edited copy and a reset are fitted the same way", () => {
    expect(propsFromMedia({ alt: "A" }, bigItem(300, 15000) as never)).toMatchObject({
      width: 200,
      height: 10000,
    });
    expect(propsFromEdited({ alt: "A" }, bigItem(20000, 10000), {})).toMatchObject({
      width: 10000,
      height: 5000,
    });
    const reset = propsFromOriginal(
      { alt: "A", edit: { originalSrc: "/x.png" } },
      bigItem(11000, 11000),
    );
    expect(reset).toMatchObject({ width: 10000, height: 10000 });
  });
  test("pictures within the limit are untouched", () => {
    expect(propsFromMedia({ alt: "A" }, bigItem(640, 480) as never)).toMatchObject({
      width: 640,
      height: 480,
    });
  });
});

describe("propsFromMedia focal point (W-915)", () => {
  test("a picked library image takes its EmDash focal point as percent", () => {
    const next = propsFromMedia({ alt: "Image" }, item({ focalX: 0.25, focalY: 0.8 }));
    expect([next.focalX, next.focalY]).toEqual([25, 80]);
  });

  test("a focal point set on the same picture is kept", () => {
    const same = { src: "/_emdash/api/media/file/01MEDIA.png", focalX: 10, focalY: 20 };
    const next = propsFromMedia(same, item({ focalX: 0.5, focalY: 0.5 }));
    expect([next.focalX, next.focalY]).toEqual([10, 20]);
  });

  test("a different picture without one drops the old focal point", () => {
    const next = propsFromMedia({ src: "/old.png", focalX: 10, focalY: 20 }, item());
    expect(next.focalX).toBeUndefined();
    expect(next.focalY).toBeUndefined();
  });

  test("an out-of-range library focal point is ignored", () => {
    expect(propsFromMedia({}, item({ focalX: 4, focalY: 0.5 })).focalX).toBeUndefined();
  });
});

test("W-1021: a library image picked for an Image box fills its picture keys and keeps it valid", () => {
  const box = defaultElement("image-box", "imbx0001");
  const props = propsFromMedia(
    box.props as Record<string, unknown>,
    item({ focalX: 30, focalY: 40 } as never),
  );
  expect(props).toMatchObject({
    src: "/_emdash/api/media/file/01MEDIA.png",
    mediaId: "01MEDIA",
    alt: "Hero shot",
    title: "A clear benefit",
  });
  expect(ImageBoxNode.safeParse({ ...box, props }).success).toBe(true);
});
