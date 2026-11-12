/** S-03: at most this many issues come back from one validation. */
const MAX_REPORTED_ISSUES = 50;

type Issue = { path: string; code: string; message: string };

/**
 * The first issues, mapped, then one "…and N more" in place of the rest, so a document full of
 * bad items can't make a response, a log line or the editor's list grow with it.
 */
export function capIssues<I>(
  issues: readonly I[],
  map: (issue: I) => Issue,
  path: string,
): Issue[] {
  if (issues.length <= MAX_REPORTED_ISSUES) return issues.map(map);
  const kept = issues.slice(0, MAX_REPORTED_ISSUES - 1).map(map);
  const more = issues.length - kept.length;
  return [...kept, { path, code: "too_many_issues", message: `…and ${more} more problems.` }];
}
