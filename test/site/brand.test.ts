import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("EmVB logo on emvb.dev (W-966)", () => {
  test("the header shows the wordmark, themed by the page's tokens", () => {
    expect(read("site/src/components/SiteHeader.astro")).toContain("<Wordmark />");
    const svg = read("site/src/brand/wordmark.svg");
    expect(svg).toContain('fill="var(--ink, #16140F)"');
    expect(svg).toContain('stroke="var(--accent, #1D4ED8)"');
    expect(svg).toContain('vector-effect="non-scaling-stroke"');
  });

  test("favicon, touch icon, manifest and social card are the new logo", () => {
    expect(read("site/public/favicon.svg")).toBe(read("docs/brand/icon-small-dark.svg"));
    for (const file of [
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "favicon-32.png",
      "og.png",
    ])
      expect(existsSync(new URL(`../../site/public/${file}`, import.meta.url))).toBe(true);
    const base = read("site/src/layouts/Base.astro");
    expect(base).toContain('new URL("/og.png", site)');
    expect(base).toContain('rel="apple-touch-icon"');
    expect(base).toContain('rel="manifest"');
  });

  test("the READMEs open with the logo, light and dark", () => {
    for (const path of [
      "README.md",
      "packages/emvb/README.md",
      "packages/emvb-mcp/README.md",
      "packages/emvb-icons/README.md",
    ]) {
      const readme = read(path);
      expect(readme.indexOf("docs/brand/logo-dark.svg")).toBeGreaterThan(-1);
      expect(readme.indexOf("docs/brand/logo-light.svg")).toBeLessThan(readme.indexOf("# "));
    }
  });
});
