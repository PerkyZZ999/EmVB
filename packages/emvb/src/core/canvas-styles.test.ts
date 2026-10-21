import { describe, expect, test } from "bun:test";
import { canvasStyleUrls, MAX_CANVAS_STYLES } from "./canvas-styles.ts";

describe("host canvas stylesheets (W-327)", () => {
  test("keeps https/http URLs and site paths, in order and once each", () => {
    expect(
      canvasStyleUrls([
        "/styles/site.css",
        "https://fonts.example.com/css2?family=Inter",
        "http://cdn.example.com/a.css",
        "/styles/site.css",
      ]),
    ).toEqual([
      "/styles/site.css",
      "https://fonts.example.com/css2?family=Inter",
      "http://cdn.example.com/a.css",
    ]);
  });

  test("drops scripts, data, scheme-relative and relative URLs, and odd input", () => {
    expect(
      canvasStyleUrls([
        "javascript:alert(1)",
        "data:text/css,body{}",
        "//evil.example/a.css",
        "styles/site.css",
        '/a.css"><script>',
        " ",
        42,
        null,
      ]),
    ).toEqual([]);
    expect(canvasStyleUrls("/a.css")).toEqual([]);
    expect(canvasStyleUrls(undefined)).toEqual([]);
  });

  test(`at most ${MAX_CANVAS_STYLES}`, () => {
    const many = Array.from({ length: 15 }, (_, i) => `/s${i}.css`);
    expect(canvasStyleUrls(many)).toHaveLength(MAX_CANVAS_STYLES);
  });
});
