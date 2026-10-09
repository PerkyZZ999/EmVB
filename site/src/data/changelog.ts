/** One release heading of CHANGELOG.md ("[0.2.1] - 2026-10-08", "[Unreleased]"), split for the version list (W-322). */
export function releaseLabel(text: string): { version: string; date?: string } {
  const trimmed = text.trim();
  const match = /^\[?([^\]\s]+)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/.exec(trimmed);
  const version = match?.[1] ?? trimmed;
  const date = match?.[2];
  return date ? { version, date } : { version };
}
