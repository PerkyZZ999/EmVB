import { describe, expect, test } from "bun:test";
import { parseStartSeconds, resolveEmbedUrl } from "./embed-url.ts";

const src = (url: string) => resolveEmbedUrl(url)?.src;

describe("video start time (W-227)", () => {
  test("YouTube t= and start= become ?start=<seconds>", () => {
    expect(src("https://youtu.be/dQw4w9WgXcQ?t=90")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90",
    );
    expect(src("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")).toEndWith("?start=90");
    expect(src("https://www.youtube.com/embed/dQw4w9WgXcQ?start=42&autoplay=1")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42",
    );
  });
  test("Vimeo #t= becomes #t=<seconds>s, after an unlisted hash", () => {
    expect(src("https://vimeo.com/76979871#t=1m5s")).toBe(
      "https://player.vimeo.com/video/76979871#t=65s",
    );
    expect(src("https://vimeo.com/76979871/abcdef1234#t=30")).toBe(
      "https://player.vimeo.com/video/76979871?h=abcdef1234#t=30s",
    );
  });
  test("only whole seconds pass; junk, zero and huge times are dropped", () => {
    expect(parseStartSeconds("1h2m3s")).toBe(3723);
    for (const bad of ["", "0", "abc", "90;alert(1)", "-5", "1.5", "999999", '"><x'])
      expect(parseStartSeconds(bad)).toBeUndefined();
    expect(src('https://youtu.be/dQw4w9WgXcQ?t="><script>')).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(src("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });
});
