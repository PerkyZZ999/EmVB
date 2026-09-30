import type { z } from "zod";

export type DocIssue = { path: string; code: string; message: string };

/**
 * Parses a stored JSON document (a string or an already-parsed value) with `schema`. Issue paths
 * start at `root`; unparseable JSON is one `invalid_json` issue saying "`label` must be JSON."
 */
export function parseDoc<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  root: string,
  label: string,
): { ok: true; doc: T } | { ok: false; issues: DocIssue[] } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return {
        ok: false,
        issues: [{ path: root, code: "invalid_json", message: `${label} must be JSON.` }],
      };
    }
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, doc: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.length ? `${root}.${issue.path.join(".")}` : root,
      code: issue.code,
      message: issue.message,
    })),
  };
}
