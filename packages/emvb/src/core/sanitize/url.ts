/**
 * The shared URL check behind hrefs and media sources (R-032): a URL with one of `schemes`, or a
 * same-site relative one. Other schemes (javascript:, data:, vbscript:…) are refused, including
 * case and whitespace tricks.
 */
export function sanitizeUrl(value: string, schemes: ReadonlySet<string>): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return undefined;
  // No HTML metacharacters or control chars in any URL.
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

  let parsed: URL;
  try {
    parsed = new URL(trimmed.replace(/\s+/g, ""));
  } catch {
    return undefined;
  }
  return schemes.has(parsed.protocol.toLowerCase()) ? trimmed : undefined;
}
