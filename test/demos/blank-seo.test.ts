import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// W-274: a blank canvas page has no site layout, so the demos hand EmVBPage the page's SEO meta.
describe("demo blank canvas pages print their SEO tags", () => {
  for (const demo of ["node", "cloudflare"]) {
    test(`${demo}: the standalone EmVBPage gets seo={seo}`, () => {
      const source = readFileSync(
        new URL(`../../demos/${demo}/src/pages/[slug].astro`, import.meta.url),
        "utf8",
      );
      const standalone = source.match(/<EmVBPage[^>]*\bstandalone\b[^>]*>/)?.[0] ?? "";
      expect(standalone).toContain("seo={seo}");
    });
  }
});
