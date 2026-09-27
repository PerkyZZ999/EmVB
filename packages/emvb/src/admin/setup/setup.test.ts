import { describe, expect, test } from "bun:test";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { planSetup, type CollectionState } from "./plan.ts";
import { runSetup } from "./run.ts";
import {
  COLLECTION_SPEC,
  FIELD_SPECS,
  LAYOUT_WIDGET,
  THEME_PARTS_COLLECTION_SPEC,
  THEME_PARTS_FIELD_SPECS,
} from "./spec.ts";

const upToDatePages = (): CollectionState => ({
  slug: PAGES_COLLECTION,
  hidden: true,
  supports: ["drafts", "revisions", "preview"],
  hasSeo: true,
  urlPattern: "/{slug}",
  fields: FIELD_SPECS.map((f) => ({ ...f, widget: f.widget ?? null })),
});

const upToDateThemeParts = (): CollectionState => ({
  slug: THEME_PARTS_COLLECTION,
  hidden: true,
  supports: ["drafts", "revisions", "preview"],
  hasSeo: false,
  fields: THEME_PARTS_FIELD_SPECS.map((f) => ({ ...f, widget: f.widget ?? null })),
});

/** An in-memory stand-in for EmDash's schema REST API (only the calls setup makes). */
function fakeSchemaApi(initial: {
  pages: CollectionState | null;
  themeParts: CollectionState | null;
}) {
  const collections = new Map<string, CollectionState | null>([
    [PAGES_COLLECTION, initial.pages ? structuredClone(initial.pages) : null],
    [THEME_PARTS_COLLECTION, initial.themeParts ? structuredClone(initial.themeParts) : null],
  ]);
  const calls: string[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push(`${method} ${path.replace(/\?.*/, "")}`);
    const base = "/_emdash/api/schema/collections";
    const getMatch = new RegExp(`^${base}/([a-z_]+)\\?`).exec(path);
    if (method === "GET" && getMatch) {
      const slug = getMatch[1] ?? "";
      const collection = collections.get(slug) ?? null;
      return collection
        ? json(200, { success: true, data: { item: collection } })
        : json(404, { error: { code: "NOT_FOUND" } });
    }
    if (method === "POST" && path === base) {
      const slug = String(body["slug"] ?? "");
      collections.set(slug, { ...(body as unknown as CollectionState), fields: [] });
      return json(201, { success: true, data: {} });
    }
    const putColl = new RegExp(`^${base}/([a-z_]+)$`).exec(path);
    if (method === "PUT" && putColl) {
      const slug = putColl[1] ?? "";
      const current = collections.get(slug);
      if (!current) return json(404, { error: { code: "NOT_FOUND" } });
      collections.set(slug, { ...current, ...body });
      return json(200, { success: true, data: {} });
    }
    const postField = new RegExp(`^${base}/([a-z_]+)/fields$`).exec(path);
    if (method === "POST" && postField) {
      const slug = postField[1] ?? "";
      const current = collections.get(slug);
      if (!current) return json(404, { error: { code: "NOT_FOUND" } });
      current.fields.push(body as unknown as CollectionState["fields"][number]);
      return json(201, { success: true, data: {} });
    }
    const putField = new RegExp(`^${base}/([a-z_]+)/fields/([a-z_]+)$`).exec(path);
    if (method === "PUT" && putField) {
      const slug = putField[1] ?? "";
      const field = putField[2] ?? "";
      const current = collections.get(slug);
      if (!current) return json(404, { error: { code: "NOT_FOUND" } });
      current.fields = current.fields.map((f) =>
        f.slug === field ? Object.assign({}, f, body) : f,
      );
      return json(200, { success: true, data: {} });
    }
    return json(400, { error: { code: "UNEXPECTED", message: `${method} ${path}` } });
  };
  return {
    fetcher,
    calls,
    state: () => ({
      pages: collections.get(PAGES_COLLECTION) ?? null,
      themeParts: collections.get(THEME_PARTS_COLLECTION) ?? null,
    }),
  };
}

describe("planSetup", () => {
  test("a missing site creates both pages and theme parts collections with their fields", () => {
    const { steps } = planSetup(null, null);
    expect(steps[0]).toEqual({
      kind: "create-collection",
      collection: PAGES_COLLECTION,
      body: COLLECTION_SPEC,
    });
    expect(COLLECTION_SPEC).toMatchObject({
      hidden: true,
      hasSeo: true,
      supports: ["drafts", "revisions", "preview"],
    });
    const pagesFields = steps
      .filter((s) => s.kind === "create-field" && s.collection === PAGES_COLLECTION)
      .map((s) => (s.kind === "create-field" ? s.body.slug : ""));
    expect(pagesFields).toEqual(["title", "layout", "canvas_mode"]);

    const themeCreate = steps.find(
      (s) => s.kind === "create-collection" && s.collection === THEME_PARTS_COLLECTION,
    );
    expect(themeCreate).toEqual({
      kind: "create-collection",
      collection: THEME_PARTS_COLLECTION,
      body: THEME_PARTS_COLLECTION_SPEC,
    });
    expect(THEME_PARTS_COLLECTION_SPEC).toMatchObject({
      hidden: true,
      hasSeo: false,
      supports: ["drafts", "revisions", "preview"],
    });
    expect("urlPattern" in THEME_PARTS_COLLECTION_SPEC).toBe(false);
    const themeFields = steps
      .filter((s) => s.kind === "create-field" && s.collection === THEME_PARTS_COLLECTION)
      .map((s) => (s.kind === "create-field" ? s.body.slug : ""));
    expect(themeFields).toEqual(["title", "layout", "part_type", "conditions"]);
  });

  test("the layout field is bound to the read-only EmVB widget on both collections", () => {
    expect(FIELD_SPECS.find((f) => f.slug === "layout")).toMatchObject({
      type: "json",
      widget: LAYOUT_WIDGET,
    });
    expect(THEME_PARTS_FIELD_SPECS.find((f) => f.slug === "layout")).toMatchObject({
      type: "json",
      widget: LAYOUT_WIDGET,
    });
    expect(LAYOUT_WIDGET).toBe("emvb:layout");
  });

  test("part_type includes S7c/S7d templates (popups deferred)", () => {
    expect(THEME_PARTS_FIELD_SPECS.find((f) => f.slug === "part_type")).toMatchObject({
      type: "select",
      required: true,
      validation: {
        options: [
          "header",
          "footer",
          "error_404",
          "search_results",
          "single_page",
          "single_post",
          "archive",
          "loop_item",
        ],
      },
    });
  });

  test("an up-to-date site needs nothing", () => {
    expect(planSetup(upToDatePages(), upToDateThemeParts())).toEqual({
      steps: [],
      conflicts: [],
    });
  });

  test("missing theme parts alone is an upgrade (pages already present)", () => {
    const { steps } = planSetup(upToDatePages(), null);
    expect(steps[0]).toMatchObject({
      kind: "create-collection",
      collection: THEME_PARTS_COLLECTION,
    });
    expect(steps.some((s) => s.collection === PAGES_COLLECTION)).toBe(false);
  });

  test("an outdated pages collection is upgraded in place: flags, widget binding and missing fields", () => {
    const current = upToDatePages();
    current.hidden = false;
    current.fields = current.fields.filter((f) => f.slug !== "canvas_mode");
    const layout = current.fields.find((f) => f.slug === "layout");
    if (layout) layout.widget = null;
    expect<unknown>(planSetup(current, upToDateThemeParts()).steps).toEqual([
      {
        kind: "update-collection",
        collection: PAGES_COLLECTION,
        body: { hidden: true },
      },
      {
        kind: "update-field",
        collection: PAGES_COLLECTION,
        slug: "layout",
        body: { label: "Layout", widget: LAYOUT_WIDGET, validation: null },
      },
      {
        kind: "create-field",
        collection: PAGES_COLLECTION,
        body: FIELD_SPECS[2],
      },
    ]);
  });

  test("a field with the wrong type is a conflict, never silently changed", () => {
    const current = upToDatePages();
    current.fields = current.fields.map((f) => (f.slug === "layout" ? { ...f, type: "text" } : f));
    expect(planSetup(current, upToDateThemeParts())).toEqual({
      steps: [],
      conflicts: [`Field "layout" on ${PAGES_COLLECTION} is text; EmVB needs json.`],
    });
  });
});

describe("runSetup", () => {
  test("running setup twice gives the same schema, and the second run changes nothing", async () => {
    const api = fakeSchemaApi({ pages: null, themeParts: null });
    const first = await runSetup(api.fetcher);
    expect(first.applied.length).toBe(1 + FIELD_SPECS.length + 1 + THEME_PARTS_FIELD_SPECS.length);
    const afterFirst = structuredClone(api.state());
    api.calls.length = 0;
    const second = await runSetup(api.fetcher);
    expect(second).toEqual({ applied: [], conflicts: [] });
    expect(api.calls).toEqual([
      `GET /_emdash/api/schema/collections/${PAGES_COLLECTION}`,
      `GET /_emdash/api/schema/collections/${THEME_PARTS_COLLECTION}`,
    ]);
    expect(api.state()).toEqual(afterFirst);
    expect(planSetup(api.state().pages, api.state().themeParts)).toEqual({
      steps: [],
      conflicts: [],
    });
  });

  test("conflicts stop setup before any write", async () => {
    const current = upToDatePages();
    current.hidden = false;
    current.fields = current.fields.map((f) => (f.slug === "title" ? { ...f, type: "json" } : f));
    const api = fakeSchemaApi({ pages: current, themeParts: upToDateThemeParts() });
    expect((await runSetup(api.fetcher)).conflicts).toHaveLength(1);
    expect(api.calls.filter((c) => !c.startsWith("GET"))).toEqual([]);
  });

  test("an API failure surfaces as an error", async () => {
    const failing: Fetcher = async () =>
      new Response(
        JSON.stringify({ error: { code: "FORBIDDEN", message: "Insufficient permissions" } }),
        { status: 403 },
      );
    await expect(runSetup(failing)).rejects.toThrow("Insufficient permissions");
  });
});

describe("public URL pattern", () => {
  test("a missing pattern is set to /{slug}, and a host's own pattern is kept", () => {
    expect(planSetup({ ...upToDatePages(), urlPattern: null }, upToDateThemeParts()).steps).toEqual(
      [
        {
          kind: "update-collection",
          collection: PAGES_COLLECTION,
          body: { urlPattern: "/{slug}" },
        },
      ],
    );
    expect(
      planSetup({ ...upToDatePages(), urlPattern: "/p/{slug}" }, upToDateThemeParts()).steps,
    ).toEqual([]);
  });
});
