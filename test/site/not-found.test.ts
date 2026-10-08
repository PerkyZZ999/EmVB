import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// emvb.dev is a static site on Cloudflare Pages. Pages answers a path the site doesn't have with
// the top-level 404.html and a 404 status; without that file it serves the home page with a 200
// for every unknown path (soft 404s), including /playground/uploads/ before the playground's
// service worker is running.
const read = (path: string) =>
  readFileSync(new URL(`../../site/src/${path}`, import.meta.url), "utf8");

describe("emvb.dev 404 page (W-288)", () => {
  test("the site has a top-level 404 page that search engines don't list", () => {
    const page = read("pages/404.astro");
    expect(page).toContain("<Base");
    expect(page).toMatch(/\bnoindex\b/);
    expect(page).toContain("<h1>Page not found</h1>");
  });

  test("it links back to the home page and the playground", () => {
    const page = read("pages/404.astro");
    expect(page).toContain('href="/"');
    expect(page).toContain('href="/playground/"');
  });

  test("a noindex page prints robots noindex instead of a canonical link", () => {
    const base = read("layouts/Base.astro");
    expect(base).toContain("noindex?: boolean");
    expect(base).toMatch(
      /noindex \? <meta name="robots" content="noindex" \/> : <link rel="canonical"/,
    );
  });
});
