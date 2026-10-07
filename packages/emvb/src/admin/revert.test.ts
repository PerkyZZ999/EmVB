import { describe, expect, test } from "bun:test";
import type { Fetcher } from "./api.ts";
import { discardDraft } from "./content-api.ts";

describe("W-193 revert to published", () => {
  test("discardDraft posts the revision to the discard-draft route", async () => {
    const calls: { path: string; body: unknown; method?: string }[] = [];
    const fetcher: Fetcher = async (path, init) => {
      calls.push({ path, method: init?.method, body: JSON.parse(String(init?.body ?? "null")) });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    };
    await discardDraft(fetcher, "emvb_parts", "01 X", "rev1");
    expect(calls[0]?.path).toBe("/_emdash/api/content/emvb_parts/01%20X/discard-draft");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toEqual({ _rev: "rev1" });
  });

  test("a stale revision rejects instead of discarding silently", async () => {
    const fetcher: Fetcher = async () =>
      new Response(JSON.stringify({ error: { message: "conflict" } }), { status: 409 });
    await expect(discardDraft(fetcher, "emvb_pages", "01X", "old")).rejects.toThrow();
  });
});
