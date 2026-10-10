/** One release heading of CHANGELOG.md ("[0.2.1] - 2026-10-08", "[Unreleased]"), split for the version list (W-322). */
export function releaseLabel(text: string): { version: string; date?: string } {
  const trimmed = text.trim();
  const match = /^\[?([^\]\s]+)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/.exec(trimmed);
  const version = match?.[1] ?? trimmed;
  const date = match?.[2];
  return date ? { version, date } : { version };
}

/**
 * The release headings (depth 2) that have entries: a release with no section (depth 3) before the
 * next release, such as an empty "Unreleased", is left out of the version list (W-324).
 */
export function releasesWithEntries<T extends { depth: number }>(headings: readonly T[]): T[] {
  const out: T[] = [];
  headings.forEach((heading, i) => {
    if (heading.depth !== 2) return;
    const next = headings.slice(i + 1).find((h) => h.depth <= 3);
    if (next && next.depth === 3) out.push(heading);
  });
  return out;
}
