import { describe, expect, test } from "bun:test";
import { sanitizeMediaUrl } from "./media-url.ts";

describe("sanitizeMediaUrl (W-024, R-032)", () => {
  test.each([
    ["https://cdn.example/a.png", "https://cdn.example/a.png"],
    ["http://cdn.example/a.png", "http://cdn.example/a.png"],
    ["/uploads/photo.jpg", "/uploads/photo.jpg"],
    ["./local.webp", "./local.webp"],
    // W-091: pasted addresses often carry spaces around them.
    ["  https://cdn.example/spaced.png  ", "https://cdn.example/spaced.png"],
  ])("allows %s", (input, out) => {
    expect(sanitizeMediaUrl(input)).toBe(out);
  });

  test.each([
    "javascript:alert(1)",
    "data:image/png;base64,aaa",
    "mailto:a@b.c",
    "vbscript:msg",
    "<img src=x>",
    "",
    "https://cdn.example/a.png 1w, https://evil.example/x.png",
    "https://user:pass@cdn.example/a.png",
    "https://cdn.example/a\\b.png",
  ])("refuses %s", (input) => {
    expect(sanitizeMediaUrl(input)).toBeUndefined();
  });

  test.each(["//cdn.evil/a.png", "/\\cdn.evil/a.png"])(
    "refuses %s, which loads from another site (EmDash 1.0 url-field rule)",
    (input) => {
      expect(sanitizeMediaUrl(input)).toBeUndefined();
    },
  );
});
