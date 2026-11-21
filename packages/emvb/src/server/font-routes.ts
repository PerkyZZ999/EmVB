import { pluginResponse, PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import {
  base64ToBytes,
  bytesToBase64,
  DEFAULT_GOOGLE_SUBSETS,
  FONT_FILE_LIMIT,
  FONT_ID,
  FONT_MAX_BYTES,
  fontFileId,
  fontFileProblem,
  fontFileUrl,
  GOOGLE_CSS_HOST,
  GOOGLE_FAMILY,
  GOOGLE_FILE_HOST,
  GOOGLE_FILES_PER_FACE,
  GOOGLE_SUBSET,
  GOOGLE_USER_AGENT,
  googleCssUrl,
  parseGoogleFontCss,
  pickGoogleFaces,
  type FontFace,
} from "../core/index.ts";

/**
 * Custom fonts (W-1072). EmDash's media library refuses `font/woff2` on 1.4 and 1.5, so font
 * files live in EmVB's plugin storage (as W-239 keeps uploaded SVG icons) and the public `font`
 * route serves them with their real type and a year-long immutable cache: a file's id is the hash
 * of its bytes, so a URL never changes what it serves.
 */

export type StoredFont = {
  name: string;
  size: number;
  /** The WOFF2 file, base64. */
  data: string;
  uploadedAt: string;
  source: "upload" | "google";
};

type FontStore = {
  get(id: string): Promise<StoredFont | null>;
  put(id: string, data: StoredFont): Promise<void>;
  exists(id: string): Promise<boolean>;
  count(): Promise<number>;
};

const store = (ctx: RouteContext<unknown>) => ctx.storage["fonts"] as unknown as FontStore;

/** A file name as a label: no folder, control characters or direction marks, at most 80. */
const fileLabel = (name: string) =>
  Array.from(name.replace(/^.*[\\/]/, ""), (ch) => (ch.charCodeAt(0) < 32 ? " " : ch))
    .join("")
    .replace(/[\u007F-\u009F​-‏‪-‮⁠⁦-⁩﻿]/g, "")
    .trim()
    .slice(0, 80) || "Font";

/** Stores a checked font file once (content-addressed) and answers its id and URL. */
async function storeFontFile(
  files: FontStore,
  bytes: Uint8Array,
  meta: { name: string; source: StoredFont["source"] },
): Promise<{ id: string; url: string; duplicate: boolean }> {
  const problem = fontFileProblem(bytes);
  if (problem) throw new PluginRouteError("INVALID_FONT", problem, 422);
  const id = await fontFileId(bytes);
  if (await files.exists(id)) return { id, url: fontFileUrl(id), duplicate: true };
  if ((await files.count()) >= FONT_FILE_LIMIT) {
    throw new PluginRouteError(
      "FONTS_FULL",
      `This site keeps up to ${FONT_FILE_LIMIT} font files.`,
      409,
    );
  }
  await files.put(id, {
    name: fileLabel(meta.name),
    size: bytes.byteLength,
    data: bytesToBase64(bytes),
    uploadedAt: new Date().toISOString(),
    source: meta.source,
  });
  return { id, url: fontFileUrl(id), duplicate: false };
}

const missing = () => new PluginRouteError("NOT_FOUND", "No such font.", 404);

/** Anyone: one stored font file, as `font/woff2`, cached for a year. */
export const fontRoute: PluginRoute = {
  public: true,
  methods: ["GET", "HEAD"],
  response: "raw",
  cacheControl: "public, max-age=31536000, immutable",
  handler: async (ctx) => {
    const id = (ctx.input as { id?: unknown } | undefined)?.id;
    if (typeof id !== "string" || !FONT_ID.test(id)) throw missing();
    const row = await store(ctx).get(id);
    const bytes = typeof row?.data === "string" ? base64ToBytes(row.data) : undefined;
    // A row written past the upload route is served only if it is still a real WOFF2.
    if (!bytes || fontFileProblem(bytes)) throw missing();
    return pluginResponse({
      status: 200,
      headers: { "content-type": "font/woff2", etag: `"${id}"` },
      body: { kind: "bytes", value: bytes },
    });
  },
};

const UploadInput = z.object({
  name: z.string().max(255),
  data: z
    .string()
    .min(1)
    .max(Math.ceil(FONT_MAX_BYTES / 3) * 4),
});

/** Editors and above: stores an uploaded WOFF2 after checking it again on the server. */
export const fontUploadRoute: PluginRoute<z.infer<typeof UploadInput>> = {
  permission: "content:edit_any",
  input: UploadInput,
  // The default JSON limit is 1 MiB; a 1 MiB font is about 1.4 MB as base64.
  request: { body: "json", maxBytes: 1_600_000 },
  handler: async (ctx) => {
    const bytes = base64ToBytes(ctx.input.data);
    if (!bytes) throw new PluginRouteError("INVALID_FONT", "The file didn't arrive whole.", 422);
    const file = await storeFontFile(store(ctx), bytes, {
      name: ctx.input.name,
      source: "upload",
    });
    return { file };
  },
};

const GoogleInput = z.object({
  family: z.string().regex(GOOGLE_FAMILY, "Type a Google Fonts family name, such as Open Sans"),
  weight: z.number().int().min(100).max(900).multipleOf(100),
  style: z.enum(["normal", "italic"]),
  subsets: z.array(z.string().regex(GOOGLE_SUBSET)).min(1).max(12).optional(),
});
type GoogleInput = z.infer<typeof GoogleInput>;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const CSS_MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 20_000;

/**
 * GET from Google's two font hosts only. Redirects are not followed (a redirect could leave
 * those hosts), and the body is read up to `maxBytes`.
 */
async function googleGet(fetcher: Fetch, url: string, maxBytes: number): Promise<Response> {
  const host = new URL(url).hostname;
  if (host !== GOOGLE_CSS_HOST && host !== GOOGLE_FILE_HOST) {
    throw new PluginRouteError("GOOGLE_FONTS", "Fonts are only downloaded from Google.", 502);
  }
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": GOOGLE_USER_AGENT, accept: "text/css,font/woff2,*/*;q=0.1" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // PluginRouteError's fourth argument is sent to the client, so the cause is set apart.
    const failed = new PluginRouteError(
      "GOOGLE_FONTS",
      "Couldn't reach Google Fonts. Try again.",
      502,
    );
    failed.cause = error;
    throw failed;
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new PluginRouteError("GOOGLE_FONTS", "Google Fonts sent a file that is too large.", 502);
  }
  return response;
}

/** The body, refused once it passes `maxBytes` (a missing or wrong Content-Length can't help). */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new PluginRouteError(
        "GOOGLE_FONTS",
        "Google Fonts sent a file that is too large.",
        502,
      );
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** Downloads one WOFF2 file from fonts.gstatic.com and stores it; answers its site URL. */
async function downloadGoogleFile(
  deps: { fetch: Fetch; files: FontStore },
  url: string,
  name: string,
): Promise<string> {
  const response = await googleGet(deps.fetch, url, FONT_MAX_BYTES);
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new PluginRouteError("GOOGLE_FONTS", "Google Fonts didn't send a font file.", 502);
  }
  const bytes = await readCapped(response, FONT_MAX_BYTES);
  return (await storeFontFile(deps.files, bytes, { name, source: "google" })).url;
}

/**
 * Downloads one family, weight and style from Google Fonts and stores its WOFF2 files like
 * uploads. Answers the faces, pointing at the site's own font route.
 */
export async function importGoogleFace(
  input: GoogleInput,
  deps: { fetch: Fetch; files: FontStore },
): Promise<{ family: string; faces: FontFace[] }> {
  const cssResponse = await googleGet(
    deps.fetch,
    googleCssUrl(input.family, input.weight, input.style),
    CSS_MAX_BYTES,
  );
  if (cssResponse.status === 400 || cssResponse.status === 404) {
    await cssResponse.body?.cancel();
    throw new PluginRouteError(
      "GOOGLE_FONT_UNKNOWN",
      `Google Fonts has no "${input.family}" in weight ${input.weight}${input.style === "italic" ? " italic" : ""}.`,
      404,
    );
  }
  const type = cssResponse.headers.get("content-type") ?? "";
  if (cssResponse.status !== 200 || !type.toLowerCase().startsWith("text/css")) {
    await cssResponse.body?.cancel();
    throw new PluginRouteError("GOOGLE_FONTS", "Google Fonts didn't answer. Try again.", 502);
  }
  const css = new TextDecoder().decode(await readCapped(cssResponse, CSS_MAX_BYTES));
  const picked = pickGoogleFaces(parseGoogleFontCss(css), {
    weight: input.weight,
    style: input.style,
    subsets: input.subsets ?? DEFAULT_GOOGLE_SUBSETS,
  });
  if (picked.length === 0) {
    throw new PluginRouteError(
      "GOOGLE_FONT_UNKNOWN",
      `Google Fonts has no WOFF2 file of "${input.family}" for these subsets.`,
      404,
    );
  }
  if (picked.length > GOOGLE_FILES_PER_FACE) {
    throw new PluginRouteError(
      "GOOGLE_FONTS",
      `"${input.family}" comes in ${picked.length} files per weight. Pick fewer subsets.`,
      422,
    );
  }
  const stored = new Map<string, string>();
  const faces: FontFace[] = [];
  for (const face of picked) {
    let src = stored.get(face.url);
    if (!src) {
      const name = `${input.family} ${input.weight}${input.style === "italic" ? " italic" : ""}${face.subset ? ` ${face.subset}` : ""}.woff2`;
      // oxlint-disable-next-line no-await-in-loop -- one download at a time keeps memory low
      src = await downloadGoogleFile(deps, face.url, name);
      stored.set(face.url, src);
    }
    faces.push({
      weight: face.weight,
      style: face.style,
      src,
      ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
    });
  }
  return { family: input.family, faces };
}

/** Editors and above: self-hosts one weight and style of a Google font. */
export const fontGoogleRoute: PluginRoute<GoogleInput> = {
  permission: "content:edit_any",
  input: GoogleInput,
  handler: async (ctx) =>
    importGoogleFace(ctx.input, {
      fetch: (url, init) => globalThis.fetch(url, init),
      files: store(ctx),
    }),
};
