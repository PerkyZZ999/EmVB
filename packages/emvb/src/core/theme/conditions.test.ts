import { describe, expect, test } from "bun:test";
import {
  conditionsSpecificity,
  contentPartTypeForContext,
  defaultConditions,
  defaultConditionsFor,
  matchesConditions,
  pickThemePartWinner,
  listMatchingThemeParts,
  themePartLocationApplies,
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

const search: ThemeRequestContext = {
  path: "/search",
  isFront: false,
  is404: false,
  isSearch: true,
  kind: "archive",
};

const pageSingular: ThemeRequestContext = {
  path: "/about",
  isFront: false,
  is404: false,
  isSearch: false,
  kind: "singular",
  collection: "pages",
  entryId: "01PAGE",
};

const emvbPage: ThemeRequestContext = {
  path: "/landing",
  isFront: false,
  is404: false,
  isSearch: false,
  kind: "singular",
  collection: "emvb_pages",
  entryId: "01EMVB",
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

const withExclude = (
  doc: ConditionsDoc,
  group: ConditionsDoc["rules"][number]["group"],
  name: string,
  args: Record<string, string> = {},
): ConditionsDoc => ({
  schemaVersion: 1,
  rules: [...doc.rules, { id: "ex", op: "exclude", group, name, args }],
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
    expect(matchesConditions(doc, { ...post, entryId: "01OTHER" })).toBe(false);
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
    expect(
      conditionsSpecificity(
        include("singular", "entry", { collection: "posts", id: "01POST" }),
        post,
      ),
    ).toBeGreaterThan(
      conditionsSpecificity(include("singular", "collection", { collection: "posts" }), post),
    );
    expect(
      conditionsSpecificity(include("singular", "collection", { collection: "posts" }), post),
    ).toBeGreaterThan(conditionsSpecificity(defaultConditions(), post));
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

describe("S7c content part types", () => {
  test("archive/search matches search context", () => {
    const doc = include("archive", "search");
    expect(matchesConditions(doc, search)).toBe(true);
    expect(matchesConditions(doc, postsArchive)).toBe(false);
    expect(matchesConditions(doc, notFound)).toBe(false);
  });

  test("defaultConditionsFor sets location-appropriate includes", () => {
    expect(defaultConditionsFor("error_404").rules[0]).toMatchObject({
      op: "include",
      group: "singular",
      name: "not_found",
    });
    expect(defaultConditionsFor("search_results").rules[0]).toMatchObject({
      group: "archive",
      name: "search",
    });
    expect(defaultConditionsFor("single_page").rules[0]).toMatchObject({
      group: "singular",
      name: "collection",
      args: { collection: "pages" },
    });
    expect(defaultConditionsFor("single_post").rules[0]).toMatchObject({
      group: "singular",
      name: "collection",
      args: { collection: "posts" },
    });
    expect(defaultConditionsFor("archive").rules[0]).toMatchObject({
      group: "archive",
      name: "all",
    });
    expect(defaultConditionsFor("loop_item")).toEqual(defaultConditions());
    expect(defaultConditionsFor("section")).toEqual(defaultConditions());
    expect(defaultConditionsFor("page_template")).toEqual(defaultConditions());
    expect(defaultConditionsFor("header")).toEqual(defaultConditions());
    expect(defaultConditionsFor("popup")).toEqual(defaultConditions());
  });

  test("themePartLocationApplies gates content types to their routes", () => {
    expect(themePartLocationApplies("error_404", notFound)).toBe(true);
    expect(themePartLocationApplies("error_404", search)).toBe(false);
    expect(themePartLocationApplies("search_results", search)).toBe(true);
    expect(themePartLocationApplies("search_results", pageSingular)).toBe(false);
    expect(themePartLocationApplies("single_page", pageSingular)).toBe(true);
    expect(themePartLocationApplies("single_page", front)).toBe(false);
    expect(themePartLocationApplies("single_page", emvbPage)).toBe(false);
    expect(themePartLocationApplies("single_page", post)).toBe(false);
    expect(themePartLocationApplies("single_post", post)).toBe(true);
    expect(themePartLocationApplies("single_post", pageSingular)).toBe(false);
    expect(themePartLocationApplies("archive", postsArchive)).toBe(true);
    expect(themePartLocationApplies("archive", category)).toBe(true);
    expect(themePartLocationApplies("archive", search)).toBe(false);
    expect(themePartLocationApplies("popup", post)).toBe(true);
    expect(themePartLocationApplies("popup", front)).toBe(true);
    expect(themePartLocationApplies("float", post)).toBe(true);
    expect(themePartLocationApplies("float", front)).toBe(true);
    expect(themePartLocationApplies("loop_item", postsArchive)).toBe(false);
    expect(themePartLocationApplies("loop_item", post)).toBe(false);
    expect(themePartLocationApplies("header", notFound)).toBe(true);
  });

  test("contentPartTypeForContext picks 404 then search then post then page then archive", () => {
    expect(contentPartTypeForContext(notFound)).toBe("error_404");
    expect(contentPartTypeForContext(search)).toBe("search_results");
    expect(contentPartTypeForContext(post)).toBe("single_post");
    expect(contentPartTypeForContext(pageSingular)).toBe("single_page");
    expect(contentPartTypeForContext(postsArchive)).toBe("archive");
    expect(contentPartTypeForContext(category)).toBe("archive");
    expect(contentPartTypeForContext(emvbPage)).toBeNull();
    expect(contentPartTypeForContext(front)).toBeNull();
  });

  test("error_404 winner only on 404 even with entire-site conditions", () => {
    const candidates: ThemePartCandidate[] = [
      {
        id: "e404",
        partType: "error_404",
        conditions: defaultConditions(),
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
      {
        id: "hdr",
        partType: "header",
        conditions: defaultConditions(),
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
    ];
    expect(pickThemePartWinner(candidates, "error_404", notFound)?.id).toBe("e404");
    expect(pickThemePartWinner(candidates, "error_404", pageSingular)).toBeNull();
    expect(pickThemePartWinner(candidates, "header", notFound)?.id).toBe("hdr");
  });

  test("single_page winner on EmDash pages singular only", () => {
    const candidates: ThemePartCandidate[] = [
      {
        id: "sp",
        partType: "single_page",
        conditions: defaultConditionsFor("single_page"),
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
    ];
    expect(pickThemePartWinner(candidates, "single_page", pageSingular)?.id).toBe("sp");
    expect(pickThemePartWinner(candidates, "single_page", emvbPage)).toBeNull();
    expect(pickThemePartWinner(candidates, "single_page", post)).toBeNull();
  });

  test("search_results winner on search route", () => {
    const candidates: ThemePartCandidate[] = [
      {
        id: "sr",
        partType: "search_results",
        conditions: defaultConditionsFor("search_results"),
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
    ];
    expect(pickThemePartWinner(candidates, "search_results", search)?.id).toBe("sr");
    expect(pickThemePartWinner(candidates, "search_results", postsArchive)).toBeNull();
  });

  test("single_post winner on posts singular only", () => {
    const candidates: ThemePartCandidate[] = [
      {
        id: "spost",
        partType: "single_post",
        conditions: defaultConditionsFor("single_post"),
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
    ];
    expect(pickThemePartWinner(candidates, "single_post", post)?.id).toBe("spost");
    expect(pickThemePartWinner(candidates, "single_post", pageSingular)).toBeNull();
    expect(pickThemePartWinner(candidates, "single_post", postsArchive)).toBeNull();
  });

  test("archive winner on posts archive and taxonomy, not search", () => {
    const candidates: ThemePartCandidate[] = [
      {
        id: "arch",
        partType: "archive",
        conditions: defaultConditions(),
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
    ];
    expect(pickThemePartWinner(candidates, "archive", postsArchive)?.id).toBe("arch");
    expect(pickThemePartWinner(candidates, "archive", category)?.id).toBe("arch");
    expect(pickThemePartWinner(candidates, "archive", search)).toBeNull();
    expect(pickThemePartWinner(candidates, "archive", post)).toBeNull();
  });

  test("section and page_template never win as a page location", () => {
    for (const partType of ["section", "page_template"] as const) {
      const candidates: ThemePartCandidate[] = [
        {
          id: partType,
          partType,
          conditions: defaultConditions(),
          updatedAt: "2026-09-27T12:00:00.000Z",
        },
      ];
      expect(pickThemePartWinner(candidates, partType, postsArchive)).toBeNull();
      expect(pickThemePartWinner(candidates, partType, post)).toBeNull();
    }
  });

  test("loop_item never wins as a page location", () => {
    const candidates: ThemePartCandidate[] = [
      {
        id: "li",
        partType: "loop_item",
        conditions: defaultConditions(),
        updatedAt: "2026-09-27T12:00:00.000Z",
      },
    ];
    expect(pickThemePartWinner(candidates, "loop_item", postsArchive)).toBeNull();
    expect(pickThemePartWinner(candidates, "loop_item", post)).toBeNull();
  });

  test("listMatchingThemeParts returns every matching popup", () => {
    const candidates = [
      {
        id: "p1",
        partType: "popup" as const,
        conditions: defaultConditions(),
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "p2",
        partType: "popup" as const,
        conditions: withExclude(defaultConditions(), "singular", "front"),
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "hdr",
        partType: "header" as const,
        conditions: defaultConditions(),
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ];
    const onPost = listMatchingThemeParts(candidates, "popup", post);
    expect(onPost.map((c) => c.id)).toEqual(["p2", "p1"]);
    const onFront = listMatchingThemeParts(candidates, "popup", front);
    expect(onFront.map((c) => c.id)).toEqual(["p1"]);
  });
});
