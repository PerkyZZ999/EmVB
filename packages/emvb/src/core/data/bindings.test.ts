import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import {
  applyBindings,
  layoutUsesSource,
  paramsFromSearch,
  resolveBinding,
  siteBindingValues,
  withBinding,
} from "./bindings.ts";

const page = (...children: LayoutNode[]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});

const heading: LayoutNode = {
  id: "head0001",
  type: "heading",
  props: { text: "Welcome", level: 1 },
  bind: { text: { source: "param", key: "name" } },
};

const post = {
  id: "p1",
  slug: "hello",
  title: "Hello world",
  excerpt: "",
  content: "",
  permalink: "/posts/hello",
  fields: { role: "Engineer", years: 4 },
};

describe("data bindings (W-307)", () => {
  test("a bound heading reads its URL parameter, escaped, and falls back to its typed text", () => {
    const bound = renderPage(page(heading), emptyDesign(), {
      dynamic: { params: { name: "<b>Ada</b>" } },
    }).html;
    expect(bound).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(bound).not.toContain("Welcome");
    const fallback = renderPage(page(heading), emptyDesign(), { dynamic: { params: {} } }).html;
    expect(fallback).toContain("Welcome");
  });

  test("post fields, the post's own data and site settings resolve", () => {
    expect(resolveBinding({ source: "post", key: "title" }, { post })).toBe("Hello world");
    expect(resolveBinding({ source: "post", key: "role" }, { post })).toBe("Engineer");
    expect(resolveBinding({ source: "post", key: "years" }, { post })).toBe("4");
    expect(resolveBinding({ source: "post", key: "missing" }, { post })).toBeUndefined();
    expect(resolveBinding({ source: "site", key: "title" }, { site: { title: "Acme" } })).toBe(
      "Acme",
    );
    // Prototype keys are not fields.
    expect(resolveBinding({ source: "site", key: "constructor" }, { site: {} })).toBeUndefined();
  });

  test("a bound link that resolves to javascript: is refused by the link sanitizer", () => {
    const link: LayoutNode = {
      id: "link0001",
      type: "link",
      props: { text: "Go", href: "/safe" },
      bind: { href: { source: "param", key: "next" } },
    };
    const html = renderPage(page(link), emptyDesign(), {
      dynamic: { params: { next: "javascript:alert(1)" } },
    }).html;
    expect(html).not.toContain("javascript:");
  });

  test("W-307 a refused bound link or image keeps the typed one instead of blanking", () => {
    const button: LayoutNode = {
      id: "butt0001",
      type: "button",
      props: { text: "Go", href: "/safe" },
      bind: { href: { source: "param", key: "next" } },
    };
    const image: LayoutNode = {
      id: "imag0001",
      type: "image",
      props: { src: "/hero.png", alt: "Hero" },
      bind: { src: { source: "param", key: "next" } },
    };
    for (const next of ["javascript:alert(1)", "data:image/svg+xml,x", "//evil.test/x"]) {
      const html = renderPage(page(button, image), emptyDesign(), {
        dynamic: { params: { next } },
      }).html;
      expect(html).toContain('href="/safe"');
      expect(html).toContain('src="/hero.png"');
    }
    const ok = renderPage(page(button, image), emptyDesign(), {
      dynamic: { params: { next: "/other.png" } },
    }).html;
    expect(ok).toContain('href="/other.png"');
    expect(ok).toContain('src="/other.png"');
  });

  test("bindings on fields an element can't bind are ignored", () => {
    const node = { ...heading, bind: { level: { source: "param", key: "x" } } } as LayoutNode;
    expect(applyBindings(node, { params: { x: "9" } })).toBe(node);
  });

  test("bound values lose control characters and are capped at 500 characters", () => {
    const long = "a".repeat(900);
    const value = resolveBinding({ source: "param", key: "q" }, { params: { q: `\u0000${long}` } });
    expect(value?.length).toBe(500);
    expect(value?.startsWith("a")).toBe(true);
  });

  test("the editor marks bound elements; public pages don't", () => {
    const editor = renderPage(page(heading), emptyDesign(), { mode: "editor" }).html;
    expect(editor).toContain("data-emvb-bound");
    expect(renderPage(page(heading), emptyDesign()).html).not.toContain("data-emvb-bound");
  });

  test("a layout with bindings validates, and a bad key is refused", () => {
    expect(validateLayout(page(heading)).ok).toBe(true);
    const bad = { ...heading, bind: { text: { source: "param", key: "1nope" } } };
    expect(validateLayout(page(bad as LayoutNode)).ok).toBe(false);
  });

  test("withBinding sets and clears, dropping an empty bind", () => {
    const cleared = withBinding(heading, "text", undefined);
    expect("bind" in cleared).toBe(false);
    expect(withBinding(cleared, "href", { source: "site", key: "url" }).bind).toEqual({
      href: { source: "site", key: "url" },
    });
  });

  test("URL parameters: first value wins, odd names are skipped", () => {
    expect(paramsFromSearch(new URLSearchParams("a=1&a=2&__proto__=x&b-c=3"))).toEqual({
      a: "1",
      "b-c": "3",
    });
  });

  test("site settings flatten to text, with media as their URL", () => {
    expect(
      siteBindingValues({
        title: "Acme",
        postsPerPage: 10,
        logo: { src: "/logo.png" },
        social: { github: "acme" },
        seo: { titleSeparator: "|" },
      }),
    ).toEqual({ title: "Acme", postsPerPage: "10", logo: "/logo.png", "social.github": "acme" });
  });

  test("hosts only fetch what a layout uses", () => {
    expect(layoutUsesSource(page(heading).root, "param")).toBe(true);
    expect(layoutUsesSource(page(heading).root, "site")).toBe(false);
  });
});
