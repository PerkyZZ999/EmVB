import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateLayout, type Layout } from "../index.ts";
import { searchAction } from "./site.ts";

const page = (props: Record<string, unknown>): Layout =>
  ({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "srch0001", type: "search-form", props }],
    },
  }) as Layout;

describe("Search form (W-1073)", () => {
  test("a plain GET search landmark to /search with the words in q, and no script", () => {
    const { html, runtimes } = renderPage(page({}), emptyDesign());
    expect(html).toContain(
      '<form class="emvb-search-form" role="search" aria-label="Search" method="get" action="/search"><input class="emvb-search-input" type="search" name="q" aria-label="Search"><button class="emvb-search-button" type="submit">Search</button></form>',
    );
    expect(runtimes).toEqual([]);
  });

  test("its own name, placeholder, button text and search page", () => {
    const { html } = renderPage(
      page({
        label: "Search the docs",
        placeholder: "Try “carousel”",
        buttonText: "Go",
        action: "/docs/search",
      }),
      emptyDesign(),
    );
    expect(html).toContain('aria-label="Search the docs" method="get" action="/docs/search"');
    expect(html).toContain('placeholder="Try “carousel”"');
    expect(html).toContain('type="submit">Go</button>');
  });

  test("only a site path or web address is a search page", () => {
    expect(searchAction("https://example.com/find")).toBe("https://example.com/find");
    expect(searchAction("  /fr/recherche ")).toBe("/fr/recherche");
    for (const bad of ["javascript:alert(1)", "//evil.example", "mailto:a@b.c", "tel:123", "  "])
      expect([bad, searchAction(bad)]).toEqual([bad, "/search"]);
  });

  test("the schema limits each prop", () => {
    expect(validateLayout(page({ buttonText: "x".repeat(41) })).ok).toBe(false);
    expect(validateLayout(page({ placeholder: "Search" })).ok).toBe(true);
  });
});
