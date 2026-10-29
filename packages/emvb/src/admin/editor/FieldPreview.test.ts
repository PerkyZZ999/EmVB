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
    expect(doc.match(/<\/style>/g)?.length).toBe(1);
  });
});
