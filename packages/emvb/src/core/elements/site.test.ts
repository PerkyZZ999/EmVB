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

describe("light and dark (W-1067)", () => {
  const design = (dark?: string) => {
    const d = emptyDesign();
    d.variables.colors = [
      { id: "bg", name: "Background", value: "#ffffff", ...(dark ? { dark } : {}) },
    ];
    return d;
  };
  const used = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      style: { backgroundColor: { var: "bg" } },
      children: [],
    },
  } as Layout;

  test("a colour's dark value applies with the system's dark setting or a dark choice", () => {
    const { css } = renderPage(used, design("#0b1220"), { scope: "p" });
    expect(css).toContain(
      '@media (prefers-color-scheme: dark){:where(.emvb-s-p) .emvb-root:not(:is([data-emvb-theme="light"] *)){--emvb-c-bg:#0b1220;color-scheme:dark}}',
    );
    expect(css).toContain(
      ':where(.emvb-s-p) .emvb-root:is([data-emvb-theme="dark"] *){--emvb-c-bg:#0b1220;color-scheme:dark}',
    );
    expect(renderPage(used, design(), { scope: "p" }).css.includes("prefers-color-scheme")).toBe(
      false,
    );
  });

  test("the Theme toggle is a toggle button that waits for its script", () => {
    const toggle = page({}) as unknown as { root: { children: unknown[] } };
    toggle.root.children = [{ id: "thme0001", type: "theme-toggle", props: {} }];
    const { html, runtimes, css } = renderPage(toggle as unknown as Layout, emptyDesign());
    expect(html).toContain(
      '<button class="emvb-theme-toggle" type="button" aria-pressed="false" data-emvb-theme-toggle="">Dark mode</button>',
    );
    expect(runtimes).toEqual(["theme"]);
    expect(css).toContain(".emvb-theme-toggle:not([data-emvb-ready]){display:none}");
  });
});
