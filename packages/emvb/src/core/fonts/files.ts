/**
 * W-1072: custom font files. EmDash's media library (1.4 and 1.5) refuses `font/woff2` uploads
 * (its default upload allowlist has images, video, audio and PDF only), so EmVB keeps font files
 * in its own plugin storage and serves them from a public route with a long cache.
 */

/**
 * The largest font file EmVB stores: 1 MiB. Base64 in a plugin storage row, that stays under
 * Cloudflare D1's 2 MB row limit. A Latin WOFF2 is usually 15 to 150 KB.
 */
export const FONT_MAX_BYTES = 1024 * 1024;

/** The most font files a site keeps (uploads and Google downloads together). */
export const FONT_FILE_LIMIT = 300;

/** A stored font file's id: the first 16 hex digits of the SHA-256 of its bytes. */
export const FONT_ID = /^[0-9a-f]{16}$/;

/** The public URL a stored font file is served from (the plugin id is `emvb`). */
export const fontFileUrl = (id: string) => `/_emdash/api/plugins/emvb/font?id=${id}`;

const WOFF2_HEADER_BYTES = 48;
/** sfnt flavours: TrueType (0x00010000), CFF (`OTTO`) and collections (`ttcf`). */
const FLAVORS = new Set([0x00010000, 0x4f54544f, 0x74746366]);

/**
 * A real WOFF2 file: the `wOF2` signature, a known sfnt flavour, and a header length that matches
 * the file. Anything else (a renamed TTF, an HTML error page, a truncated download) is refused.
 */
export function isWoff2(bytes: Uint8Array): boolean {
  if (bytes.byteLength < WOFF2_HEADER_BYTES) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (
    view.getUint32(0) === 0x774f4632 &&
    FLAVORS.has(view.getUint32(4)) &&
    view.getUint32(8) === bytes.byteLength
  );
}

/** Why a font file is refused, or undefined when it can be stored. */
export function fontFileProblem(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength > FONT_MAX_BYTES) {
    return `This font is ${Math.ceil(bytes.byteLength / 1024)} KB. Use a WOFF2 file up to ${FONT_MAX_BYTES / 1024} KB.`;
  }
  if (!isWoff2(bytes)) return "This isn't a WOFF2 font file. Convert the font to WOFF2 first.";
  return undefined;
}

/** The id a font file is stored under (content-addressed, so the same file is stored once). */
export async function fontFileId(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The bytes of a base64 string, or undefined when it isn't base64. */
export function base64ToBytes(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return undefined;
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
