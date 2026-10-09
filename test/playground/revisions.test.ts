import { describe, expect, test } from "bun:test";
import { requestJson } from "../../packages/emvb/src/admin/api.ts";
import { createPage } from "../../packages/emvb/src/admin/content-api.ts";
import { PAGES_COLLECTION } from "../../packages/emvb/src/constants.ts";
import { starterLayout } from "../../packages/emvb/src/core/index.ts";
import { createBackend } from "../../site/src/playground/mock/backend.ts";

type Revisions = { items: { id: string; data: { title?: string } }[]; total: number };

describe("playground version timeline (W-315)", () => {
  test("W-315 each save keeps a version, newest first, at most eight", async () => {
    const backend = createBackend();
    const path = (id: string) =>
      `/_emdash/api/content/${PAGES_COLLECTION}/${id}/revisions?limit=50`;
    const id = await createPage(backend.fetcher, {
      title: "T0",
      slug: "t",
      layout: starterLayout("T0"),
    });
    let first = await requestJson<Revisions>(backend.fetcher, path(id));
    expect(first.total).toBe(1);
    for (let n = 1; n <= 10; n += 1) {
      const item = `/_emdash/api/content/${PAGES_COLLECTION}/${id}`;
      // oxlint-disable-next-line no-await-in-loop
      const { _rev } = await requestJson<{ _rev: string }>(backend.fetcher, item);
      // oxlint-disable-next-line no-await-in-loop
      await requestJson(backend.fetcher, item, {
        method: "PUT",
        body: { data: { title: `T${n}` }, _rev },
      });
    }
    first = await requestJson<Revisions>(backend.fetcher, path(id));
    expect(first.total).toBe(8);
    expect(first.items[0]?.data.title).toBe("T10");
  });
});
