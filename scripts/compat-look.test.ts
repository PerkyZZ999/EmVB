import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { caseNames, EXPECTED_DIR, renderCase } from "../packages/emvb/test/compat/render-case.ts";
import {
  isApproved,
  outputHash,
  readLookChanges,
  referenceOutput,
  staticPage,
  VIEWPORTS,
} from "./compat-look.ts";
import { compareImages, decodePng, encodePng, type Rgba } from "./compat-look/image.ts";

// W-1075: the pieces of the compat look check that don't need a browser.

const image = (width: number, height: number, pixel: (x: number, y: number) => number[]) => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data } satisfies Rgba;
};
const gradient = image(7, 5, (x, y) => [x * 30, y * 50, (x * y * 13) % 256, 255]);

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** An RGB PNG (colour type 2) whose row y uses filter y % 5, as Chromium's encoder may. */
function filteredRgbPng({ width, height, data }: Rgba): Uint8Array {
  const stride = width * 3;
  const at = (y: number, i: number) =>
    i < 0 || y < 0 ? 0 : (data[(y * width + Math.floor(i / 3)) * 4 + (i % 3)] ?? 0);
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const [value, left, up, upLeft] = [at(y, i), at(y, i - 3), at(y - 1, i), at(y - 1, i - 3)];
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] ?? 0;
      raw[y * (stride + 1) + 1 + i] = (value - predicted) & 0xff;
    }
  }
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

describe("W-1075: screenshots are read and written without a dependency", () => {
  test("an RGBA image survives encoding and decoding", () => {
    const back = decodePng(encodePng(gradient));
    expect([back.width, back.height]).toEqual([7, 5]);
    expect([...back.data]).toEqual([...gradient.data]);
  });

  test("an RGB PNG using every row filter decodes to the same pixels", () => {
    const back = decodePng(filteredRgbPng(gradient));
    expect([...back.data]).toEqual([...gradient.data]);
  });

  test("anything but an 8-bit RGB or RGBA PNG is refused", () => {
    expect(() => decodePng(new Uint8Array(16))).toThrow("not a PNG");
  });
});

describe("W-1075: two screenshots are compared pixel by pixel", () => {
  const changed = (delta: number) =>
    image(7, 5, (x, y) => {
      const base = [x * 30, y * 50, (x * y * 13) % 256, 255];
      return x === 3 && y === 2 ? base.map((v, c) => (c === 0 ? v + delta : v)) : base;
    });

  test("identical screenshots have no differing pixel", () => {
    expect(compareImages(gradient, gradient, 24).differentPixels).toBe(0);
  });

  test("one pixel past the tolerance is a difference, and the diff image marks it", () => {
    const result = compareImages(gradient, changed(25), 24);
    expect(result.differentPixels).toBe(1);
    expect([...result.diff.data.subarray((2 * 7 + 3) * 4, (2 * 7 + 3) * 4 + 4)]).toEqual([
      255, 0, 0, 255,
    ]);
  });

  test("a difference within the tolerance is anti-aliasing noise", () => {
    expect(compareImages(gradient, changed(24), 24).differentPixels).toBe(0);
  });

  test("a page that grows differs at every pixel the other doesn't have", () => {
    const taller = image(7, 6, (x, y) => [x * 30, y * 50, (x * y * 13) % 256, 255]);
    const result = compareImages(gradient, taller, 24);
    expect(result.sameSize).toBe(false);
    expect(result.differentPixels).toBe(7);
    expect([result.diff.width, result.diff.height]).toEqual([7, 6]);
  });
});

describe("W-1075: each case renders as a static page", () => {
  test("the page loads nothing and runs nothing", () => {
    const page = staticPage({ html: "<p>x</p>", css: "p{color:red}" });
    expect(page).toContain("default-src 'none'");
    expect(page).not.toContain("script-src");
    expect(page).toContain("<style>p{color:red}</style>");
    expect(page).toContain('<body style="margin:0"><p>x</p></body>');
  });

  test("CSS can't close its style element", () => {
    const page = staticPage({ html: "", css: "a{}</style><script>x</script>" });
    expect(page).toContain("a{}<\\/style><script>");
    expect(page.match(/<\/style>/g)?.length).toBe(1);
  });

  test("desktop, tablet and phone widths", () => {
    expect(VIEWPORTS.map((v) => v.width)).toEqual([1440, 768, 390]);
  });

  test("without a base, a case is held to its expected file in the working tree", () => {
    const name = caseNames()[0] ?? "";
    const stored = JSON.parse(readFileSync(join(EXPECTED_DIR, `${name}.json`), "utf8")) as {
      html: string;
      css: string;
    };
    expect(outputHash(referenceOutput(name))).toBe(outputHash(stored));
  });
});

describe("W-1075: a deliberate look change names its exact output", () => {
  const output = { html: "<p>new</p>", css: "" };
  const entry = { case: "v15-demo-home", output: outputHash(output), why: "W-1: fix" };

  test("an entry approves only its case's exact output", () => {
    expect(isApproved([entry], "v15-demo-home", output)).toBe(true);
    expect(isApproved([entry], "v15-demo-home", { ...output, css: "p{}" })).toBe(false);
    expect(isApproved([entry], "v15-demo-404", output)).toBe(false);
  });

  test("every entry in look-changes.json matches its case's current render", () => {
    const stale = readLookChanges()
      .filter(
        (change) =>
          !caseNames().includes(change.case) ||
          change.output !== outputHash(renderCase(change.case)) ||
          !/W-\d+/.test(change.why),
      )
      .map((change) => change.case);
    expect(stale).toEqual([]);
  });
});
