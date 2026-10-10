import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

const design = emptyDesign();
// String checks: putting an <iframe> into the test DOM would fetch the player.

const page = (children: unknown[]): Layout =>
  ({
    schemaVersion: 14,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;

/** The rules of a CSS string that mention `selector`, with :where() unwrapped. */
const rulesFor = (css: string, cls: string) =>
  css
    .split("}")
    .map((rule) => rule.replace(/:where\(([^)]*)\)/g, "$1"))
    .filter((rule) =>
      rule
        .split("{")[0]
        ?.split(",")
        .some((sel) => sel.trim() === cls),
    );

describe("W-266 video and divider sizes", () => {
  test("a YouTube player is the .emvb-video element and its own rule gives it 16:9 at full width", () => {
    const out = renderPage(
      page([
        {
          id: "vid00001",
          type: "video",
          props: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Demo" },
        },
      ]),
      design,
    );
    expect(out.html).toMatch(/<iframe class="emvb-video"/);
    const rules = rulesFor(out.css, ".emvb-video").join("}");
    expect(rules).toContain("aspect-ratio:16/9");
    expect(rules).toContain("width:100%");
  });

  test("a file video is the .emvb-video element too", () => {
    const out = renderPage(
      page([{ id: "vid00002", type: "video", props: { url: "/media/clip.mp4", title: "Clip" } }]),
      design,
    );
    expect(out.html).toMatch(/<video class="emvb-video"/);
    expect(rulesFor(out.css, ".emvb-video").join("}")).toContain("aspect-ratio:16/9");
  });

  test("the size is in :where() so an element's own width wins", () => {
    const out = renderPage(
      page([
        {
          id: "vid00003",
          type: "video",
          props: { url: "https://vimeo.com/76979871", title: "V" },
          style: { width: { value: 50, unit: "%" } },
        },
      ]),
      design,
    );
    expect(out.css).toContain(
      ":where(.emvb-video){box-sizing:border-box;width:100%;aspect-ratio:16/9",
    );
    expect(out.css).toContain(".emvb-e-vid00003{width:50%}");
  });

  test("a divider is full width by default, in :where()", () => {
    const out = renderPage(page([{ id: "div00001", type: "divider", props: {} }]), design);
    expect(out.css).toContain(":where(.emvb-divider){width:100%}");
  });
});
