import type { z } from "zod";
import { MAX_DEPTH, MAX_DESIGN_BYTES, MAX_LAYOUT_BYTES, MAX_NODES } from "./limits.ts";
import {
  upgradeLayout,
  type Migration,
  type UpgradeResult,
  LAYOUT_MIGRATIONS,
} from "./migrate/index.ts";
import { DESIGN_SCHEMA_VERSION, DesignSystem } from "./schema/design.ts";
import { Layout, LAYOUT_SCHEMA_VERSION } from "./schema/layout.ts";

export type LayoutIssue = { path: string; code: string; message: string };
export type LayoutValidation =
  | { ok: true; layout: Layout; upgradedFrom: number }
  | { ok: false; issues: LayoutIssue[] };

/** A short, user-facing summary of the first few issues, with their paths. */
export function summarizeIssues(issues: readonly LayoutIssue[], max = 3): string {
  return issues
    .slice(0, max)
    .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message))
    .join("; ");
}

export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, key) => {
    if (typeof key === "number") return `${out}[${key}]`;
    return out ? `${out}.${String(key)}` : String(key);
  }, "");
}

/** Iterative walk of the raw input, so absurd nesting can't overflow the stack in the schema parser. */
function checkStructure(root: unknown): LayoutIssue | undefined {
  const stack: { node: unknown; depth: number; path: string }[] = [
    { node: root, depth: 1, path: "root" },
  ];
  let count = 0;
  while (stack.length > 0) {
    const { node, depth, path } = stack.pop() as { node: unknown; depth: number; path: string };
    count++;
    if (count > MAX_NODES) {
      return {
        path: "root",
        code: "too_many_nodes",
        message: `A page can have at most ${MAX_NODES} elements.`,
      };
    }
    if (depth > MAX_DEPTH) {
      return {
        path,
        code: "too_deep",
        message: `Elements can be nested at most ${MAX_DEPTH} levels deep.`,
      };
    }
    const children = (node as { children?: unknown } | null)?.children;
    if (Array.isArray(children)) {
      children.forEach((child, i) =>
        stack.push({ node: child, depth: depth + 1, path: `${path}.children[${i}]` }),
      );
    }
  }
  return undefined;
}

function duplicateIds(layout: Layout): LayoutIssue[] {
  const seen = new Set<string>();
  const htmlIds = new Set<string>();
  const issues: LayoutIssue[] = [];
  const walk = (node: Layout["root"] | Layout["root"]["children"][number], path: string) => {
    if (seen.has(node.id)) {
      issues.push({
        path: `${path}.id`,
        code: "duplicate_id",
        message: `The id "${node.id}" is used more than once.`,
      });
    }
    seen.add(node.id);
    if (node.htmlId) {
      if (htmlIds.has(node.htmlId)) {
        issues.push({
          path: `${path}.htmlId`,
          code: "duplicate_html_id",
          message: `The CSS id "${node.htmlId}" is used more than once on this page.`,
        });
      }
      htmlIds.add(node.htmlId);
    }
    const kids = "children" in node && Array.isArray(node.children) ? node.children : [];
    kids.forEach((child, i) =>
      walk(child as Layout["root"]["children"][number], `${path}.children[${i}]`),
    );
  };
  walk(layout.root, "root");
  return issues;
}

function checkSize(input: unknown, limit: number, what: string): LayoutIssue | undefined {
  let bytes: number;
  try {
    bytes = byteLength(input);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      path: "",
      code: "too_deep",
      message: `Elements can be nested at most ${MAX_DEPTH} levels deep.`,
    };
  }
  if (bytes <= limit) return undefined;
  return {
    path: "",
    code: "too_large",
    message: `The ${what} is ${bytes} bytes; the limit is ${limit}.`,
  };
}

function upgradeIssue(upgraded: Extract<UpgradeResult, { ok: false }>): LayoutIssue {
  const messages: Record<typeof upgraded.reason, string> = {
    "not-an-object": "The document must be an object.",
    "missing-version": "The document has no valid schemaVersion.",
    "newer-version": `This was saved by a newer EmVB (schema ${upgraded.version}). Update EmVB to edit it.`,
    "no-migration": `No migration exists from schema ${upgraded.version}.`,
  };
  return { path: "schemaVersion", code: upgraded.reason, message: messages[upgraded.reason] };
}

export type DesignValidation =
  | { ok: true; design: DesignSystem; upgradedFrom: number }
  | { ok: false; issues: LayoutIssue[] };

/** Server-side check for the design document (D-013, N-005): 256 KiB budget, version, schema. */
export function validateDesign(
  input: unknown,
  migrations: Readonly<Record<number, Migration>> = {},
): DesignValidation {
  const sizeIssue = checkSize(input, MAX_DESIGN_BYTES, "design system");
  if (sizeIssue) return { ok: false, issues: [sizeIssue] };
  const upgraded = upgradeLayout(input, migrations, DESIGN_SCHEMA_VERSION);
  if (!upgraded.ok) return { ok: false, issues: [upgradeIssue(upgraded)] };
  const parsed = DesignSystem.safeParse(upgraded.doc);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(toIssue) };
  return { ok: true, design: parsed.data, upgradedFrom: upgraded.from };
}

/**
 * Full server-side check for a stored layout (R-010, N-005): size budget, structure limits,
 * version upgrade, schema, and id uniqueness. Returns path-specific issues.
 */
export function validateLayout(
  input: unknown,
  migrations: Readonly<Record<number, Migration>> = LAYOUT_MIGRATIONS,
): LayoutValidation {
  const sizeIssue = checkSize(input, MAX_LAYOUT_BYTES, "page");
  if (sizeIssue) return { ok: false, issues: [sizeIssue] };
  const upgraded = upgradeLayout(input, migrations, LAYOUT_SCHEMA_VERSION);
  if (!upgraded.ok) return { ok: false, issues: [upgradeIssue(upgraded)] };
  const structure = checkStructure(upgraded.doc["root"]);
  if (structure) return { ok: false, issues: [structure] };
  const parsed = Layout.safeParse(upgraded.doc);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue: z.core.$ZodIssue) => toIssue(issue)),
    };
  }
  const layout = parsed.data as Layout;
  const dupes = duplicateIds(layout);
  if (dupes.length > 0) return { ok: false, issues: dupes };
  return { ok: true, layout, upgradedFrom: upgraded.from };
}

function toIssue(issue: z.core.$ZodIssue): LayoutIssue {
  // LayoutNode's transform re-emits known-schema failures as `custom` with the original code
  // in params.zodCode so path-specific messages stay intact (W-022).
  const params =
    "params" in issue ? (issue.params as { zodCode?: unknown } | undefined) : undefined;
  const code =
    issue.code === "custom" && typeof params?.zodCode === "string" ? params.zodCode : issue.code;
  return { path: formatPath(issue.path), code, message: issue.message };
}
