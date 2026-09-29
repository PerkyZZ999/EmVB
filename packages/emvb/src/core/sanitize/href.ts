/**
 * Allowed public hrefs (R-032): http(s), mailto, tel, and relative paths/queries/hashes.
 * Schemes such as javascript:, data:, and vbscript: are refused, including case and whitespace tricks.
 */
export function sanitizeHref(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return undefined;
  // No HTML metacharacters or control chars in any href.
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || "<>\"'`".includes(ch)) return undefined;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (!hasScheme) {
    // Browsers resolve `//host` and `/\host` to another site; EmDash 1.0 refuses them for `url` fields too.
    if (/^\/[/\\]/.test(trimmed)) return undefined;
    // Relative: /path, ./path, ../path, ?query, #hash, or bare path segment
    if (/^(?:[/?#.]|[A-Za-z0-9._~-])/.test(trimmed)) return trimmed;
    return undefined;
  }

  const withoutSpace = trimmed.replace(/\s+/g, "");
  let parsed: URL;
  try {
    parsed = new URL(withoutSpace);
  } catch {
    return undefined;
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme === "http:" || scheme === "https:" || scheme === "mailto:" || scheme === "tel:") {
    return trimmed;
  }
  return undefined;
}
