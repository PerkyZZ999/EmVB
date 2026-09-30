import {
  conditionSpecificity,
  conditionsSpecificity,
  contentPartTypeForContext,
  defaultConditionsFor,
  listMatchingThemeParts,
  matchesConditions,
  pickThemePartWinner,
  themePartLocationApplies,
  validateConditions,
  type ConditionRule,
  type ThemePartCandidate,
  type ThemeRequestContext,
} from "../../src/core/theme/conditions.ts";
import { THEME_PART_TYPES } from "../../src/core/theme/part-types.ts";

const base = { path: "/x", isFront: false, is404: false, isSearch: false } as const;
const CONTEXTS: Record<string, ThemeRequestContext> = {
  front: { ...base, path: "/", isFront: true, kind: "singular" },
  frontPage: {
    ...base,
    path: "/",
    isFront: true,
    kind: "singular",
    collection: "pages",
    entryId: "home",
  },
  notFound: { ...base, is404: true, kind: "other" },
  search: { ...base, isSearch: true, kind: "archive" },
  page: { ...base, kind: "singular", collection: "pages" },
  pageEntry: { ...base, kind: "singular", collection: "pages", entryId: "p1" },
  post: { ...base, kind: "singular", collection: "posts", entryId: "01POST" },
  otherPost: { ...base, kind: "singular", collection: "posts", entryId: "02POST" },
  postsArchive: { ...base, kind: "archive", collection: "posts" },
  category: { ...base, kind: "archive", taxonomy: { type: "category", slug: "news" } },
  otherCategory: { ...base, kind: "archive", taxonomy: { type: "category", slug: "sport" } },
  tag: { ...base, kind: "archive", taxonomy: { type: "tag", slug: "news" } },
  other: { ...base, kind: "other" },
  singularNoCollection: { ...base, kind: "singular" },
};

const rule = (group: ConditionRule["group"], name: string, args: ConditionRule["args"] = {}) =>
  ({
    id: `${group}-${name}-${JSON.stringify(args)}`,
    op: "include",
    group,
    name,
    args,
  }) as ConditionRule;

const RULES: ConditionRule[] = [
  rule("general", "entire_site"),
  rule("general", "all"),
  rule("singular", "all"),
  rule("singular", "front"),
  rule("singular", "not_found"),
  rule("singular", "collection", { collection: "posts" }),
  rule("singular", "collection", { collection: "pages" }),
  rule("singular", "collection", { collection: 3 }),
  rule("singular", "entry", { collection: "posts", id: "01POST" }),
  rule("singular", "entry", { collection: "pages", id: "01POST" }),
  rule("singular", "entry", { collection: "posts" }),
  rule("archive", "all"),
  rule("archive", "collection", { collection: "posts" }),
  rule("archive", "taxonomy", { taxonomy: "category" }),
  rule("archive", "taxonomy", { taxonomy: "category", slug: "news" }),
  rule("archive", "taxonomy", { taxonomy: "category", slug: "" }),
  rule("archive", "taxonomy", { taxonomy: "tag", slug: "news" }),
  rule("archive", "taxonomy", { taxonomy: "category", slug: 5 }),
  rule("archive", "search"),
  rule("archive", "front"),
];

const doc = (rules: ConditionRule[]) => ({ schemaVersion: 1 as const, rules });
const exclude = (r: ConditionRule): ConditionRule => ({ ...r, id: `not-${r.id}`, op: "exclude" });

/** Everything the matcher decides, for every context and rule, plus winners and defaults. */
export function conditionsCases() {
  const perRule = RULES.map((r) => ({
    rule: r.id,
    specificity: conditionSpecificity(r),
    valid: validateConditions(doc([r])).ok,
    matches: Object.fromEntries(
      Object.entries(CONTEXTS).map(([name, ctx]) => [
        name,
        [matchesConditions(doc([r]), ctx), conditionsSpecificity(doc([r]), ctx)],
      ]),
    ),
  }));
  const [site, , singular, front, , posts, , , entry, , , archive, , category, news] = RULES as [
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
    ConditionRule,
  ];
  const mixed = {
    siteButNotPosts: doc([site, exclude(posts)]),
    postsButNotEntry: doc([posts, entry, exclude(entry)]),
    entryAndSingular: doc([singular, entry]),
    newsAndCategory: doc([category, news, archive]),
    excludeOnly: doc([exclude(front)]),
    empty: doc([]),
  };
  const combined = Object.fromEntries(
    Object.entries(mixed).map(([name, d]) => [
      name,
      Object.fromEntries(
        Object.entries(CONTEXTS).map(([ctxName, ctx]) => [
          ctxName,
          [matchesConditions(d, ctx), conditionsSpecificity(d, ctx)],
        ]),
      ),
    ]),
  );
  const locations = Object.fromEntries(
    Object.entries(CONTEXTS).map(([name, ctx]) => [
      name,
      {
        content: contentPartTypeForContext(ctx),
        applies: THEME_PART_TYPES.filter((type) => themePartLocationApplies(type, ctx)),
      },
    ]),
  );
  const defaults = Object.fromEntries(
    THEME_PART_TYPES.map((type) => [type, defaultConditionsFor(type)]),
  );
  const candidate = (
    id: string,
    partType: ThemePartCandidate["partType"],
    rules: ConditionRule[],
    updatedAt: string,
  ) => ({ id, partType, conditions: doc(rules), updatedAt }) satisfies ThemePartCandidate;
  const candidates = [
    candidate("site-old", "header", [site], "2026-01-01"),
    candidate("site-new", "header", [site], "2026-03-01"),
    candidate("site-same", "header", [site], "2026-03-01"),
    candidate("posts", "header", [posts], "2025-01-01"),
    candidate("entry", "header", [entry], "2024-01-01"),
    candidate("no-front", "header", [site, exclude(front)], "2027-01-01"),
    candidate("single-post", "single_post", [posts], "2026-01-01"),
    candidate("single-page", "single_page", [site], "2026-01-01"),
    candidate("popup-a", "popup", [site], "2026-02-01"),
    candidate("popup-b", "popup", [singular], "2026-04-01"),
    candidate("popup-c", "popup", [front], "2026-04-01"),
    candidate("loop", "loop_item", [site], "2026-01-01"),
  ];
  const winners = Object.fromEntries(
    Object.entries(CONTEXTS).map(([name, ctx]) => [
      name,
      Object.fromEntries(
        THEME_PART_TYPES.map((type) => [
          type,
          {
            winner: pickThemePartWinner(candidates, type, ctx)?.id ?? null,
            all: listMatchingThemeParts(candidates, type, ctx).map((c) => c.id),
          },
        ]),
      ),
    ]),
  );
  return { perRule, combined, locations, defaults, winners };
}
