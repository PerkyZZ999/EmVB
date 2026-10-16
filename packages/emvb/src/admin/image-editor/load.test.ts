import { describe, expect, test } from "bun:test";
import { editableSource, loadEditableSource } from "./load.ts";

const ORIGIN = "https://site.example";

describe("editableSource (W-482)", () => {
  test("a library image loads from its same-origin path", () => {
    expect(editableSource({ src: "/_emdash/api/media/file/01A.jpg" }, ORIGIN)).toEqual({
      ok: true,
      url: "/_emdash/api/media/file/01A.jpg",
      name: "01A.jpg",
      fromOriginal: false,
    });
  });
  test("an edited image re-opens from the original", () => {
    const props = { src: "/e.webp", edit: { originalSrc: "/_emdash/api/media/file/01ORIG.jpg" } };
    expect(editableSource(props, ORIGIN)).toMatchObject({
      ok: true,
      url: "/_emdash/api/media/file/01ORIG.jpg",
      fromOriginal: true,
    });
  });
  test("a full URL on this site counts as same-origin", () => {
    expect(editableSource({ src: `${ORIGIN}/uploads/a%20b.png?v=2` }, ORIGIN)).toMatchObject({
      ok: true,
      url: "/uploads/a%20b.png?v=2",
      name: "a b.png",
    });
  });
  test.each([
    ["no picture", { src: "" }, "empty"],
    ["another website", { src: "https://cdn.example.com/a.jpg" }, "external"],
    ["a protocol-relative URL", { src: "//cdn.example.com/a.jpg" }, "external"],
    ["a data: URL", { src: "data:image/png;base64,AAAA" }, "external"],
    ["an SVG", { src: "/logo.svg" }, "format"],
    ["a GIF", { src: "/party.GIF" }, "format"],
  ])("refuses %s", (_, props, reason) => {
    const result = editableSource(props, ORIGIN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(reason as never);
      expect(result.message.length).toBeGreaterThan(20);
    }
  });
});

describe("loadEditableSource (W-482)", () => {
  const respond = (body: string, type: string, status = 200) =>
    (async () =>
      new Response(body, { status, headers: { "content-type": type } })) as unknown as typeof fetch;

  test("returns the picture as a Blob", async () => {
    const result = await loadEditableSource({ src: "/a.jpg" }, ORIGIN, respond("x", "image/jpeg"));
    expect(result).toMatchObject({ ok: true, name: "a.jpg", type: "image/jpeg" });
  });
  test("refuses a GIF served under another name", async () => {
    const result = await loadEditableSource(
      { src: "/media/01A" },
      ORIGIN,
      respond("x", "image/gif"),
    );
    expect(result).toMatchObject({ ok: false, reason: "format" });
  });
  test("W-592: a Content-Type in capitals is still a picture type", async () => {
    const result = await loadEditableSource({ src: "/a.jpg" }, ORIGIN, respond("x", "IMAGE/JPEG"));
    expect(result).toMatchObject({ ok: true, type: "image/jpeg" });
    expect(
      await loadEditableSource({ src: "/media/01A" }, ORIGIN, respond("x", "Image/GIF")),
    ).toMatchObject({ ok: false, reason: "format" });
  });
  test("a 404, an HTML page or a network error is a network problem", async () => {
    expect(
      await loadEditableSource({ src: "/a.jpg" }, ORIGIN, respond("", "image/jpeg", 404)),
    ).toMatchObject({ ok: false, reason: "network" });
    expect(
      await loadEditableSource({ src: "/a.jpg" }, ORIGIN, respond("<html>", "text/html")),
    ).toMatchObject({ ok: false, reason: "network" });
    const failing = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await loadEditableSource({ src: "/a.jpg" }, ORIGIN, failing)).toMatchObject({
      ok: false,
      reason: "network",
    });
  });

  test.each([
    ["the current picture", { src: "/a.jpg" }],
    ["the copy after a missing original", { src: "/a.jpg", edit: { originalSrc: "/gone.jpg" } }],
  ])("W-719: an interrupted body for %s returns a network error", async (_, props) => {
    const fetchImpl = (async (url: string) => {
      if (url === "/gone.jpg") return new Response(null, { status: 404 });
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError("Transfer interrupted"));
          },
        }),
        { headers: { "content-type": "image/jpeg" } },
      );
    }) as unknown as typeof fetch;
    const result = await loadEditableSource(props, ORIGIN, fetchImpl);
    expect(result).toEqual({
      ok: false,
      reason: "network",
      message: "Couldn't load the picture. Check your connection and try again.",
    });
  });
});

describe("a deleted original (W-493)", () => {
  test("re-opening loads the edited copy instead and says the original is missing", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      if (url.includes("orig")) return new Response("gone", { status: 404 });
      return new Response(new Blob(["x"], { type: "image/webp" }), {
        headers: { "content-type": "image/webp" },
      });
    }) as unknown as typeof fetch;
    const result = await loadEditableSource(
      { src: "/media/copy.webp", edit: { originalSrc: "/media/orig.jpg" } },
      ORIGIN,
      fetchImpl,
    );
    expect(seen).toEqual(["/media/orig.jpg", "/media/copy.webp"]);
    expect(result.ok && result.originalMissing).toBe(true);
    expect(result.ok && result.fromOriginal).toBe(false);
    expect(result.ok && result.name).toBe("copy.webp");
  });
});
