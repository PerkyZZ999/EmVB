import { describe, expect, test } from "bun:test";
import { listPages } from "../../packages/emvb/src/admin/content-api.ts";
import { loadDesign, loadEntry } from "../../packages/emvb/src/admin/editor/useEditorData.ts";
import { PAGES_COLLECTION } from "../../packages/emvb/src/constants.ts";
import {
  DESIGN_SCHEMA_VERSION,
  LAYOUT_SCHEMA_VERSION,
  type DesignSystem,
  type Layout,
} from "../../packages/emvb/src/core/index.ts";
import { createBackend } from "../../site/src/playground/mock/backend.ts";
import { freeSlug, importSharedPage, shareProblem } from "../../site/src/playground/shared.ts";

const layout: Layout = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children: [] },
} as Layout;
const design: DesignSystem = {
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: {
    colors: [{ id: "brand", name: "Brand", value: "#ff0000" }],
    fonts: [],
    fontSizes: [],
    spacings: [],
  },
};

describe("W-321 opening a shared page in the playground", () => {
  test("W-321 adds a new page and, when asked, its Site styles", async () => {
    const backend = createBackend();
    const before = await listPages(backend.fetcher);
    const id = await importSharedPage(
      backend.fetcher,
      { title: "Shared hero", layout, design },
      {
        styles: true,
        takenSlugs: new Set(before.map((p) => p.slug)),
      },
    );
    const after = await listPages(backend.fetcher);
    expect(after.length).toBe(before.length + 1);
    expect(after.find((p) => p.id === id)?.slug).toBe("shared-hero");
    expect((await loadEntry(backend.fetcher, id, PAGES_COLLECTION)).layout).toEqual(layout);
    expect((await loadDesign(backend.fetcher)).design).toEqual(design);
  });

  test("W-321 without styles, the playground's Site styles stay", async () => {
    const backend = createBackend();
    const mine = (await loadDesign(backend.fetcher)).design;
    await importSharedPage(
      backend.fetcher,
      { title: "x", layout, design },
      { styles: false, takenSlugs: new Set() },
    );
    expect((await loadDesign(backend.fetcher)).design).toEqual(mine);
  });

  test("W-321 slugs never clash and problems read plainly", () => {
    expect(freeSlug("Home", new Set(["home", "home-2"]))).toBe("home-3");
    expect(freeSlug("!!!", new Set())).toBe("shared-page");
    expect(shareProblem({ ok: false, reason: "unreadable" })).toContain("damaged");
    expect(shareProblem({ ok: false, reason: "invalid", detail: "root: bad" })).toContain(
      "root: bad",
    );
  });
});
