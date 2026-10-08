import { describe, expect, test } from "bun:test";
import type { Fetcher } from "./api.ts";
import { canonicalProblem, savePage, type PageDraft } from "./content-api.ts";

const PAGE: PageDraft = {
  title: "About",
  slug: "about",
  canvasMode: "site-layout",
  seoTitle: "T",
  seoDescription: "",
  layout: null,
};

/** Saves `draft` and returns the `seo` the PUT sent. */
async function sentSeo(draft: PageDraft): Promise<unknown> {
  let body: { seo?: unknown } = {};
  const fetcher: Fetcher = async (_path, init) => {
    body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ data: { _rev: "r2" } }), { status: 200 });
  };
  await savePage(fetcher, "p1", draft, "r1");
  return body.seo;
}

describe("W-284: canonical URL and noindex on save", () => {
  test("canonicalProblem accepts only absolute http(s) addresses, or nothing", () => {
    expect(canonicalProblem("")).toBeNull();
    expect(canonicalProblem("  https://example.com/a ")).toBeNull();
    expect(canonicalProblem("http://example.com")).toBeNull();
    for (const bad of ["/about", "example.com", "javascript:alert(1)", "ftp://x.org"]) {
      expect(canonicalProblem(bad)).toContain("https://");
    }
  });

  test("the save sends canonical and noIndex only when the draft has them", async () => {
    expect(await sentSeo(PAGE)).toEqual({ title: "T", description: null });
    expect(
      await sentSeo({ ...PAGE, seoCanonical: " https://example.com/a ", seoNoIndex: true }),
    ).toEqual({ title: "T", description: null, canonical: "https://example.com/a", noIndex: true });
    expect(await sentSeo({ ...PAGE, seoCanonical: "", seoNoIndex: false })).toEqual({
      title: "T",
      description: null,
      canonical: null,
      noIndex: false,
    });
  });

  test("a canonical EmDash would refuse is left out, so the rest of the save still lands", async () => {
    expect(await sentSeo({ ...PAGE, seoCanonical: "/about" })).toEqual({
      title: "T",
      description: null,
    });
  });
});
