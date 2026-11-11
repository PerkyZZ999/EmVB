import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { footerNav, nav } from "../../site/src/data/nav";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("emvb.dev top bar and footer (W-965)", () => {
  test("the top bar has Charles's seven items, in order", () => {
    expect(nav.map((item) => item.label)).toEqual([
      "Home",
      "Features",
      "Theme Builder",
      "FAQ",
      "Documentation",
      "Playground",
      "Changelog",
    ]);
  });

  test("every top-bar section stays in the footer, with Styling too", () => {
    const footer = footerNav.map((item) => item.href);
    for (const item of nav) expect(footer).toContain(item.href);
    expect(footer).toContain("/#styles");
    expect(footer).toContain("/#under-the-hood");
  });

  test("GitHub is an icon button with a name, not a text link in the bar", () => {
    const header = read("site/src/components/SiteHeader.astro");
    expect(header).toContain('class="github"');
    expect(header).toContain('aria-label="EmVB on GitHub"');
    const links = header.slice(header.indexOf('<nav class="links"'), header.indexOf("</nav>"));
    expect(links.includes("github")).toBe(false);
  });

  test("the footer has no giant wordmark", () => {
    expect(read("site/src/components/SiteFooter.astro").includes("wordmark")).toBe(false);
  });

  test("the docs sidebar's All docs is a back-link button", () => {
    const page = read("site/src/pages/docs/[slug].astro");
    expect(page).toMatch(/<a class="all" href="\/docs\/">\s*<svg/);
    expect(page).toMatch(/\.all \{[^}]*border-radius: 999px/);
  });
});

test("the GitHub button comes before the Outline toggle (Charles, W-965)", () => {
  const header = read("site/src/components/SiteHeader.astro");
  expect(header.indexOf('class="github"')).toBeLessThan(header.indexOf('class="outline-toggle"'));
});

test("the docs menu scrolls with the page: no inner scrollbar on either column", () => {
  const page = read("site/src/pages/docs/[slug].astro");
  const style = page.slice(page.indexOf("<style>"));
  expect(style.includes("overflow-y: auto")).toBe(false);
  expect(style.includes("max-height: calc(")).toBe(false);
  expect(style).toMatch(/\.sidebar \{\s*align-self: start;\s*\}/);
});
