import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

const grad = (color: string) =>
  `<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="${color}"/></linearGradient><clipPath id="c"><rect width="5" height="5"/></clipPath></defs><rect width="10" height="10" fill="url(#g)" clip-path="url(#c)"/><use href="#c"/><rect fill="url(#elsewhere)"/></svg>`;

const page = (): Layout => ({
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "svga0001", type: "svg", props: { markup: grad("red"), title: "Red" } },
      { id: "svgb0001", type: "svg", props: { markup: grad("lime"), title: "Lime" } },
    ],
  },
});

describe("W-785 svg ids", () => {
  test("two SVGs with the same internal ids each keep their own gradient", () => {
    const html = renderPage(page(), emptyDesign()).html;
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ["svga0001", "svgb0001"]) {
      expect(html).toContain(`id="${p}-g"`);
      expect(html).toContain(`fill="url(#${p}-g)"`);
      expect(html).toContain(`clip-path="url(#${p}-c)"`);
      expect(html).toContain(`href="#${p}-c"`);
    }
    // A reference to an id the SVG doesn't define is left alone.
    expect(html).toContain('fill="url(#elsewhere)"');
  });
});
