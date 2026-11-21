/**
 * W-1075: just enough PNG to read Chromium's screenshots and write a diff image, plus the pixel
 * comparison the compat look check uses. No dependency: node:zlib does the compression.
 */
import { crc32, deflateSync, inflateSync } from "node:zlib";

/** An RGBA image, 8 bits per channel, rows top to bottom. */
export type Rgba = { width: number; height: number; data: Uint8Array };

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what Chromium's screenshots are). */
export function decodePng(png: Uint8Array): Rgba {
  if (!SIGNATURE.every((byte, i) => png[i] === byte)) throw new Error("not a PNG");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < png.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      channels = colour === 6 ? 4 : colour === 2 ? 3 : 0;
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(`unsupported PNG (depth ${depth}, colour type ${colour})`);
      }
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? (rows[out + x - channels] ?? 0) : 0;
      const up = y > 0 ? (rows[out - stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= channels ? (rows[out - stride + x - channels] ?? 0) : 0;
      const value = line[x] ?? 0;
      const predicted =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : paeth(left, up, upLeft);
      rows[out + x] = (value + predicted) & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: rows };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) {
    data[j] = rows[i] ?? 0;
    data[j + 1] = rows[i + 1] ?? 0;
    data[j + 2] = rows[i + 2] ?? 0;
    data[j + 3] = 255;
  }
  return { width, height, data };
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Encodes an RGBA image as a PNG (no filtering; diff images only). */
export function encodePng({ width, height, data }: Rgba): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

export type Comparison = {
  /** Pixels where some channel differs by more than the tolerance (or that only one image has). */
  differentPixels: number;
  sameSize: boolean;
  /** The reference, faded, with differing pixels in red; the larger of the two sizes. */
  diff: Rgba;
};

/**
 * Compares two screenshots pixel by pixel. `tolerance` is the largest per-channel difference
 * (0-255) still counted as the same pixel, for anti-aliasing noise. Images of different sizes
 * differ at every pixel outside the smaller one.
 */
export function compareImages(reference: Rgba, actual: Rgba, tolerance: number): Comparison {
  const width = Math.max(reference.width, actual.width);
  const height = Math.max(reference.height, actual.height);
  const diff = new Uint8Array(width * height * 4);
  let differentPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      const inRef = x < reference.width && y < reference.height;
      const inActual = x < actual.width && y < actual.height;
      const r = (y * reference.width + x) * 4;
      const a = (y * actual.width + x) * 4;
      let same = inRef && inActual;
      for (let c = 0; same && c < 4; c++) {
        same = Math.abs((reference.data[r + c] ?? 0) - (actual.data[a + c] ?? 0)) <= tolerance;
      }
      if (same) {
        const grey = inRef ? (reference.data[r] ?? 0) : 255;
        diff.set([grey, grey, grey, 64], out);
      } else {
        differentPixels++;
        diff.set([255, 0, 0, 255], out);
      }
    }
  }
  return {
    differentPixels,
    sameSize: reference.width === actual.width && reference.height === actual.height,
    diff: { width, height, data: diff },
  };
}
