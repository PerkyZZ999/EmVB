/** Views of a stored hex colour. The layout keeps hex; these convert for the picker (W-160). */

export type Rgba = { r: number; g: number; b: number; a: number };

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function channel(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as 0–255 channels. Alpha is 0–1. */
export function parseHex(hex: string): Rgba | null {
  const h = hex.trim();
  if (!HEX.test(h)) return null;
  let body = h.slice(1).toLowerCase();
  if (body.length === 3 || body.length === 4) body = [...body].map((ch) => ch + ch).join("");
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  const a = body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/** 6 digits when opaque, 8 when not. */
export function toHex({ r, g, b, a }: Rgba): string {
  const hex = [r, g, b].map((n) => channel(n).toString(16).padStart(2, "0")).join("");
  if (a >= 0.999) return `#${hex}`;
  const alpha = channel(a * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${hex}${alpha}`;
}

export function formatRgb({ r, g, b, a }: Rgba): string {
  const rgb = `${channel(r)}, ${channel(g)}, ${channel(b)}`;
  if (a >= 0.999) return rgb;
  return `${rgb}, ${Math.round(a * 100)}%`;
}

/** "255, 128, 0", "255 128 0", or with a fourth alpha as 0–1 or a percent. */
export function parseRgb(text: string): Rgba | null {
  const parts = text
    .trim()
    .replace(/^rgba?\(/i, "")
    .replace(/\)$/, "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const nums = parts.slice(0, 3).map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  let a = 1;
  const alpha = parts[3];
  if (alpha !== undefined) {
    if (alpha.endsWith("%")) {
      const pct = Number(alpha.slice(0, -1));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
      a = pct / 100;
    } else {
      const n = Number(alpha);
      if (!Number.isFinite(n) || n < 0 || n > 1) return null;
      a = n;
    }
  }
  return { r: nums[0] ?? 0, g: nums[1] ?? 0, b: nums[2] ?? 0, a };
}

function linearSrgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

type Oklch = { l: number; c: number; h: number; a: number };

function rgbaToOklch({ r, g, b, a }: Rgba): Oklch {
  const [L, A, B] = linearSrgbToOklab(
    srgbToLinear(r / 255),
    srgbToLinear(g / 255),
    srgbToLinear(b / 255),
  );
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L * 100, c, h: c < 0.0001 ? 0 : h, a };
}

/** Out-of-gamut channels are clipped into sRGB. */
function oklchToRgba({ l, c, h, a }: Oklch): Rgba {
  const rad = (h * Math.PI) / 180;
  const [lr, lg, lb] = oklabToLinearSrgb(l / 100, c * Math.cos(rad), c * Math.sin(rad));
  return {
    r: channel(linearToSrgb(lr) * 255),
    g: channel(linearToSrgb(lg) * 255),
    b: channel(linearToSrgb(lb) * 255),
    a,
  };
}

export function formatOklch(rgba: Rgba): string {
  const { l, c, h, a } = rgbaToOklch(rgba);
  // 3 / 5 / 2 digits is the least that round-trips every sRGB hex.
  const base = `${l.toFixed(3)}, ${c.toFixed(5)}, ${h.toFixed(2)}`;
  if (a >= 0.999) return base;
  return `${base}, ${Math.round(a * 100)}%`;
}

/** "70, 0.15, 40" or "70% 0.15 40 / 50%". L is 0–100, C is 0–0.5, H is 0–360. */
export function parseOklch(text: string): Rgba | null {
  const parts = text
    .trim()
    .replace(/^oklch\(/i, "")
    .replace(/\)$/, "")
    .replace("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const lRaw = parts[0] ?? "";
  const l = Number(lRaw.endsWith("%") ? lRaw.slice(0, -1) : lRaw);
  const c = Number(parts[1]);
  const h = Number(parts[2]);
  if (!Number.isFinite(l) || l < 0 || l > 100) return null;
  if (!Number.isFinite(c) || c < 0 || c > 0.5) return null;
  if (!Number.isFinite(h) || h < 0 || h > 360) return null;
  let a = 1;
  const alpha = parts[3];
  if (alpha !== undefined) {
    if (alpha.endsWith("%")) {
      const pct = Number(alpha.slice(0, -1));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
      a = pct / 100;
    } else {
      const n = Number(alpha);
      if (!Number.isFinite(n) || n < 0 || n > 1) return null;
      a = n;
    }
  }
  return oklchToRgba({ l, c, h, a });
}
