import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// W-312/W-313: a page with an A/B test or visitor rule is private; the demos' Base layout must
// not route-cache it, and must decide only after the theme parts have had their say.
describe("demo layouts never route-cache a personalized page", () => {
  for (const demo of ["node", "cloudflare"]) {
    test(`${demo}: Base sets cache hints only after the theme, and not when private`, () => {
      const source = readFileSync(
        new URL(`../../demos/${demo}/src/layouts/Base.astro`, import.meta.url),
        "utf8",
      );
      const theme = source.indexOf("await resolveThemeParts(");
      const hint = source.indexOf("Astro.cache.set(");
      expect(theme).toBeGreaterThan(0);
      expect(hint).toBeGreaterThan(theme);
      expect(source).toContain("if (Astro.cache?.enabled && !personalized)");
    });
  }
});
