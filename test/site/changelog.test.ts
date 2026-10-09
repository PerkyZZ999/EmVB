import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { releaseLabel } from "../../site/src/data/changelog";
import { nav } from "../../site/src/data/nav";

// emvb.dev/changelog/ renders the repository's CHANGELOG.md at build time, so it can't drift.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("emvb.dev changelog page (W-322)", () => {
  test("the page renders CHANGELOG.md itself, inside the site's header and footer", () => {
    const page = read("site/src/pages/changelog.astro");
    expect(page).toContain('from "../../../CHANGELOG.md"');
    expect(page).toContain("<Content />");
    expect(page).toContain("<SiteHeader />");
    expect(page).toContain("<SiteFooter />");
    expect(page).toContain("<h1>Changelog</h1>");
  });

  test("the header and footer link to it, and their section links work from any page", () => {
    expect(nav.some((item) => item.href === "/changelog/" && item.label === "Changelog")).toBe(
      true,
    );
    for (const item of nav) expect(item.href.startsWith("/")).toBe(true);
    const header = read("site/src/components/SiteHeader.astro");
    expect(header).not.toMatch(/href="#/);
  });

  test("the sitemap lists it", () => {
    expect(read("site/src/pages/sitemap.xml.ts")).toContain('"/changelog/"');
  });

  test("release headings split into a version and a date", () => {
    expect(releaseLabel("[0.2.1] - 2026-10-08")).toEqual({ version: "0.2.1", date: "2026-10-08" });
    expect(releaseLabel("0.1.0 - 2026-10-04")).toEqual({ version: "0.1.0", date: "2026-10-04" });
    expect(releaseLabel("[Unreleased]")).toEqual({ version: "Unreleased" });
    expect(releaseLabel("Unreleased")).toEqual({ version: "Unreleased" });
  });

  test("every release in CHANGELOG.md has a version and a date", () => {
    const releases = read("CHANGELOG.md")
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .map((line) => releaseLabel(line.slice(3)));
    expect(releases[0]).toEqual({ version: "Unreleased" });
    for (const release of releases.slice(1)) expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
