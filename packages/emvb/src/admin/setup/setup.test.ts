import { describe, expect, test } from "bun:test";
import type { Fetcher } from "../api.ts";
import { planSetup, type CollectionState } from "./plan.ts";
import { runSetup } from "./run.ts";
import { COLLECTION_SPEC, FIELD_SPECS, LAYOUT_WIDGET } from "./spec.ts";

const upToDate = (): CollectionState => ({
  slug: "emvb_pages",
  hidden: true,
  supports: ["drafts", "revisions", "preview"],
  hasSeo: true,
  urlPattern: "/{slug}",
  fields: FIELD_SPECS.map((f) => ({ ...f, widget: f.widget ?? null })),
});

/** An in-memory stand-in for EmDash's schema REST API (only the calls setup makes). */
function fakeSchemaApi(initial: CollectionState | null) {
  let collection = initial ? structuredClone(initial) : null;
  const calls: string[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push(`${method} ${path.replace(/\?.*/, "")}`);
    const base = "/_emdash/api/schema/collections";
    if (method === "GET" && path.startsWith(`${base}/emvb_pages?`)) {
      return collection
        ? json(200, { success: true, data: { item: collection } })
        : json(404, { error: { code: "NOT_FOUND" } });
    }
    if (method === "POST" && path === base) {
      collection = { ...(body as unknown as CollectionState), fields: [] };
      return json(201, { success: true, data: {} });
    }
    if (!collection) return json(404, { error: { code: "NOT_FOUND" } });
    if (method === "PUT" && path === `${base}/emvb_pages`) {
      collection = { ...collection, ...body };
      return json(200, { success: true, data: {} });
    }
    if (method === "POST" && path === `${base}/emvb_pages/fields`) {
      collection.fields.push(body as unknown as CollectionState["fields"][number]);
      return json(201, { success: true, data: {} });
    }
    const field = /\/fields\/([a-z_]+)$/.exec(path)?.[1];
    if (method === "PUT" && field) {
      collection.fields = collection.fields.map((f) => (f.slug === field ? { ...f, ...body } : f));
      return json(200, { success: true, data: {} });
    }
    return json(400, { error: { code: "UNEXPECTED", message: `${method} ${path}` } });
  };
  return { fetcher, calls, state: () => collection };
}

describe("planSetup", () => {
  test("a missing collection is created hidden, with drafts, revisions, preview and SEO, and all fields", () => {
    const { steps } = planSetup(null);
    expect(steps[0]).toEqual({ kind: "create-collection", body: COLLECTION_SPEC });
    expect(COLLECTION_SPEC).toMatchObject({
      hidden: true,
      hasSeo: true,
      supports: ["drafts", "revisions", "preview"],
    });
    expect(steps.slice(1).map((s) => (s.kind === "create-field" ? s.body.slug : s.kind))).toEqual([
      "title",
      "layout",
      "canvas_mode",
    ]);
  });

  test("the layout field is bound to the read-only EmVB widget", () => {
    expect(FIELD_SPECS.find((f) => f.slug === "layout")).toMatchObject({
      type: "json",
      widget: LAYOUT_WIDGET,
    });
    expect(LAYOUT_WIDGET).toBe("emvb:layout");
  });

  test("an up-to-date collection needs nothing", () => {
    expect(planSetup(upToDate())).toEqual({ steps: [], conflicts: [] });
  });

  test("an outdated collection is upgraded in place: flags, widget binding and missing fields", () => {
    const current = upToDate();
    current.hidden = false;
    current.fields = current.fields.filter((f) => f.slug !== "canvas_mode");
    const layout = current.fields.find((f) => f.slug === "layout");
    if (layout) layout.widget = null;
    expect<unknown>(planSetup(current).steps).toEqual([
      { kind: "update-collection", body: { hidden: true } },
      {
        kind: "update-field",
        slug: "layout",
        body: { label: "Layout", widget: LAYOUT_WIDGET, validation: null },
      },
      { kind: "create-field", body: FIELD_SPECS[2] },
    ]);
  });

  test("a field with the wrong type is a conflict, never silently changed", () => {
    const current = upToDate();
    current.fields = current.fields.map((f) => (f.slug === "layout" ? { ...f, type: "text" } : f));
    expect(planSetup(current)).toEqual({
      steps: [],
      conflicts: ['Field "layout" is text; EmVB needs json.'],
    });
  });
});

describe("runSetup", () => {
  test("running setup twice gives the same schema, and the second run changes nothing", async () => {
    const api = fakeSchemaApi(null);
    const first = await runSetup(api.fetcher);
    expect(first.applied).toHaveLength(4);
    const afterFirst = structuredClone(api.state());
    api.calls.length = 0;
    const second = await runSetup(api.fetcher);
    expect(second).toEqual({ applied: [], conflicts: [] });
    expect(api.calls).toEqual(["GET /_emdash/api/schema/collections/emvb_pages"]);
    expect(api.state()).toEqual(afterFirst);
    expect(planSetup(api.state())).toEqual({ steps: [], conflicts: [] });
  });

  test("conflicts stop setup before any write", async () => {
    const current = upToDate();
    current.hidden = false;
    current.fields = current.fields.map((f) => (f.slug === "title" ? { ...f, type: "json" } : f));
    const api = fakeSchemaApi(current);
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
    expect(planSetup({ ...upToDate(), urlPattern: null }).steps).toEqual([
      { kind: "update-collection", body: { urlPattern: "/{slug}" } },
    ]);
    expect(planSetup({ ...upToDate(), urlPattern: "/p/{slug}" }).steps).toEqual([]);
  });
});
