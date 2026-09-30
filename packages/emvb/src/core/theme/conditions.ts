import { z } from "zod";
import { parseDoc } from "./parse-doc.ts";
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
  const parsed = parseDoc(raw, ConditionsDocSchema, "conditions", "Conditions");
  if (!parsed.ok) return parsed;
  for (const [i, rule] of parsed.doc.rules.entries()) {
    const vocab = vocabularyIssue(rule);
    if (vocab) {
      return {
        ok: false,
        issues: [{ path: `conditions.rules[${i}]`, code: "unknown_condition", message: vocab }],
      };
    }
  }
  return { ok: true, conditions: parsed.doc };
}

function vocabularyIssue(rule: ConditionRule): string | null {
  const condition = known(rule);
  if (!condition) return `Unknown condition ${rule.group}/${rule.name}.`;
  for (const required of condition.requiredArgs) {
    if (typeof rule.args[required] !== "string" || !rule.args[required]) {
      return `Condition ${rule.group}/${rule.name} requires args.${required}.`;
    }
  }
  return null;
}

type Args = ConditionRule["args"];
type Known = {
  requiredArgs: readonly string[];
  specificity: number;
  matches: (ctx: ThemeRequestContext, args: Args) => boolean;
};

/** True when `args[key]` is a string equal to `actual`. */
const argIs = (args: Args, key: string, actual: string | undefined) =>
  typeof args[key] === "string" && actual === args[key];

function taxonomyMatches(ctx: ThemeRequestContext, args: Args): boolean {
  if (ctx.kind !== "archive" || !ctx.taxonomy) return false;
  if (args["taxonomy"] !== ctx.taxonomy.type) return false;
  const slug = args["slug"];
  if (typeof slug === "string" && slug) return ctx.taxonomy.slug === slug;
  return true;
}

/**
 * Each condition's required args, specificity and matcher. Specificity (higher wins):
 * entry > taxonomy+slug > collection > front/404/search > singular/archive all > entire_site.
 */
const KNOWN_CONDITIONS: Record<string, Known> = {
  "general:entire_site": { requiredArgs: [], specificity: 1, matches: () => true },
  "singular:all": { requiredArgs: [], specificity: 10, matches: (ctx) => ctx.kind === "singular" },
  "singular:front": { requiredArgs: [], specificity: 20, matches: (ctx) => ctx.isFront },
  "singular:not_found": { requiredArgs: [], specificity: 20, matches: (ctx) => ctx.is404 },
  "singular:collection": {
    requiredArgs: ["collection"],
    specificity: 30,
    matches: (ctx, args) => ctx.kind === "singular" && argIs(args, "collection", ctx.collection),
  },
  "singular:entry": {
    requiredArgs: ["collection", "id"],
    specificity: 50,
    matches: (ctx, args) =>
      ctx.kind === "singular" &&
      argIs(args, "collection", ctx.collection) &&
      argIs(args, "id", ctx.entryId),
  },
  "archive:all": { requiredArgs: [], specificity: 10, matches: (ctx) => ctx.kind === "archive" },
  "archive:collection": {
    requiredArgs: ["collection"],
    specificity: 30,
    matches: (ctx, args) => ctx.kind === "archive" && argIs(args, "collection", ctx.collection),
  },
  "archive:taxonomy": { requiredArgs: ["taxonomy"], specificity: 35, matches: taxonomyMatches },
  "archive:search": { requiredArgs: [], specificity: 20, matches: (ctx) => ctx.isSearch },
};

const known = (rule: ConditionRule): Known | undefined =>
  KNOWN_CONDITIONS[`${rule.group}:${rule.name}`];

export function conditionSpecificity(rule: ConditionRule): number {
  const condition = known(rule);
  if (!condition) return 0;
  let score = condition.specificity;
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
  return known(rule)?.matches(ctx, rule.args) ?? false;
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
    case "popup":
      // Overlays compete on every route; conditions decide (S7b).
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

/** The single Include rule a new content part starts with; other types start on Entire Site. */
const DEFAULT_RULES: Partial<Record<ThemePartType, Omit<ConditionRule, "op">>> = {
  error_404: { id: "default-404", group: "singular", name: "not_found", args: {} },
  search_results: { id: "default-search", group: "archive", name: "search", args: {} },
  single_page: {
    id: "default-pages",
    group: "singular",
    name: "collection",
    args: { collection: "pages" },
  },
  single_post: {
    id: "default-posts",
    group: "singular",
    name: "collection",
    args: { collection: "posts" },
  },
  // Posts index + category/tag (location gate already excludes search).
  archive: { id: "default-archive-all", group: "archive", name: "all", args: {} },
};

/** Default Include rule(s) when creating a part of this type. */
export function defaultConditionsFor(partType: ThemePartType): ConditionsDoc {
  const rule = DEFAULT_RULES[partType];
  if (!rule) return defaultConditions();
  const { id, ...rest } = rule;
  return { schemaVersion: CONDITIONS_SCHEMA_VERSION, rules: [{ id, op: "include", ...rest }] };
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

/** Candidates of one type whose location applies and whose conditions match. */
const matching = (
  candidates: readonly ThemePartCandidate[],
  partType: ThemePartType,
  ctx: ThemeRequestContext,
) =>
  candidates.filter(
    (candidate) =>
      candidate.partType === partType &&
      themePartLocationApplies(candidate.partType, ctx) &&
      matchesConditions(candidate.conditions, ctx),
  );

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
  for (const candidate of matching(candidates, partType, ctx)) {
    const score = conditionsSpecificity(candidate.conditions, ctx);
    if (
      score > bestScore ||
      (score === bestScore && winner !== null && candidate.updatedAt > winner.updatedAt)
    ) {
      bestScore = score;
      winner = candidate;
    }
  }
  return winner;
}

/**
 * All candidates of one type that match location + conditions (S7b popups).
 * Sorted by updatedAt descending so newest configs win for equal conditions.
 */
export function listMatchingThemeParts(
  candidates: readonly ThemePartCandidate[],
  partType: ThemePartType,
  ctx: ThemeRequestContext,
): ThemePartCandidate[] {
  return matching(candidates, partType, ctx).toSorted((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
  );
}
