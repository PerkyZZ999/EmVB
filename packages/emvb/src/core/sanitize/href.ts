import { sanitizeUrl } from "./url.ts";

const HREF_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Allowed public hrefs (R-032): http(s), mailto, tel, and relative paths, queries and hashes. */
export const sanitizeHref = (value: string): string | undefined => sanitizeUrl(value, HREF_SCHEMES);
