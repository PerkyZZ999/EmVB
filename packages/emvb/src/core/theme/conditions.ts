import { z } from "zod";
import { type ContentThemePartType, type ThemePartType } from "./part-types.ts";

export const CONDITIONS_SCHEMA_VERSION = 1;
export const MAX_CONDITION_RULES = 20;

const ConditionArgs = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

const ConditionRuleSchema = z.strictObject({
  id: z.string().min(1).max(64),
  op: z.enum(["include", "exclude"]),
  group: z.enum(["general", "singular", "archive"]),
  name: z.string().min(1).max(40),
  args: ConditionArgs.default({}),
});

const ConditionsDocSchema = z.strictObject({
  schemaVersion: z.literal(CONDITIONS_SCHEMA_VERSION),
  rules: z.array(ConditionRuleSchema).max(MAX_CONDITION_RULES),
});

export type ConditionRule = z.infer<typeof ConditionRuleSchema>;
export type ConditionsDoc = z.infer<typeof ConditionsDocSchema>;

export type ThemeRequestContext = {
  path: string;
  isFront: boolean;
  is404: boolean;
  isSearch: boolean;
  kind: "singular" | "archive" | "other";
  collection?: string;
  entryId?: string;
  taxonomy?: { type: "category" | "tag"; slug: string };
};

/** Entire Site include with a stable default id — used when creating a theme part. */
export const defaultConditions = (): ConditionsDoc => ({
  schemaVersion: CONDITIONS_SCHEMA_VERSION,
  rules: [
    {
      id: "default-entire-site",
      op: "include",
      group: "general",
      name: "entire_site",
      args: {},
    },
  ],
});

export type ConditionsValidation =
  | { ok: true; conditions: ConditionsDoc }
  | { ok: false; issues: { path: string; code: string; message: string }[] };

export function validateConditions(raw: unknown): ConditionsValidation {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return {
        ok: false,
        issues: [{ path: "conditions", code: "invalid_json", message: "Conditions must be JSON." }],
      };
    }
  }
  const parsed = ConditionsDocSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.length ? `conditions.${issue.path.join(".")}` : "conditions",
        code: issue.code,
        message: issue.message,
      })),
    };
  }
  for (const [i, rule] of parsed.data.rules.entries()) {
    const vocab = vocabularyIssue(rule);
    if (vocab) {
      return {
        ok: false,
        issues: [{ path: `conditions.rules[${i}]`, code: "unknown_condition", message: vocab }],
      };
    }
  }
  return { ok: true, conditions: parsed.data };
}

function vocabularyIssue(rule: ConditionRule): string | null {
  const key = `${rule.group}:${rule.name}`;
  const known = KNOWN_CONDITIONS[key];
  if (!known) {
    return `Unknown condition ${rule.group}/${rule.name}.`;
  }
  for (const required of known.requiredArgs) {
    if (typeof rule.args[required] !== "string" || !rule.args[required]) {
      return `Condition ${rule.group}/${rule.name} requires args.${required}.`;
    }
  }
  return null;
}

type Known = { requiredArgs: readonly string[]; specificity: number };

/**
 * Specificity (higher wins): entry > taxonomy+slug > collection > front/404/search >
 * singular/archive all > entire_site.
 */
const KNOWN_CONDITIONS: Record<string, Known> = {
  "general:entire_site": { requiredArgs: [], specificity: 1 },
  "singular:all": { requiredArgs: [], specificity: 10 },
  "singular:front": { requiredArgs: [], specificity: 20 },
  "singular:not_found": { requiredArgs: [], specificity: 20 },
  "singular:collection": { requiredArgs: ["collection"], specificity: 30 },
  "singular:entry": { requiredArgs: ["collection", "id"], specificity: 50 },
  "archive:all": { requiredArgs: [], specificity: 10 },
  "archive:collection": { requiredArgs: ["collection"], specificity: 30 },
  "archive:taxonomy": { requiredArgs: ["taxonomy"], specificity: 35 },
  "archive:search": { requiredArgs: [], specificity: 20 },
};

export function conditionSpecificity(rule: ConditionRule): number {
  const known = KNOWN_CONDITIONS[`${rule.group}:${rule.name}`];
  if (!known) return 0;
  let score = known.specificity;
  // taxonomy with a concrete slug is more specific than taxonomy type alone
  if (
    rule.group === "archive" &&
    rule.name === "taxonomy" &&
    typeof rule.args["slug"] === "string"
  ) {
    score += 5;
  }
  return score;
}

/** Highest include-rule specificity among matching includes (0 if none). */
export function conditionsSpecificity(doc: ConditionsDoc, ctx: ThemeRequestContext): number {
  if (!matchesConditions(doc, ctx)) return 0;
  let best = 0;
  for (const rule of doc.rules) {
    if (rule.op !== "include") continue;
    if (!ruleMatches(rule, ctx)) continue;
    best = Math.max(best, conditionSpecificity(rule));
  }
  return best;
}

/**
 * A part matches when any include rule matches AND no exclude rule matches.
 * Unknown condition names fail closed (never match) on the public side.
 */
export function matchesConditions(doc: ConditionsDoc, ctx: ThemeRequestContext): boolean {
  let included = false;
  for (const rule of doc.rules) {
    if (!ruleMatches(rule, ctx)) continue;
    if (rule.op === "exclude") return false;
    included = true;
  }
  return included;
}

function ruleMatches(rule: ConditionRule, ctx: ThemeRequestContext): boolean {
  if (!KNOWN_CONDITIONS[`${rule.group}:${rule.name}`]) return false;
  switch (`${rule.group}:${rule.name}`) {
    case "general:entire_site":
      return true;
    case "singular:all":
      return ctx.kind === "singular";
    case "singular:front":
      return ctx.isFront;
    case "singular:not_found":
      return ctx.is404;
    case "singular:collection":
      return (
        ctx.kind === "singular" &&
        typeof rule.args["collection"] === "string" &&
        ctx.collection === rule.args["collection"]
      );
    case "singular:entry":
      return (
        ctx.kind === "singular" &&
        typeof rule.args["collection"] === "string" &&
        typeof rule.args["id"] === "string" &&
        ctx.collection === rule.args["collection"] &&
        ctx.entryId === rule.args["id"]
      );
    case "archive:all":
      return ctx.kind === "archive";
    case "archive:collection":
      return (
        ctx.kind === "archive" &&
        typeof rule.args["collection"] === "string" &&
        ctx.collection === rule.args["collection"]
      );
    case "archive:taxonomy": {
      if (ctx.kind !== "archive" || !ctx.taxonomy) return false;
      if (rule.args["taxonomy"] !== ctx.taxonomy.type) return false;
      const slug = rule.args["slug"];
      if (typeof slug === "string" && slug) return ctx.taxonomy.slug === slug;
      return true;
    }
    case "archive:search":
      return ctx.isSearch;
    default:
      return false;
  }
}

/**
 * Location gate for a part type (Elementor-like theme locations).
 * Headers/footers always compete; content types only on their route class.
 * Single Page targets EmDash `pages` singular only (not posts, not emvb_pages).
 */
export function themePartLocationApplies(
  partType: ThemePartType,
  ctx: ThemeRequestContext,
): boolean {
  switch (partType) {
    case "header":
    case "footer":
      return true;
    case "error_404":
      return ctx.is404;
    case "search_results":
      return ctx.isSearch;
    case "single_page":
      // Front page is a separate singular location (not Single Page).
      return !ctx.isFront && ctx.kind === "singular" && ctx.collection === "pages";
    case "single_post":
      return !ctx.isFront && ctx.kind === "singular" && ctx.collection === "posts";
    case "archive":
      // Posts index + category/tag archives (not search — that is search_results).
      return ctx.kind === "archive" && !ctx.isSearch;
    case "loop_item":
      // Reusable item template; never selected as a page location.
      return false;
  }
}

/** Default Include rule(s) when creating a part of this type. */
export function defaultConditionsFor(partType: ThemePartType): ConditionsDoc {
  switch (partType) {
    case "error_404":
      return {
        schemaVersion: CONDITIONS_SCHEMA_VERSION,
        rules: [
          {
            id: "default-404",
            op: "include",
            group: "singular",
            name: "not_found",
            args: {},
          },
        ],
      };
    case "search_results":
      return {
        schemaVersion: CONDITIONS_SCHEMA_VERSION,
        rules: [
          {
            id: "default-search",
            op: "include",
            group: "archive",
            name: "search",
            args: {},
          },
        ],
      };
    case "single_page":
      return {
        schemaVersion: CONDITIONS_SCHEMA_VERSION,
        rules: [
          {
            id: "default-pages",
            op: "include",
            group: "singular",
            name: "collection",
            args: { collection: "pages" },
          },
        ],
      };
    case "single_post":
      return {
        schemaVersion: CONDITIONS_SCHEMA_VERSION,
        rules: [
          {
            id: "default-posts",
            op: "include",
            group: "singular",
            name: "collection",
            args: { collection: "posts" },
          },
        ],
      };
    case "archive":
      return {
        schemaVersion: CONDITIONS_SCHEMA_VERSION,
        rules: [
          {
            id: "default-posts-archive",
            op: "include",
            group: "archive",
            name: "collection",
            args: { collection: "posts" },
          },
        ],
      };
    case "loop_item":
      // Not location-gated; conditions unused for public selection.
      return defaultConditions();
    case "header":
    case "footer":
      return defaultConditions();
  }
}

/**
 * Which content-template type (if any) should compete for this request's main body.
 * Mutual exclusivity: 404 > search > single_post > single_page > archive.
 */
export function contentPartTypeForContext(ctx: ThemeRequestContext): ContentThemePartType | null {
  if (ctx.is404) return "error_404";
  if (ctx.isSearch) return "search_results";
  if (!ctx.isFront && ctx.kind === "singular" && ctx.collection === "posts") {
    return "single_post";
  }
  if (!ctx.isFront && ctx.kind === "singular" && ctx.collection === "pages") {
    return "single_page";
  }
  if (ctx.kind === "archive" && !ctx.isSearch) {
    return "archive";
  }
  return null;
}

export type ThemePartCandidate = {
  id: string;
  partType: ThemePartType;
  conditions: ConditionsDoc;
  updatedAt: string;
};

/**
 * Among matching candidates of one type, pick the highest specificity; ties break by
 * `updatedAt` descending (ISO timestamps). Content types are also gated by location
 * so a Single Page never wins on a post route, etc.
 */
export function pickThemePartWinner(
  candidates: readonly ThemePartCandidate[],
  partType: ThemePartType,
  ctx: ThemeRequestContext,
): ThemePartCandidate | null {
  let winner: ThemePartCandidate | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    if (candidate.partType !== partType) continue;
    if (!themePartLocationApplies(candidate.partType, ctx)) continue;
    if (!matchesConditions(candidate.conditions, ctx)) continue;
    const score = conditionsSpecificity(candidate.conditions, ctx);
    if (
      score > bestScore ||
      (score === bestScore && winner !== null && candidate.updatedAt > winner.updatedAt) ||
      (score === bestScore && winner === null)
    ) {
      bestScore = score;
      winner = candidate;
    }
  }
  return winner;
}
