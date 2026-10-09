import { describe, expect, test } from "bun:test";
import { emptyDesign, type Layout } from "../index.ts";
import { renderPage } from "../render/index.ts";
import { resolveEmbedUrl } from "./embed-url.ts";

const src = (url: string) => {
  const target = resolveEmbedUrl(url);
  return target?.kind === "iframe" ? target.src : undefined;
};

describe("more video link shapes (W-215)", () => {
  test("an unlisted Vimeo video keeps its privacy hash", () => {
    expect(src("https://vimeo.com/76979871/abcdef1234")).toBe(
      "https://player.vimeo.com/video/76979871?h=abcdef1234",
    );
    expect(src("https://player.vimeo.com/video/76979871?h=abcdef1234&autoplay=1")).toBe(
      "https://player.vimeo.com/video/76979871?h=abcdef1234",
    );
    expect(src("https://player.vimeo.com/video/76979871?h=%22onload")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
    expect(src("https://vimeo.com/76979871/not-a-hash")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
  });

  test("Vimeo channel and group links, and YouTube live links", () => {
    expect(src("https://vimeo.com/channels/staffpicks/76979871")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
    expect(src("https://vimeo.com/groups/motion/videos/76979871")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
    expect(src("https://vimeo.com/shorts/76979871")).toBeUndefined();
    expect(src("https://www.youtube.com/live/dQw4w9WgXcQ?si=x")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  test("the hash reaches the page's iframe", () => {
    const layout = {
      schemaVersion: 13,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "vide0001",
            type: "video",
            props: { url: "https://vimeo.com/76979871/abcdef1234", title: "Clip" },
          },
        ],
      },
    } as Layout;
    expect(renderPage(layout, emptyDesign()).html).toContain(
      'src="https://player.vimeo.com/video/76979871?h=abcdef1234"',
    );
  });
});
