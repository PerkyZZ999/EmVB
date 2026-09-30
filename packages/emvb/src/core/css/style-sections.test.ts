import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { StyleProps } from "../schema/style.ts";
import { validateDesign, validateLayout } from "../validate.ts";

/** One stored style per W-088 section, with the CSS each must produce. */
const SECTIONS: Record<string, { style: StyleProps; css: string }> = {
  size: {
    style: {
      width: { value: 50, unit: "vw" },
      maxHeight: { value: 400, unit: "px" },
      overflow: "hidden",
      aspectRatio: "16/9",
      objectFit: "cover",
    },
    css: "width:50vw;max-height:400px;overflow:hidden;aspect-ratio:16 / 9;object-fit:cover",
  },
  position: {
    style: {
      position: "absolute",
      top: { value: -10, unit: "px" },
      right: { var: "gap", from: "spacing" },
      left: "auto",
      zIndex: 5,
    },
    css: "position:absolute;top:-10px;right:var(--emvb-s-gap);left:auto;z-index:5",
  },
  effects: {
    style: {
      opacity: 0.5,
      boxShadow: { x: 0, y: 4, blur: 12, spread: 0, color: { var: "ink" } },
      filter: { grayscale: 100, blur: 2 },
      cursor: "pointer",
    },
    css: "opacity:0.5;box-shadow:0px 4px 12px 0px var(--emvb-c-ink);filter:blur(2px) grayscale(100%);cursor:pointer",
  },
};

const pageWith = (style: StyleProps, classes?: string[]) => ({
  schemaVersion: 1,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "imag0001",
        type: "image",
        props: { src: "https://example.com/a.jpg", alt: "A", decorative: false },
        style,
        ...(classes ? { classes } : {}),
      },
    ],
  },
});

describe("W-088 style sections reach the canvas and the published page", () => {
  test.each(Object.entries(SECTIONS))("%s: local styles", (_, { style, css }) => {
    const checked = validateLayout(pageWith(style));
    expect(checked.ok ? null : checked.issues).toBeNull();
    if (!checked.ok) return;
    const published = renderPage(checked.layout, emptyDesign());
    const canvas = renderPage(checked.layout, emptyDesign(), { mode: "editor" });
    expect(published.css).toContain(`.emvb-e-imag0001{${css}}`);
    expect(canvas.css).toBe(published.css);
    expect(published.warnings).toEqual([]);
  });

  test.each(Object.entries(SECTIONS))("%s: through a class", (_, { style, css }) => {
    const design = validateDesign({
      ...emptyDesign(),
      classes: [{ id: "shot", name: "Shot", style }],
    });
    expect(design.ok ? null : design.issues).toBeNull();
    const checked = validateLayout({ ...pageWith({}, ["shot"]) });
    if (!design.ok || !checked.ok) throw new Error("invalid fixture");
    const published = renderPage(checked.layout, design.design);
    const canvas = renderPage(checked.layout, design.design, { mode: "editor" });
    expect(published.css).toContain(`.emvb-k-shot{${css}}`);
    expect(published.html).toContain("emvb-k-shot");
    expect(canvas.css).toBe(published.css);
  });
});
