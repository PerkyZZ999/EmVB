/**
 * S-05 (W-995): the site's own origin from its configuration (EmDash's site URL setting), never
 * from the request: the Host header is the caller's to choose. Undefined when none is set.
 */
export function trustedOrigin(siteUrl: unknown): string | undefined {
  if (typeof siteUrl !== "string" || !siteUrl) return undefined;
  try {
    const url = new URL(siteUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
