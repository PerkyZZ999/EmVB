import { sanitizeUrl } from "./url.ts";

const MEDIA_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

/** Allowed image and media `src` values (R-032): http(s) and same-origin relative paths. */
export const sanitizeMediaUrl = (value: string): string | undefined =>
  sanitizeUrl(value, MEDIA_SCHEMES);
