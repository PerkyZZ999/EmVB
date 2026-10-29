import { describe, expect, test } from "bun:test";
import { previewDocument } from "./FieldPreview.tsx";

describe("field-mode preview document (W-911)", () => {
  test("W-911: carries the page HTML, CSS, site styles and direction", () => {
    const doc = previewDocument({
      html: '<main class="emvb-x">Hi</main>',
      css: ".emvb-x{color:red}",
      canvasStyles: ["/_astro/site.css"],
      origin: "https://example.test",
      dir: "rtl",
    });
    expect(doc).toContain('<html dir="rtl">');
    expect(doc).toContain('<base href="https://example.test/">');
    expect(doc).toContain('<link rel="stylesheet" href="/_astro/site.css">');
    expect(doc).toContain("<style>.emvb-x{color:red}</style>");
    expect(doc).toContain('<main class="emvb-x">Hi</main>');
  });

  test("W-911: a hostile stylesheet URL or CSS cannot break out of its element", () => {
    const doc = previewDocument({
      html: "",
      css: "a{}</style><script>alert(1)</script>",
      canvasStyles: ['x"><script>alert(2)</script>'],
      origin: "https://example.test",
    });
    expect(doc).not.toContain("<script>");
    // One for the margin reset (W-920), one for the page CSS: no injected extra.
    expect(doc.match(/<\/style>/g)?.length).toBe(2);
  });
});

describe("preview inlines the site stylesheets (W-920)", () => {
  test("W-920: inlined site CSS replaces its link and lands before the page CSS", () => {
    const doc = previewDocument({
      html: "",
      css: ".emvb-x{color:red}",
      canvasStyles: ["/site.css", "https://cdn.test/a.css"],
      inlined: { "/site.css": ":root{font-family:system-ui}" },
      origin: "https://example.test",
    });
    expect(doc).toContain("<style>html,body{margin:0}</style>");
    expect(doc).not.toContain('href="/site.css"');
    expect(doc).toContain('<link rel="stylesheet" href="https://cdn.test/a.css">');
    const site = doc.indexOf(":root{font-family:system-ui}");
    expect(site).toBeGreaterThan(-1);
    expect(site).toBeLessThan(doc.indexOf(".emvb-x{color:red}"));
  });

  test("W-920: hostile inlined stylesheet text cannot end its element", () => {
    const doc = previewDocument({
      html: "",
      css: "",
      canvasStyles: ["/site.css"],
      inlined: { "/site.css": "a{}</style><script>alert(3)</script>" },
      origin: "https://example.test",
    });
    expect(doc).not.toContain("<script>");
    expect(doc.match(/<\/style>/g)?.length).toBe(3);
  });
});
