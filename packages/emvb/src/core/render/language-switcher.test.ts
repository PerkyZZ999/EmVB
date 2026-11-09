import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { validateLayout } from "../validate.ts";
import { renderPage } from "./index.ts";

const layout = (props: Record<string, unknown> = {}) => {
  const checked = validateLayout({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "lang0001", type: "language-switcher", props }],
    },
  });
  if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
  return checked.layout;
};
const two = [
  { locale: "en", href: "/about", current: true },
  { locale: "fr", href: "/fr/about", current: false },
];

describe("Language switcher (W-937)", () => {
  test("links each language in its own name, with hreflang and lang; the shown page is current", () => {
    const { html } = renderPage(layout(), emptyDesign(), {
      mode: "public",
      dynamic: { translations: two },
    });
    expect(html).toContain('<nav class="emvb-language-switcher" aria-label="Languages">');
    expect(html).toContain(
      '<a href="/about" hreflang="en" lang="en" aria-current="page">English</a>',
    );
    expect(html).toContain('<a href="/fr/about" hreflang="fr" lang="fr">Français</a>');
  });

  test("a label names the navigation", () => {
    const { html } = renderPage(layout({ label: "Langues" }), emptyDesign(), {
      mode: "public",
      dynamic: { translations: two },
    });
    expect(html).toContain('aria-label="Langues"');
  });

  test("with one language or none the public page shows nothing; the editor explains", () => {
    for (const translations of [undefined, [two[0] as (typeof two)[number]]]) {
      const pub = renderPage(layout(), emptyDesign(), {
        mode: "public",
        ...(translations ? { dynamic: { translations } } : {}),
      });
      expect(pub.html).not.toContain("emvb-language-switcher");
    }
    const editor = renderPage(layout(), emptyDesign(), { mode: "editor" });
    expect(editor.html).toContain("published translation");
  });

  test("an unsafe link from the host is dropped, not rendered", () => {
    const { html } = renderPage(layout(), emptyDesign(), {
      mode: "public",
      dynamic: {
        translations: [...two, { locale: "de", href: "javascript:alert(1)", current: false }],
      },
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Français");
  });
});
