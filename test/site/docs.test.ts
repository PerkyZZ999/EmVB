import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_DOCS } from "../../site/src/data/docs.ts";
import {
  docSlug,
  rewriteLink,
  siteHtml,
  withComingSoon,
  withoutIds,
} from "../../site/src/markdown/docs.ts";

const ROOT = join(import.meta.dir, "../..");
const GUIDE = join(ROOT, "docs/guides/upgrade-1.0.md");
const sourceOf = (slug: string) =>
  slug === "schema"
    ? "docs/SCHEMA.md"
    : slug === "extensions-api"
      ? "docs/EXTENSIONS.md"
      : `docs/guides/${slug}.md`;

describe("Docs section (W-964)", () => {
  test("every listed doc has its file, and every guide is listed", () => {
    for (const doc of ALL_DOCS) expect(existsSync(join(ROOT, sourceOf(doc.slug)))).toBe(true);
    const guides = new Bun.Glob("*.md").scanSync(join(ROOT, "docs/guides"));
    const listed = new Set(ALL_DOCS.map((doc) => doc.slug));
    for (const file of guides) expect(listed.has(file.slice(0, -3))).toBe(true);
  });

  test("internal ids come out of the text, other words stay", () => {
    expect(withoutIds("Install EmVB in a host site (R-052)")).toBe("Install EmVB in a host site");
    expect(withoutIds("npm packages (D-010, W-082).")).toBe("npm packages.");
    expect(withoutIds("Added in 1.0 (W-938, additive): m")).toBe("Added in 1.0 (additive): m");
    expect(withoutIds("(decision D-060)")).toBe("");
    expect(withoutIds("Windows (W-10 is not an id) and A-123")).toBe(
      "Windows (W-10 is not an id) and A-123",
    );
  });

  test("published docs carry no internal ids", () => {
    for (const doc of ALL_DOCS) {
      const text = withoutIds(readFileSync(join(ROOT, sourceOf(doc.slug)), "utf8"));
      expect(text.match(/\b[WDRN]-\d{3,4}\b/g) ?? []).toEqual([]);
    }
  });

  test("links between docs go to site pages; other repo files to GitHub", () => {
    expect(rewriteLink("co-design.md", GUIDE)).toBe("/docs/co-design/");
    expect(rewriteLink("install-in-a-host-site.md#languages-optional", GUIDE)).toBe(
      "/docs/install-in-a-host-site/#languages-optional",
    );
    expect(rewriteLink("../SCHEMA.md", GUIDE)).toBe("/docs/schema/");
    expect(rewriteLink("../../examples/emvb-ext-hello", GUIDE)).toBe(
      "https://github.com/PerkyZZ999/EmVB/blob/main/examples/emvb-ext-hello",
    );
    expect(rewriteLink("https://emvb.dev", GUIDE)).toBe("https://emvb.dev");
    expect(rewriteLink("#top", GUIDE)).toBe("#top");
    expect(docSlug("docs/project/HANDOFF.md")).toBeUndefined();
    expect(docSlug("docs/guides/sub/x.md")).toBeUndefined();
  });

  test("rendered HTML: links rewritten, scrollable blocks focusable once", () => {
    const html = siteHtml(
      '<p>See <a href="co-design.md">x</a> (W-930).</p><pre class="c" tabindex="0">a</pre><table><tr><td>1</td></tr></table>',
      GUIDE,
    );
    expect(html).toBe(
      '<p>See <a href="/docs/co-design/">x</a>.</p><pre class="c" tabindex="0">a</pre><table tabindex="0"><tr><td>1</td></tr></table>',
    );
  });
});

test("1.1 sections carry a New in 1.1 note while the site shows 1.0, and not after", () => {
  const html =
    '<h3 id="as-html-and-css-files-any-host">As HTML</h3><p>x</p><h3 id="as-json">JSON</h3>';
  const on10 = withComingSoon(html, "leaving-emvb", "1.0.0");
  expect(on10).toContain('</h3><p class="coming"><span class="coming-badge">New in 1.1</span>');
  expect(on10.match(/class="coming"/g)?.length).toBe(1);
  expect(withComingSoon(html, "leaving-emvb", "1.1.0")).toBe(html);
  expect(withComingSoon(html, "motion", "1.0.0")).toBe(html);
});
