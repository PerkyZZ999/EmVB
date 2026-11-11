import { ApiError, listAllItems, requestJson, type Fetcher } from "./api.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../constants.ts";
import { titleOf, type ContentItem } from "./content-item.ts";
import { publishEntry } from "./content-api.ts";

/** What a bulk action did: the ids it changed and, for the rest, why not. */
export type BulkResult = { done: string[]; failed: { id: string; message: string }[] };

const message = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : String(error);

/** Runs `act` on each id in turn (one request at a time); a failure doesn't stop the rest. */
async function each(ids: readonly string[], act: (id: string) => Promise<unknown>) {
  const result: BulkResult = { done: [], failed: [] };
  for (const id of ids) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one at a time keeps the site's load low
      await act(id);
      result.done.push(id);
    } catch (error) {
      result.failed.push({ id, message: message(error) });
    }
  }
  return result;
}

const path = (collection: string, id: string, action = "") =>
  `/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}${action}`;

/** W-978: publishes each entry's latest saved version. */
export const publishMany = (fetcher: Fetcher, collection: string, ids: readonly string[]) =>
  each(ids, (id) =>
    publishEntry(fetcher, `/_emdash/api/content/${encodeURIComponent(collection)}`, id, null),
  );

/** W-978: moves each entry to EmDash's trash, from where `restoreMany` brings it back. */
export const trashMany = (fetcher: Fetcher, collection: string, ids: readonly string[]) =>
  each(ids, (id) => requestJson(fetcher, path(collection, id), { method: "DELETE" }));

/** W-978: brings entries back from the trash. */
export const restoreMany = (fetcher: Fetcher, collection: string, ids: readonly string[]) =>
  each(ids, (id) => requestJson(fetcher, path(collection, id, "/restore"), { method: "POST" }));

/**
 * W-980: which of `ids` (theme parts) published pages and parts still use, as synced sections or
 * loop items, with the titles of where. Deleting one leaves nothing in its place there.
 */
export async function partsInUse(
  fetcher: Fetcher,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const [pages, parts] = await Promise.all([
    listAllItems<ContentItem>(fetcher, `/_emdash/api/content/${PAGES_COLLECTION}`),
    listAllItems<ContentItem>(fetcher, `/_emdash/api/content/${THEME_PARTS_COLLECTION}`),
  ]);
  const used = new Map<string, string[]>();
  for (const item of [...pages, ...parts]) {
    if (ids.includes(item.id)) continue;
    const layout = item.data?.["layout"];
    const text = typeof layout === "string" ? layout : JSON.stringify(layout ?? null);
    for (const id of ids) {
      if (!text.includes(`"partId":${JSON.stringify(id)}`)) continue;
      used.set(id, [...(used.get(id) ?? []), titleOf(item, "Untitled")]);
    }
  }
  return used;
}
