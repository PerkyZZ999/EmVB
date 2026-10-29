import { MAX_ARCHIVE_PAGE } from "../core/index.ts";
import type { ContentPort } from "./content-port.ts";

/**
 * W-916: how many published entries an archive has. EmDash 1.4's public query reports only
 * `hasMore`, so EmVB's own counter probes; a host can pass its own (a future EmDash count API).
 * `atLeast` is a count the caller already knows exists. Undefined = unknown, shown as "Page N".
 */
export type PostCounter = (query: {
  collection: string;
  where?: Record<string, string>;
  atLeast: number;
}) => Promise<number | undefined>;

/** Loops allow 50 per page, so no archive EmVB pages through holds more. */
const MAX_ENTRIES = MAX_ARCHIVE_PAGE * 50;
/** Doubling then halving over 5M entries takes about 46 one-row queries; past that, give up. */
const MAX_PROBES = 64;

/**
 * Counts with one-row queries through the same public collection query the archive uses (same
 * filter, published entries only): doubling past `atLeast` until a row is missing, then
 * halving. Read-only, about 2·log2(n) small queries, only on sites that opt in.
 */
export function probeCounter(content: ContentPort): PostCounter {
  return async ({ collection, where, atLeast }) => {
    let probes = 0;
    const exists = async (index: number): Promise<boolean> => {
      probes += 1;
      if (probes > MAX_PROBES) throw new Error("too many probes");
      const result = await content.getCollection(
        collection as never,
        {
          orderBy: { published_at: "desc" },
          limit: 1,
          offset: index,
          ...(where ? { where } : {}),
        } as never,
      );
      if (result.error) throw result.error;
      return (result.entries?.length ?? 0) > 0;
    };
    try {
      // `lo` is an index known to exist (or -1); `hi` one known not to.
      let lo = Math.max(0, atLeast) - 1;
      let step = Math.max(1, atLeast);
      let hi = lo + step;
      // oxlint-disable-next-line no-await-in-loop -- each probe depends on the last.
      while (hi < MAX_ENTRIES && (await exists(hi))) {
        lo = hi;
        step *= 2;
        hi = lo + step;
      }
      if (hi >= MAX_ENTRIES) return undefined;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        // oxlint-disable-next-line no-await-in-loop -- binary search.
        if (await exists(mid)) lo = mid;
        else hi = mid;
      }
      return lo + 1;
    } catch {
      return undefined;
    }
  };
}

/** Pages for `count` entries, or undefined when the count is unknown or below this page. */
export function totalPagesFor(
  count: number | undefined,
  perPage: number,
  page: number,
): number | undefined {
  if (count === undefined || !Number.isInteger(count) || count < 0) return undefined;
  const total = Math.min(Math.max(1, Math.ceil(count / perPage)), MAX_ARCHIVE_PAGE);
  return total >= page ? total : undefined;
}
