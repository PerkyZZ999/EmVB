import { describe, expect, test } from "bun:test";
import {
  defaultConditions,
  defaultTriggers,
  type ConditionsDoc,
  type Layout,
  type TriggersDoc,
} from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { loadEntry } from "./useEditorData.ts";

const layout: Layout = {
  schemaVersion: 7,
  root: { id: "root0001", type: "container", props: {}, children: [] },
};

/** A fetcher that answers one content read with `body` and records the paths it was asked for. */
function contentFetcher(body: unknown, status = 200) {
  const paths: string[] = [];
  const fetcher: Fetcher = async (path) => {
    paths.push(path);
    return new Response(JSON.stringify(status === 200 ? { data: body } : body), { status });
  };
  return { fetcher, paths };
}

describe("loadEntry reads a page for the editor (W-091)", () => {
  test("maps the stored item and parses a JSON-string layout", async () => {
    const { fetcher, paths } = contentFetcher({
      item: {
        id: "01PAGE",
        slug: "about",
        status: "published",
        data: { title: "About", canvas_mode: "blank", layout: JSON.stringify(layout) },
        seo: { title: "About us", description: "Who we are" },
      },
      _rev: "rev-7",
    });
    const entry = await loadEntry(fetcher, "a/b");
    expect(paths).toEqual(["/_emdash/api/content/emvb_pages/a%2Fb"]);
    expect(entry).toEqual({
      id: "01PAGE",
      collection: "emvb_pages",
      title: "About",
      slug: "about",
      canvasMode: "blank",
      seoTitle: "About us",
      seoDescription: "Who we are",
      status: "published",
      rev: "rev-7",
      layout,
    });
  });

  test("an item without fields falls back to the asked id, a draft and no layout", async () => {
    const { fetcher } = contentFetcher({ item: { data: { title: 42, layout: "" } } });
    expect(await loadEntry(fetcher, "p1")).toEqual({
      id: "p1",
      collection: "emvb_pages",
      title: "",
      slug: "",
      canvasMode: "site-layout",
      seoTitle: "",
      seoDescription: "",
      status: "draft",
      rev: null,
      layout: null,
    });
  });

  test("a stored layout object is used as it is", async () => {
    const { fetcher } = contentFetcher({ item: { data: { layout } } });
    expect((await loadEntry(fetcher, "p1")).layout).toEqual(layout);
  });

  test.each([
    ["a string that is not JSON", "{not json"],
    ["a JSON string that is not a layout", JSON.stringify({ root: 1 })],
    ["an object that is not a layout", { schemaVersion: 7 }],
  ])("%s is refused as unreadable", async (_name, stored) => {
    const { fetcher } = contentFetcher({ item: { data: { layout: stored } } });
    await expect(loadEntry(fetcher, "p1")).rejects.toThrow("This page's layout can't be read.");
  });

  test("a failed read rejects with the API status", async () => {
    const { fetcher } = contentFetcher({ error: { code: "NOT_FOUND", message: "gone" } }, 404);
    await expect(loadEntry(fetcher, "p1")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});

describe("loadEntry reads a theme part (W-091, R-061, R-063)", () => {
  const custom: { conditions: ConditionsDoc; triggers: TriggersDoc } = {
    conditions: {
      schemaVersion: 1,
      rules: [{ id: "r1", op: "exclude", group: "general", name: "entire_site", args: {} }],
    },
    triggers: { schemaVersion: 1, open: [{ type: "delay", ms: 1000 }], advanced: {} },
  };

  test("a page has no part type, conditions or triggers", async () => {
    const { fetcher } = contentFetcher({
      item: { data: { part_type: "footer", conditions: custom.conditions } },
    });
    const entry = await loadEntry(fetcher, "p1");
    expect(["partType", "conditions", "triggers"].filter((key) => key in entry)).toEqual([]);
  });

  test("stored part type, conditions and triggers (as JSON strings) are kept", async () => {
    const { fetcher, paths } = contentFetcher({
      item: {
        data: {
          part_type: "footer",
          conditions: JSON.stringify(custom.conditions),
          triggers: JSON.stringify(custom.triggers),
        },
      },
    });
    const entry = await loadEntry(fetcher, "t1", "emvb_theme_parts");
    expect(paths).toEqual(["/_emdash/api/content/emvb_theme_parts/t1"]);
    expect(entry.collection).toBe("emvb_theme_parts");
    expect(entry.partType).toBe("footer");
    expect(entry.conditions).toEqual(custom.conditions);
    expect(entry.triggers).toEqual(custom.triggers);
  });

  test("missing or unreadable part type, conditions and triggers fall back to the defaults", async () => {
    const stored = [
      {},
      { part_type: "", conditions: "", triggers: "" },
      { part_type: null, conditions: null, triggers: null },
      { part_type: "sidebar", conditions: { schemaVersion: 1, rules: "x" }, triggers: "{oops" },
    ];
    const entries = await Promise.all(
      stored.map((data) =>
        loadEntry(contentFetcher({ item: { data } }).fetcher, "t1", "emvb_theme_parts"),
      ),
    );
    expect(entries.map((entry) => [entry.partType, entry.conditions, entry.triggers])).toEqual(
      stored.map(() => ["header", defaultConditions(), defaultTriggers()]),
    );
  });
});
