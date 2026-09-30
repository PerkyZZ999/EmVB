import { describe, expect, test } from "bun:test";
import { embedUrlCases } from "../../../test/fixtures/embed-url-cases.ts";
import golden from "../../../test/fixtures/embed-url-golden.json";
import { resolveEmbedUrl } from "./embed-url.ts";

describe("resolveEmbedUrl (W-026, R-013)", () => {
  test("YouTube watch URLs become youtube-nocookie embeds without autoplay", () => {
    expect(resolveEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1")).toEqual({
      kind: "iframe",
      provider: "youtube",
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
    expect(resolveEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "iframe",
      provider: "youtube",
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
  });

  test("Vimeo URLs become player.vimeo.com embeds without autoplay", () => {
    expect(resolveEmbedUrl("https://vimeo.com/123456789?autoplay=1")).toEqual({
      kind: "iframe",
      provider: "vimeo",
      src: "https://player.vimeo.com/video/123456789",
    });
  });

  test("media-library and relative video files become <video> sources", () => {
    expect(resolveEmbedUrl("/_emdash/api/media/file/01VID.mp4")).toEqual({
      kind: "video",
      src: "/_emdash/api/media/file/01VID.mp4",
    });
    expect(resolveEmbedUrl("https://cdn.example/clip.webm")).toEqual({
      kind: "video",
      src: "https://cdn.example/clip.webm",
    });
  });

  test("non-allowlisted hosts and schemes are refused", () => {
    expect(resolveEmbedUrl("https://evil.example/watch?v=abc")).toBeUndefined();
    expect(resolveEmbedUrl("javascript:alert(1)")).toBeUndefined();
    expect(resolveEmbedUrl("https://www.youtube.com/watch")).toBeUndefined();
  });
});

test("resolveEmbedUrl matches the recorded golden over hosts, path shapes and ids (W-086 L7)", () => {
  const cases = embedUrlCases();
  expect(cases).toHaveLength(golden.cases);
  const accepted: Record<string, unknown> = {};
  for (const input of cases) {
    const result = resolveEmbedUrl(input);
    if (result) accepted[input] = result;
  }
  expect(accepted).toEqual(golden.accepted);
});
