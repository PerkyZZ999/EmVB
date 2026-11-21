import { describe, expect, test } from "bun:test";
import {
  base64ToBytes,
  bytesToBase64,
  FONT_MAX_BYTES,
  fontFileId,
  fontFileProblem,
  isWoff2,
} from "./files.ts";
import { googleCssUrl, googleFileUrl, parseGoogleFontCss, pickGoogleFaces } from "./google.ts";
import { fakeWoff2 } from "./test-font.ts";

// W-1072: font files are real WOFF2 within the size cap; Google's CSS is read strictly.

describe("font files (W-1072)", () => {
  test("only a real WOFF2 header passes", () => {
    expect(isWoff2(fakeWoff2())).toBe(true);
    const ttf = fakeWoff2();
    new DataView(ttf.buffer).setUint32(0, 0x00010000);
    expect(isWoff2(ttf)).toBe(false);
    const woff1 = fakeWoff2();
    new DataView(woff1.buffer).setUint32(0, 0x774f4646);
    expect(isWoff2(woff1)).toBe(false);
    // A truncated download: the header says 64 bytes, 63 arrived.
    expect(isWoff2(fakeWoff2().subarray(0, 63))).toBe(false);
    const flavor = fakeWoff2();
    new DataView(flavor.buffer).setUint32(4, 0x3c68746d);
    expect(isWoff2(flavor)).toBe(false);
    expect(isWoff2(new TextEncoder().encode("wOF2<html>not a font</html>".padEnd(64)))).toBe(false);
  });

  test("the size cap refuses a larger file with the reason", () => {
    expect(fontFileProblem(fakeWoff2(FONT_MAX_BYTES))).toBeUndefined();
    expect(fontFileProblem(fakeWoff2(FONT_MAX_BYTES + 4))).toContain("up to 1024 KB");
    expect(fontFileProblem(new Uint8Array(100))).toContain("isn't a WOFF2");
  });

  test("ids are content hashes and base64 round-trips a large file", async () => {
    const file = fakeWoff2(200_000, 7);
    expect(await fontFileId(file)).toMatch(/^[0-9a-f]{16}$/);
    expect(await fontFileId(file)).toBe(await fontFileId(fakeWoff2(200_000, 7)));
    expect(await fontFileId(file)).not.toBe(await fontFileId(fakeWoff2(200_000, 8)));
    const back = base64ToBytes(bytesToBase64(file));
    expect(back?.byteLength).toBe(file.byteLength);
    expect(back?.every((b, i) => b === file[i])).toBe(true);
    expect(base64ToBytes("not base64!")).toBeUndefined();
  });
});

/** Two rules of a real css2 answer (Open Sans 400, 2026-11-19), plus a cyrillic one. */
const GOOGLE_CSS = `/* cyrillic */
@font-face {
  font-family: 'Open Sans';
  font-style: normal;
  font-weight: 400;
  font-stretch: 100%;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/opensans/v44/cyr.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* latin-ext */
@font-face {
  font-family: 'Open Sans';
  font-style: normal;
  font-weight: 400;
  font-stretch: 100%;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/opensans/v44/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC;
}
/* latin */
@font-face {
  font-family: 'Open Sans';
  font-style: normal;
  font-weight: 400;
  font-stretch: 100%;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/opensans/v44/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153;
}
`;

describe("Google fonts CSS (W-1072)", () => {
  test("the CSS API URL asks for one family, weight and style", () => {
    expect(googleCssUrl("Open Sans", 700, "normal")).toBe(
      "https://fonts.googleapis.com/css2?family=Open+Sans:wght@700&display=swap",
    );
    expect(googleCssUrl("Lora", 400, "italic")).toBe(
      "https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,400&display=swap",
    );
  });

  test("faces are read with their subsets and ranges, and picked by subset", () => {
    const faces = parseGoogleFontCss(GOOGLE_CSS);
    expect(faces.map((f) => f.subset)).toEqual(["cyrillic", "latin-ext", "latin"]);
    expect(faces[2]).toEqual({
      style: "normal",
      weight: 400,
      url: "https://fonts.gstatic.com/s/opensans/v44/latin.woff2",
      unicodeRange: "U+0000-00FF, U+0131, U+0152-0153",
      subset: "latin",
    });
    const picked = pickGoogleFaces(faces, {
      weight: 400,
      style: "normal",
      subsets: ["latin", "latin-ext"],
    });
    expect(picked.map((f) => f.subset)).toEqual(["latin-ext", "latin"]);
    expect(pickGoogleFaces(faces, { weight: 700, style: "normal", subsets: ["latin"] })).toEqual(
      [],
    );
  });

  test("a file on any other host, scheme or port, or another format, is skipped", () => {
    for (const url of [
      "https://evil.test/s/x.woff2",
      "http://fonts.gstatic.com/s/x.woff2",
      "https://fonts.gstatic.com:8443/s/x.woff2",
      "https://user:pw@fonts.gstatic.com/s/x.woff2",
      "https://fonts.gstatic.com.evil.test/s/x.woff2",
    ]) {
      expect(googleFileUrl(url)).toBeUndefined();
      const css = GOOGLE_CSS.replace("https://fonts.gstatic.com/s/opensans/v44/latin.woff2", url);
      expect(parseGoogleFontCss(css).some((f) => f.subset === "latin")).toBe(false);
    }
    const ttf = GOOGLE_CSS.replace("latin.woff2) format('woff2')", "latin.ttf) format('truetype')");
    expect(parseGoogleFontCss(ttf).some((f) => f.subset === "latin")).toBe(false);
    const range = GOOGLE_CSS.replace("U+0000-00FF, U+0131, U+0152-0153", "U+00ZZ, expression(x)");
    expect(parseGoogleFontCss(range).some((f) => f.subset === "latin")).toBe(false);
    // A brace ends the rule where it stands: what is read before it is still only a range.
    const brace = GOOGLE_CSS.replace("U+0000-00FF, U+0131, U+0152-0153", "U+0000}*{color:red");
    expect(parseGoogleFontCss(brace).find((f) => f.subset === "latin")?.unicodeRange).toBe(
      "U+0000",
    );
  });
});
