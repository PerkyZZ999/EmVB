import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

describe("W-801 a background video respects reduced motion and stays out of screen readers", () => {
  const { html, css } = renderPage(
    {
      schemaVersion: 16,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "box00001",
            type: "container",
            props: {},
            style: { backgroundVideo: "/_emdash/api/media/file/bg.mp4" },
            children: [],
          },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  );
  test("the video is hidden for visitors who ask for reduced motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce){.emvb-bg-video{display:none}}");
  });
  test("the video is aria-hidden", () => {
    expect(html).toMatch(/<video class="emvb-bg-video"[^>]*aria-hidden="true"/);
  });
});
