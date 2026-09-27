import { describe, expect, test } from "bun:test";
import {
  conditionsSpecificity,
  defaultConditions,
  matchesConditions,
  pickThemePartWinner,
  validateConditions,
  type ConditionsDoc,
  type ThemePartCandidate,
  type ThemeRequestContext,
} from "./conditions.ts";

const front: ThemeRequestContext = {
  path: "/",
  isFront: true,
  is404: false,
  isSearch: false,
  kind: "singular",
  collection: "pages",
  entryId: "home",
};

const post: ThemeRequestContext = {
  path: "/posts/hello",
  isFront: false,
  is404: false,
  isSearch: false,
  kind: "singular",
  collection: "posts",
  entryId: "01POST",
};

const postsArchive: ThemeRequestContext = {
  path: "/posts",
  isFront: false,
  is404: false,
  isSearch: false,
  kind: "archive",
  collection: "posts",
};

const category: ThemeRequestContext = {
  path: "/category/news",
  isFront: false,
  is404: false,
  isSearch: false,
  kind: "archive",
  taxonomy: { type: "category", slug: "news" },
};

const notFound: ThemeRequestContext = {
  path: "/missing",
  isFront: false,
  is404: true,
  isSearch: false,
  kind: "other",
};

const include = (
  group: ConditionsDoc["rules"][number]["group"],
  name: string,
  args: Record<string, string> = {},
  id = "r1",
): ConditionsDoc => ({
  schemaVersion: 1,
  rules: [{ id, op: "include", group, name, args }],
});

const withExclude = (doc: ConditionsDoc, group: ConditionsDoc["rules"][number]["group"], name: string, args: Record<string, string> = {}): ConditionsDoc => ({
  schemaVersion: 1,
  rules: [
    ...doc.rules,
    { id: "ex", op: "exclude", group, name, args },
  ],
});

describe("validateConditions", () => {
  test("default entire-site doc is valid", () => {
    const result = validateConditions(defaultConditions());
    expect(result.ok).toBe(true);
  });

  test("rejects unknown condition names", () => {
    const result = validateConditions(include("singular", "woocommerce"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("unknown_condition");
  });

  test("requires collection args for singular/collection", () => {
    const result = validateConditions(include("singular", "collection"));
    expect(result.ok).toBe(false);
  });
});

describe("matchesConditions", () => {
  test("entire site matches every context", () => {
    const doc = defaultConditions();
    expect(matchesConditions(doc, front)).toBe(true);
    expect(matchesConditions(doc, post)).toBe(true);
    expect(matchesConditions(doc, postsArchive)).toBe(true);
    expect(matchesConditions(doc, notFound)).toBe(true);
  });

  test("front only matches the front page", () => {
    const doc = include("singular", "front");
    expect(matchesConditions(doc, front)).toBe(true);
    expect(matchesConditions(doc, post)).toBe(false);
  });

  test("singular collection matches that collection only", () => {
    const doc = include("singular", "collection", { collection: "posts" });
    expect(matchesConditions(doc, post)).toBe(true);
    expect(matchesConditions(doc, front)).toBe(false);
  });

  test("singular entry matches one id", () => {
    const doc = include("singular", "entry", { collection: "posts", id: "01POST" });
    expect(matchesConditions(doc, post)).toBe(true);
    expect(
      matchesConditions(doc, { ...post, entryId: "01OTHER" }),
    ).toBe(false);
  });

  test("404 matches not_found", () => {
    const doc = include("singular", "not_found");
    expect(matchesConditions(doc, notFound)).toBe(true);
    expect(matchesConditions(doc, post)).toBe(false);
  });

  test("posts archive matches archive/collection", () => {
    const doc = include("archive", "collection", { collection: "posts" });
    expect(matchesConditions(doc, postsArchive)).toBe(true);
    expect(matchesConditions(doc, post)).toBe(false);
  });

  test("category taxonomy matches with optional slug", () => {
    const allCats = include("archive", "taxonomy", { taxonomy: "category" });
    const news = include("archive", "taxonomy", { taxonomy: "category", slug: "news" });
    expect(matchesConditions(allCats, category)).toBe(true);
    expect(matchesConditions(news, category)).toBe(true);
    expect(
      matchesConditions(news, {
        ...category,
        taxonomy: { type: "category", slug: "sports" },
      }),
    ).toBe(false);
  });

  test("exclude overrides include", () => {
    const doc = withExclude(defaultConditions(), "singular", "front");
    expect(matchesConditions(doc, front)).toBe(false);
    expect(matchesConditions(doc, post)).toBe(true);
  });

  test("no include rules never matches", () => {
    const doc: ConditionsDoc = {
      schemaVersion: 1,
      rules: [{ id: "ex", op: "exclude", group: "general", name: "entire_site", args: {} }],
    };
    expect(matchesConditions(doc, post)).toBe(false);
  });
});

describe("specificity and winners", () => {
  test("entry beats collection beats entire site", () => {
    expect(conditionsSpecificity(include("singular", "entry", { collection: "posts", id: "01POST" }), post)).toBeGreaterThan(
      conditionsSpecificity(include("singular", "collection", { collection: "posts" }), post),
    );
    expect(conditionsSpecificity(include("singular", "collection", { collection: "posts" }), post)).toBeGreaterThan(
      conditionsSpecificity(defaultConditions(), post),
    );
  });

  test("most specific matching header wins; ties use updatedAt desc", () => {
    const candidates: ThemePartCandidate[] = [
      {
        id: "entire",
        partType: "header",
        conditions: defaultConditions(),
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
      {
        id: "posts",
        partType: "header",
        conditions: include("singular", "collection", { collection: "posts" }, "posts"),
        updatedAt: "2026-09-27T11:00:00.000Z",
      },
      {
        id: "footer-only",
        partType: "footer",
        conditions: defaultConditions(),
        updatedAt: "2026-09-27T13:00:00.000Z",
      },
    ];
    expect(pickThemePartWinner(candidates, "header", post)?.id).toBe("posts");
    expect(pickThemePartWinner(candidates, "header", front)?.id).toBe("entire");
    expect(pickThemePartWinner(candidates, "footer", post)?.id).toBe("footer-only");
  });

  test("tie-break prefers the more recently updated part", () => {
    const older = {
      id: "old",
      partType: "header" as const,
      conditions: defaultConditions(),
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const newer = {
      id: "new",
      partType: "header" as const,
      conditions: defaultConditions(),
      updatedAt: "2026-09-27T00:00:00.000Z",
    };
    expect(pickThemePartWinner([older, newer], "header", post)?.id).toBe("new");
  });
});
