import { getEmDashCollection, getSiteSettings } from "emdash";
import {
  collectCollectionLoops,
  layoutUsesSource,
  paramsFromSearch,
  siteBindingValues,
  type CollectionLoop,
  type Layout,
  type ThemePostFields,
} from "../core/index.ts";
import { themePostFromEntry } from "./theme-posts.ts";

type RequestData = {
  site?: Record<string, string>;
  params?: Record<string, string>;
  collections?: Record<string, ThemePostFields[]>;
};

// D1/SQLite columns are snake_case, so orderBy names the columns as stored.
const ORDER_BY: Record<CollectionLoop["order"], Record<string, "asc" | "desc">> = {
  newest: { published_at: "desc" },
  oldest: { published_at: "asc" },
  title: { title: "asc" },
};

/** Published entries for one collection Loop (W-308); a failing query lists nothing. */
async function loopEntries(loop: CollectionLoop): Promise<ThemePostFields[]> {
  try {
    const result = await getEmDashCollection(loop.collection, {
      status: "published",
      limit: loop.limit,
      orderBy: ORDER_BY[loop.order],
    } as never);
    return (result.entries ?? [])
      .map((entry) =>
        themePostFromEntry(entry as never, { permalinkPrefix: `/${loop.collection}` }),
      )
      .filter((post): post is ThemePostFields => post !== null);
  } catch {
    return [];
  }
}

/**
 * Live values a layout needs on this request: site settings and URL parameters for bindings
 * (W-307), and entries for collection Loops (W-308).
 */
export async function bindingDataFor(layout: Layout | null, url: URL): Promise<RequestData> {
  if (!layout) return {};
  const data: RequestData = {};
  const loops = collectCollectionLoops(layout);
  if (loops.length > 0) {
    const lists = await Promise.all(loops.map(loopEntries));
    data.collections = Object.fromEntries(loops.map((loop, i) => [loop.nodeId, lists[i] ?? []]));
  }
  if (layoutUsesSource(layout.root, "param")) data.params = paramsFromSearch(url.searchParams);
  if (layoutUsesSource(layout.root, "site")) {
    try {
      data.site = siteBindingValues(await getSiteSettings());
    } catch {
      data.site = {};
    }
  }
  return data;
}
