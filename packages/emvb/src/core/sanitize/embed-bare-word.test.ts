import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";
import { resolveEmbedUrl } from "./embed-url.ts";

describe("W-795 a bare word is not a video file", () => {
  test("words and extensionless paths are refused; video files and the media route stay videos", () => {
    for (const bad of ["nonsense", "my video", "/about", "clips/intro", "//cdn.example/a.mp4"]) {
      expect(resolveEmbedUrl(bad)).toBeUndefined();
    }
    expect(resolveEmbedUrl("clip.mp4")?.kind).toBe("video");
    expect(resolveEmbedUrl("/media/clip.webm?v=2")?.kind).toBe("video");
    expect(resolveEmbedUrl("/_emdash/api/media/file/01VID")?.kind).toBe("video");
  });
  test("the page shows the missing-video placeholder, not a player", () => {
    const layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "vid00001", type: "video", props: { url: "nonsense", title: "V" } }],
      },
    } as Layout;
    const { html } = renderPage(layout, emptyDesign());
    expect(html).toContain("emvb-video-missing");
    expect(html).not.toContain("<video");
  });
});
