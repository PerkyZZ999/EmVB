import { MAX_DESIGN_BYTES, MAX_LAYOUT_BYTES } from "../limits.ts";
import type { DesignSystem } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { validateDesign, validateLayout } from "../validate.ts";

/** Where shared pages open (W-321). */
export const PLAYGROUND_URL = "https://emvb.dev/playground/";
/** `#p=` holds the page, so it never reaches a server log. */
const SHARE_HASH_KEY = "p";
/** Format tag, so a later encoding can be told apart. */
const VERSION = "1";
/** Past this, some chat apps and browsers cut the link (W-321). */
export const LONG_LINK_CHARS = 8000;
/** A link longer than this is refused outright. */
const MAX_LINK_CHARS = 200_000;
const MAX_TITLE = 120;
/** Unpacked text: a layout and a design at their limits, plus a little JSON. */
const MAX_UNPACKED_BYTES = MAX_LAYOUT_BYTES + MAX_DESIGN_BYTES + 4096;

export type SharedPage = { title: string; layout: Layout; design?: DesignSystem };

export type ShareRead =
  | { ok: true; page: SharedPage }
  | { ok: false; reason: "empty" | "too-long" | "unreadable" | "invalid"; detail?: string };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  max: number,
) {
  const writer = stream.writable.getWriter();
  void writer
    .write(bytes as Uint8Array<ArrayBuffer>)
    .then(() => writer.close())
    .catch(() => {});
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    // Read in order; stop early so a tiny link can't unpack into something huge.
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      throw new Error("too big");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/**
 * The page and (optionally) Site styles packed for a link (W-321): JSON, deflated, base64url,
 * prefixed with a version.
 */
export async function encodeSharedPage(page: SharedPage): Promise<string> {
  const json = JSON.stringify({
    t: page.title.slice(0, MAX_TITLE),
    l: page.layout,
    ...(page.design ? { d: page.design } : {}),
  });
  const packed = await pipe(
    new TextEncoder().encode(json),
    new CompressionStream("deflate-raw"),
    Number.MAX_SAFE_INTEGER,
  );
  return `${VERSION}.${toBase64Url(packed)}`;
}

/** The full link: the playground with the page in its hash. */
export const shareUrl = (encoded: string, base: string = PLAYGROUND_URL): string =>
  `${base}#${SHARE_HASH_KEY}=${encoded}`;

/** The packed page in a location hash (`#p=…`), if any. */
export function sharedFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const value = params.get(SHARE_HASH_KEY);
  return value ? value.trim() : null;
}

/**
 * Unpacks and checks a shared page (W-321). Everything goes through the same validation as a
 * saved page, with the same size limits, so a link can't carry anything a page couldn't.
 */
export async function decodeSharedPage(encoded: string): Promise<ShareRead> {
  const text = encoded.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_LINK_CHARS) return { ok: false, reason: "too-long" };
  const [version, body] = text.split(".", 2);
  if (version !== VERSION || !body || !/^[A-Za-z0-9_-]+$/.test(body)) {
    return { ok: false, reason: "unreadable" };
  }
  let parsed: unknown;
  try {
    const bytes = await pipe(
      fromBase64Url(body),
      new DecompressionStream("deflate-raw"),
      MAX_UNPACKED_BYTES,
    );
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "unreadable" };
  const { t, l, d } = parsed as { t?: unknown; l?: unknown; d?: unknown };
  const layout = validateLayout(l);
  if (!layout.ok) {
    return { ok: false, reason: "invalid", detail: layout.issues[0]?.message ?? "Bad layout" };
  }
  const page: SharedPage = {
    title: typeof t === "string" && t.trim() ? t.trim().slice(0, MAX_TITLE) : "Shared page",
    layout: layout.layout,
  };
  if (d !== undefined) {
    const design = validateDesign(d);
    if (!design.ok) {
      return { ok: false, reason: "invalid", detail: design.issues[0]?.message ?? "Bad styles" };
    }
    page.design = design.design;
  }
  return { ok: true, page };
}
