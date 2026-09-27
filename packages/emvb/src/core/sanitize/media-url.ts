/**
 * Allowed image/media `src` values (R-032): http(s) and same-origin relative paths.
 * javascript:, data:, and other schemes are refused (including case/whitespace tricks).
 */
export function sanitizeMediaUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return undefined;
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || "<>\"'`".includes(ch)) return undefined;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (!hasScheme) {
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
  if (scheme === "http:" || scheme === "https:") return trimmed;
  return undefined;
}
