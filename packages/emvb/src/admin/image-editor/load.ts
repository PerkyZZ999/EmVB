/**
 * Where the image editor reads its picture from (W-482). Re-opening an edited image starts from
 * the untouched original (`edit.originalSrc`), never from the edited file. Only same-origin
 * pictures can be edited: the admin CSP blocks other origins (`connect-src 'self'`) and a
 * cross-origin image would taint the canvas. SVG and GIF are refused (plan: no vector or
 * animation editing).
 */

export type EditableSource =
  | { ok: true; url: string; name: string; fromOriginal: boolean }
  | { ok: false; reason: "empty" | "external" | "format"; message: string };

export type LoadedSource =
  | {
      ok: true;
      blob: Blob;
      name: string;
      type: string;
      fromOriginal: boolean;
      /** W-493: the recorded original is gone (404), so this is the edited copy, edited afresh. */
      originalMissing?: boolean;
      /** W-496: the picture was larger than the GPU can edit and was scaled down from this. */
      reducedFrom?: { width: number; height: number };
    }
  | { ok: false; reason: "empty" | "external" | "format" | "network"; message: string };

const REFUSED_TYPES = /^image\/(svg\+xml|gif)$/i;
const REFUSED_EXT = /\.(svgz?|gif)$/i;

const MESSAGES = {
  empty: "Choose a picture first, then edit it.",
  external:
    "This picture is on another website, so it can't be edited here. Upload a copy to the media library to edit it.",
  format: "SVG and GIF pictures can't be edited. Use a JPEG, PNG, WebP or AVIF picture.",
  network: "Couldn't load the picture. Check your connection and try again.",
} as const;

function fileNameOf(pathname: string): string {
  const last = pathname.split("/").findLast(Boolean) ?? "";
  try {
    return decodeURIComponent(last) || "image";
  } catch {
    return last || "image";
  }
}

/** Decides what to load for an image element's props, without fetching anything. */
export function editableSource(props: Record<string, unknown>, origin: string): EditableSource {
  const edit = props.edit as { originalSrc?: unknown } | undefined;
  const original = typeof edit?.originalSrc === "string" ? edit.originalSrc.trim() : "";
  const current = typeof props.src === "string" ? props.src.trim() : "";
  const raw = original || current;
  if (!raw) return { ok: false, reason: "empty", message: MESSAGES.empty };
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return { ok: false, reason: "external", message: MESSAGES.external };
  }
  if (url.origin !== new URL(origin).origin || !/^https?:$/.test(url.protocol)) {
    return { ok: false, reason: "external", message: MESSAGES.external };
  }
  if (REFUSED_EXT.test(url.pathname)) {
    return { ok: false, reason: "format", message: MESSAGES.format };
  }
  return {
    ok: true,
    url: `${url.pathname}${url.search}`,
    name: fileNameOf(url.pathname),
    fromOriginal: Boolean(original),
  };
}

/** Fetches the picture as a Blob; the type check repeats on the real Content-Type. */
export async function loadEditableSource(
  props: Record<string, unknown>,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedSource> {
  const source = editableSource(props, origin);
  if (!source.ok) return source;
  let response: Response;
  try {
    response = await fetchImpl(source.url, { credentials: "same-origin" });
  } catch {
    return { ok: false, reason: "network", message: MESSAGES.network };
  }
  if (response.status === 404 && source.fromOriginal) {
    // W-493: the original was deleted; edit the copy the element shows instead.
    const { edit: _gone, ...current } = props;
    const copy = await loadEditableSource(current, origin, fetchImpl);
    return copy.ok ? { ...copy, originalMissing: true } : copy;
  }
  if (!response.ok) return { ok: false, reason: "network", message: MESSAGES.network };
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    return { ok: false, reason: "network", message: MESSAGES.network };
  }
  const type =
    // W-592: MIME types are case-insensitive ("IMAGE/JPEG" is a JPEG).
    (response.headers.get("content-type") ?? blob.type ?? "").split(";")[0]?.trim().toLowerCase() ??
    "";
  if (REFUSED_TYPES.test(type)) return { ok: false, reason: "format", message: MESSAGES.format };
  if (type && !type.startsWith("image/")) {
    return { ok: false, reason: "network", message: MESSAGES.network };
  }
  return {
    ok: true,
    blob,
    name: source.name,
    type: type || blob.type,
    fromOriginal: source.fromOriginal,
  };
}
