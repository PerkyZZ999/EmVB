/**
 * W-1072: Google fonts, self-hosted. The server asks Google's CSS API for one family, weight and
 * style, downloads the WOFF2 files it lists and stores them like uploads, so public pages only
 * load the site's own URLs. Google Fonts are under the SIL Open Font License (a few under Apache
 * 2.0 or the Ubuntu Font Licence), which allow self-hosting.
 */

export const GOOGLE_CSS_HOST = "fonts.googleapis.com";
export const GOOGLE_FILE_HOST = "fonts.gstatic.com";

/** Google family names: Latin letters, digits and single spaces ("Open Sans", "Noto Sans JP"). */
export const GOOGLE_FAMILY = /^[A-Za-z0-9](?:[A-Za-z0-9]| (?=[A-Za-z0-9])){0,59}$/;

/** Subset labels as the CSS API writes them in its comments ("latin-ext", "[12]"). */
export const GOOGLE_SUBSET = /^(?:[a-z0-9-]{1,30}|\[\d{1,3}\])$/;

/** The subsets a new import downloads unless the editor picks others. */
export const DEFAULT_GOOGLE_SUBSETS = ["latin", "latin-ext"] as const;

/** The most files one weight and style may bring (one per subset). */
export const GOOGLE_FILES_PER_FACE = 12;

export const GOOGLE_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/**
 * A modern browser's User-Agent: the CSS API picks the file format from it, and only answers
 * WOFF2 to browsers it knows support it.
 */
export const GOOGLE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** The CSS API URL for one family, weight and style. */
export function googleCssUrl(family: string, weight: number, style: "normal" | "italic"): string {
  const name = family.replace(/ /g, "+");
  const axes = style === "italic" ? `ital,wght@1,${weight}` : `wght@${weight}`;
  return `https://${GOOGLE_CSS_HOST}/css2?family=${name}:${axes}&display=swap`;
}

export type GoogleFace = {
  style: "normal" | "italic";
  weight: number;
  /** A fonts.gstatic.com HTTPS URL. */
  url: string;
  unicodeRange?: string;
  /** The subset label from the comment before the rule, when there is one. */
  subset?: string;
};

/** A font file URL on fonts.gstatic.com over HTTPS, with no credentials or port, or undefined. */
export function googleFileUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.hostname !== GOOGLE_FILE_HOST) return undefined;
  if (url.port || url.username || url.password) return undefined;
  return url.href;
}

const UNICODE_RANGE_VALUE =
  /^U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f]{1,6})?(?:, ?U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f]{1,6})?)*$/;

/**
 * The WOFF2 faces in a CSS API answer. Rules that don't read as expected (another format, another
 * host, a weight range) are skipped, never guessed at.
 */
export function parseGoogleFontCss(css: string): GoogleFace[] {
  const faces: GoogleFace[] = [];
  const rule = /(?:\/\*\s*([^*]{1,40}?)\s*\*\/\s*)?@font-face\s*\{([^{}]{1,2000})\}/g;
  for (const match of css.matchAll(rule)) {
    const label = match[1]?.trim();
    const body = match[2] ?? "";
    const style = /(?:^|;)\s*font-style:\s*(normal|italic)\s*(?:;|$)/.exec(body)?.[1];
    const weight = /(?:^|;)\s*font-weight:\s*(\d{1,4})\s*(?:;|$)/.exec(body)?.[1];
    const src =
      /(?:^|;)\s*src:\s*url\(([^()\s'"]{1,500})\)\s*format\(['"]woff2['"]\)\s*(?:;|$)/.exec(
        body,
      )?.[1];
    const range = /(?:^|;)\s*unicode-range:\s*([^;]{1,1000}?)\s*(?:;|$)/.exec(body)?.[1];
    if (!style || !weight || !src) continue;
    const url = googleFileUrl(src);
    const n = Number(weight);
    if (!url || n < 1 || n > 1000) continue;
    if (range !== undefined && !UNICODE_RANGE_VALUE.test(range)) continue;
    faces.push({
      style: style === "italic" ? "italic" : "normal",
      weight: n,
      url,
      ...(range !== undefined ? { unicodeRange: range } : {}),
      ...(label && GOOGLE_SUBSET.test(label) ? { subset: label } : {}),
    });
  }
  return faces;
}

/**
 * The faces of one import: the requested weight and style, in the chosen subsets. A rule without
 * a subset label is kept (an answer with a single file has none).
 */
export function pickGoogleFaces(
  faces: readonly GoogleFace[],
  wanted: { weight: number; style: "normal" | "italic"; subsets: readonly string[] },
): GoogleFace[] {
  return faces.filter(
    (face) =>
      face.weight === wanted.weight &&
      face.style === wanted.style &&
      (face.subset === undefined || wanted.subsets.includes(face.subset)),
  );
}
