import { describe, expect, test } from "bun:test";
import type { McpToolError } from "../../src/mcp/errors.ts";
import {
  callerKey,
  hitRateLimit,
  RATE_LIMITS,
  rateClassOf,
  type RateStore,
} from "../../src/mcp/rate-limit.ts";
import { TOOLS } from "../../src/mcp/tools.ts";
import { createTestRuntime } from "./runtime.ts";

/** An in-memory KV with compare-and-set, like EmDash's plugin KV. */
function memoryStore(): RateStore & { data: Map<string, { value: unknown; revision: string }> } {
  const data = new Map<string, { value: unknown; revision: string }>();
  let rev = 0;
  return {
    data,
    async getVersioned<T>(key: string) {
      const hit = data.get(key);
      return hit ? { value: hit.value as T, revision: hit.revision } : null;
    },
    async compareAndSet(key, expected, value) {
      await Promise.resolve();
      if ((data.get(key)?.revision ?? null) !== expected) return { applied: false };
      data.set(key, { value, revision: String(++rev) });
      return { applied: true };
    },
  };
}

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return error as McpToolError;
  }
  return null;
};

describe("MCP rate limits (W-478)", () => {
  test("W-754: the last second of a window says 1 second", async () => {
    const store = memoryStore();
    const now = () => 120_000 + 59_500;
    for (let i = 0; i < 60; i++) {
      // oxlint-disable-next-line no-await-in-loop -- one call after another
      await hitRateLimit(store, "t:a", "write", now);
    }
    const error = await refusal(hitRateLimit(store, "t:a", "write", now));
    expect(error?.message).toContain("Try again in 1 second.");
  });

  test("limits are 300 reads and 60 writes a minute and 10 publishes an hour", () => {
    expect(RATE_LIMITS.read).toMatchObject({ limit: 300, windowMs: 60_000 });
    expect(RATE_LIMITS.write).toMatchObject({ limit: 60, windowMs: 60_000 });
    expect(RATE_LIMITS.publish).toMatchObject({ limit: 10, windowMs: 3_600_000 });
    const cls = (name: string) =>
      rateClassOf(TOOLS.find((t) => t.name === name) ?? { readOnly: false, publish: "none" });
    expect(cls("get_layout")).toBe("read");
    expect(cls("add_element")).toBe("write");
    expect(cls("publish_page")).toBe("publish");
  });

  test("the 61st write in a minute is RATE_LIMITED with a retry-after hint; the next window is fresh", async () => {
    const store = memoryStore();
    let now = 120_000 + 15_000;
    for (let i = 0; i < 60; i++) {
      // oxlint-disable-next-line no-await-in-loop -- one call after another
      await hitRateLimit(store, "t:a", "write", () => now);
    }
    const error = await refusal(hitRateLimit(store, "t:a", "write", () => now));
    expect(error?.code).toBe("RATE_LIMITED");
    expect(error?.status).toBe(429);
    expect(error?.message).toContain("Try again in 45 seconds");
    expect(error?.details).toMatchObject({ retryAfterSeconds: 45 });
    // Another token and another class are counted apart.
    await hitRateLimit(store, "t:b", "write", () => now);
    await hitRateLimit(store, "t:a", "read", () => now);
    now = 180_000;
    await hitRateLimit(store, "t:a", "write", () => now);
  });

  test("parallel calls can't slip past the count", async () => {
    const store = memoryStore();
    const results = await Promise.allSettled(
      Array.from({ length: 70 }, () => hitRateLimit(store, "t:p", "write", () => 1000)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(60);
  });

  test("the caller key is a hash of the token, never the token", async () => {
    const req = (auth: string) => new Request("http://x", { headers: { authorization: auth } });
    const key = await callerKey(req("Bearer ec_pat_secret"), "u1");
    expect(key).toMatch(/^t:[0-9a-f]{24}$/);
    expect(key).not.toContain("secret");
    expect(await callerKey(req("Bearer ec_pat_other"), "u1")).not.toBe(key);
    expect(await callerKey(new Request("http://x"), "u1")).toBe("u:u1");
  });

  test("on the site, the 11th publish in an hour comes back as a RATE_LIMITED tool error", async () => {
    const t = await createTestRuntime();
    try {
      await t.agentSettings({ publishStyles: true });
      const codes: string[] = [];
      for (let i = 0; i < 11; i++) {
        // oxlint-disable-next-line no-await-in-loop -- one call after another
        const r = await t.mcp("publish_site_styles", {
          expectedPublishedRevision: "x",
          confirm: true,
        });
        codes.push(r.success ? "ok" : (r.error?.code ?? ""));
      }
      expect(codes.slice(0, 10)).not.toContain("RATE_LIMITED");
      expect(codes[10]).toBe("RATE_LIMITED");
      const last = await t.mcp("publish_site_styles", {
        expectedPublishedRevision: "x",
        confirm: true,
      });
      expect(last.error?.message).toMatch(/10 an hour\. Try again in \d+ seconds/);
    } finally {
      await t.dispose();
    }
  });
});
