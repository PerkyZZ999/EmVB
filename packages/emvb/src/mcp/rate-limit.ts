import { McpToolError } from "./errors.ts";

/** What a tool call counts against: reads, draft writes or publishes (W-478). */
export type RateClass = "read" | "write" | "publish";

/** Per token: 300 reads and 60 writes a minute, 10 publishes an hour. */
export const RATE_LIMITS: Record<RateClass, { limit: number; windowMs: number; per: string }> = {
  read: { limit: 300, windowMs: 60_000, per: "a minute" },
  write: { limit: 60, windowMs: 60_000, per: "a minute" },
  publish: { limit: 10, windowMs: 3_600_000, per: "an hour" },
};

export const rateClassOf = (def: { readOnly: boolean; publish?: string }): RateClass =>
  def.publish ? "publish" : def.readOnly ? "read" : "write";

/** The part of EmDash's plugin KV the limiter needs. It lives in the site database, so it holds
 * across Node processes and Cloudflare isolates alike. */
export interface RateStore {
  getVersioned<T>(key: string): Promise<{ value: T; revision: string } | null>;
  compareAndSet(
    key: string,
    expectedRevision: string | null,
    value: unknown,
  ): Promise<{ applied: boolean }>;
}

type Window = { w: number; n: number };

const NOUNS: Record<RateClass, string> = { read: "reads", write: "changes", publish: "publishes" };

/**
 * Counts one call for `who` in a fixed window and refuses it with RATE_LIMITED once the window is
 * full. Compare-and-set keeps parallel calls from slipping through on a stale count.
 */
export async function hitRateLimit(
  store: RateStore,
  who: string,
  cls: RateClass,
  now: () => number = Date.now,
): Promise<void> {
  const { limit, windowMs, per } = RATE_LIMITS[cls];
  const key = `ratelimit:${cls}:${who}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    const at = now();
    const w = Math.floor(at / windowMs) * windowMs;
    // oxlint-disable-next-line no-await-in-loop -- compare-and-set retries in turn
    const stored = await store.getVersioned<Window>(key);
    const current = stored && stored.value?.w === w ? stored.value.n : 0;
    if (current >= limit) {
      // W-754: "1 second", not "1 seconds", in the last second of a window.
      const retryAfterSeconds = Math.max(1, Math.ceil((w + windowMs - at) / 1000));
      throw new McpToolError(
        "RATE_LIMITED",
        `Too many ${NOUNS[cls]}: this token may make ${limit} ${per}. Try again in ${retryAfterSeconds} ${retryAfterSeconds === 1 ? "second" : "seconds"}.`,
        { retryAfterSeconds, limit, per },
      );
    }
    // oxlint-disable-next-line no-await-in-loop -- compare-and-set retries in turn
    const write = await store.compareAndSet(key, stored?.revision ?? null, { w, n: current + 1 });
    if (write.applied) return;
  }
  throw new McpToolError(
    "RATE_LIMITED",
    "Too many calls at once from this token. Try again in 1 second.",
    { retryAfterSeconds: 1 },
  );
}

/** A short, non-reversible id for the caller's token, so no token is ever stored (W-478). */
export async function callerKey(request: Request | undefined, userId: string | null) {
  const auth = request?.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  if (token) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return `t:${[...new Uint8Array(digest)]
      .slice(0, 12)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return userId ? `u:${userId}` : "anonymous";
}
