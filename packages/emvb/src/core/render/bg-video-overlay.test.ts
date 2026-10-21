import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

describe("W-802 a background video's overlay paints above the video", () => {
  const { css } = renderPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "box00001",
            type: "container",
            props: {},
            style: {
              backgroundVideo: "/_emdash/api/media/file/bg.mp4",
              overlay: { color: "#000000", opacity: 0.5 },
            },
            children: [],
          },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  );
  test("the video box paints the overlay in a layer above the video, below the content", () => {
    expect(css).toContain(
      '.emvb-has-bg-video::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:var(--emvb-bg-overlay)}',
    );
    expect(css).toContain(".emvb-has-bg-video{--emvb-bg-overlay:none}");
  });
  test("the box's own rule hands its overlay to that layer", () => {
    expect(css).toMatch(
      /\.emvb-e-box00001\{[^}]*--emvb-bg-overlay:linear-gradient\(#00000080, #00000080\)/,
    );
  });
});
