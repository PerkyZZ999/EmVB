import { describe, expect, test } from "bun:test";
import { emptyDesign, type DesignSystem, type Layout } from "../index.ts";
import { generateCss } from "../css/generate.ts";
import { renderPage } from "./index.ts";

const grad = (color: string) => ({
  type: "linear" as const,
  angle: 90,
  stops: [
    { color, at: 0 },
    { color: "#ffffff", at: 100 },
  ],
});
const page = (extra: Record<string, unknown>): Layout =>
  ({
    schemaVersion: 13,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "box00001", type: "container", props: {}, children: [], ...extra }],
    },
  }) as Layout;
const media = (css: string, width: number) =>
  css.slice(css.indexOf(`@media (max-width: ${width}px)`)).split("}")[0] ?? "";

describe("device background layers keep what they inherit (W-210)", () => {
  test("a tablet overlay keeps the desktop gradient; a tablet gradient keeps the image", () => {
    const overlay = renderPage(
      page({
        style: { gradient: grad("#ff0000") },
        devices: { tablet: { overlay: { color: "#000000", opacity: 0.5 } } },
      }),
      emptyDesign(),
    );
    expect(media(overlay.css, 1024)).toContain("#ff0000");
    const image = renderPage(
      page({
        style: { backgroundImage: "https://e.com/a.jpg", gradient: grad("#ff0000") },
        devices: {
          tablet: { gradient: grad("#00ff00") },
          mobile: { overlay: { color: "#000000", opacity: 0.5 } },
        },
      }),
      emptyDesign(),
    );
    const tablet = media(image.css, 1024);
    expect(tablet).toContain("a.jpg");
    expect(tablet).toContain("#00ff00");
    const mobile = media(image.css, 767);
    expect(mobile).toContain("a.jpg");
    expect(mobile).toContain("#00ff00");
    expect(mobile).not.toContain("#ff0000");
  });

  test("a device colour alone writes no background-image", () => {
    const result = renderPage(
      page({ style: { gradient: grad("#ff0000") }, devices: { tablet: { color: "#0000ff" } } }),
      emptyDesign(),
    );
    expect(media(result.css, 1024)).not.toContain("background-image");
  });

  test("the same holds for a class's device styles", () => {
    const design = {
      ...emptyDesign(),
      classes: [
        {
          id: "hero",
          name: "Hero",
          style: { backgroundImage: "https://e.com/a.jpg" },
          devices: { tablet: { overlay: { color: "#000000", opacity: 0.5 } } },
        },
      ],
    } as DesignSystem;
    const css = generateCss({ design, usedTypes: new Set(), baseCss: new Map(), localRules: [] });
    expect(media(css, 1024)).toContain("a.jpg");
  });
});
