import { describe, expect, test } from "bun:test";
import {
  nestingIssues,
  renderPage,
  validateDesign,
  validateLayout,
} from "../../packages/emvb/src/core/index.ts";
import {
  journalLayout,
  landingLayout,
  SEED_DESIGN,
  SEED_MEDIA,
  SEED_POSTS,
} from "../../site/src/playground/mock/seed.ts";
import { existsSync, statSync } from "node:fs";

// The playground's starter content is what every visitor sees first; it has to be data the real
// editor and renderer accept without a single warning.

describe("playground starter content", () => {
  test("site styles are a valid design system", () => {
    expect(validateDesign(SEED_DESIGN).ok).toBe(true);
  });

  test.each([
    ["landing", landingLayout],
    ["journal", journalLayout],
  ])("the %s page is valid, well nested and renders without warnings", (_name, make) => {
    const result = validateLayout(make());
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(nestingIssues(result.layout, 5)).toEqual([]);
    const design = validateDesign(SEED_DESIGN);
    if (!design.ok) throw new Error("design");
    const rendered = renderPage(result.layout, design.design, {
      dynamic: { posts: [...SEED_POSTS] },
    });
    expect(rendered.warnings).toEqual([]);
    expect(rendered.html.length).toBeGreaterThan(300);
  });

  test.each([
    ["landing", landingLayout],
    ["journal", journalLayout],
  ])(
    "the %s page has one main landmark and headings that don't skip a level (W-293)",
    (_n, make) => {
      const result = validateLayout(make());
      const design = validateDesign(SEED_DESIGN);
      if (!result.ok || !design.ok) throw new Error("invalid seed");
      const { html } = renderPage(result.layout, design.design, {
        dynamic: { posts: [...SEED_POSTS] },
      });
      expect(html.match(/<main[\s>]/g)?.length).toBe(1);
      const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
      expect(levels[0]).toBe(1);
      levels.forEach((level, i) => {
        if (i > 0) expect(level - (levels[i - 1] as number)).toBeLessThanOrEqual(1);
      });
    },
  );

  test("every seeded image ships with the site, at the size the library says", () => {
    for (const media of SEED_MEDIA) {
      const file = new URL(`../../site/public/playground/media/${media.filename}`, import.meta.url);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBe(media.size);
    }
  });
});
