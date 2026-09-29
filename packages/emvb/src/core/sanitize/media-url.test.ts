import { describe, expect, test } from "bun:test";
import { sanitizeMediaUrl } from "./media-url.ts";

describe("sanitizeMediaUrl (W-024, R-032)", () => {
  test.each([
    ["https://cdn.example/a.png", "https://cdn.example/a.png"],
    ["http://cdn.example/a.png", "http://cdn.example/a.png"],
    ["/uploads/photo.jpg", "/uploads/photo.jpg"],
    ["./local.webp", "./local.webp"],
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
