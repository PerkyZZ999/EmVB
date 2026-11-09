import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { requestsPort } from "../../src/server/requests.ts";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

type Result = { success: boolean; data?: unknown; error?: { code: string; message: string } };
const data = <T>(r: Result) => {
  if (!r.success) throw new Error(JSON.stringify(r));
  return r.data as T;
};
const editor = userWithRole(ROLES.editor);
const newPage = async () =>
  ((await t.savePage({ title: "Home", layout: s1Page() })) as { data: { item: { id: string } } })
    .data.item.id;
const target = (id: string) => ({ collection: "emvb_pages", id });
const ask = (pageId: string, prompt: string, user = editor) =>
  t.route("requests/create", { user, body: { target: target(pageId), prompt } });
type Listed = {
  items: { id: string; status: string; proposalId?: string }[];
  agentSeenAt: string | null;
};
const listed = async (pageId: string) =>
  (await t.route("requests", { user: editor, body: target(pageId) })).body["data"] as Listed;
const requests = async (args: object = {}) =>
  data<{ requests: { requestId: string; pageId: string; prompt: string }[] }>(
    (await t.mcp("get_requests", args)) as Result,
  ).requests;

describe("prompt relay (W-931)", () => {
  test("a request written in the editor reaches the agent, who answers it with a proposal", async () => {
    const pageId = await newPage();
    expect((await listed(pageId)).agentSeenAt).toBeNull();
    expect((await ask(pageId, "  Make the headline friendlier  ")).status).toBe(200);
    await ask(pageId, "Then add a short intro");

    const open = await requests({ pageId });
    expect(open.map((r) => r.prompt)).toEqual([
      "Make the headline friendlier",
      "Then add a short intro",
    ]);
    expect((await listed(pageId)).agentSeenAt).not.toBeNull();

    const o = data<{ baseRevision: string; baseDesignRevision: string | null }>(
      (await t.mcp("list_page_outline", { pageId })) as Result,
    );
    const proposed = data<{ proposalId: string; answered: boolean }>(
      (await t.mcp("propose_changes", {
        pageId,
        baseRevision: o.baseRevision,
        baseDesignRevision: o.baseDesignRevision,
        requestId: open[0]?.requestId,
        ops: [{ kind: "update", id: "head0001", set: { props: { text: "Hi there!" } } }],
      })) as Result,
    );
    expect(proposed.answered).toBe(true);
    expect((await requests({ pageId })).map((r) => r.prompt)).toEqual(["Then add a short intro"]);
    expect((await listed(pageId)).items).toContainEqual(
      expect.objectContaining({ status: "answered", proposalId: proposed.proposalId }),
    );
  });

  test("a requestId that isn't open for this page is refused before anything is stored", async () => {
    const pageA = await newPage();
    const pageB = await newPage();
    await ask(pageA, "Change A");
    const [forA] = await requests({ pageId: pageA });
    const o = data<{ baseRevision: string; baseDesignRevision: string | null }>(
      (await t.mcp("list_page_outline", { pageId: pageB })) as Result,
    );
    const wrong = (await t.mcp("propose_changes", {
      pageId: pageB,
      baseRevision: o.baseRevision,
      baseDesignRevision: o.baseDesignRevision,
      requestId: forA?.requestId,
      ops: [{ kind: "update", id: "head0001", set: { props: { text: "x" } } }],
    })) as Result;
    expect(wrong.error?.code).toBe("NOT_FOUND");
    const outline = data<{ pendingProposals: unknown[] }>(
      (await t.mcp("list_page_outline", { pageId: pageB })) as Result,
    );
    expect(outline.pendingProposals).toEqual([]);
  });

  test("requests are short, a page holds five open ones, and they can be cancelled", async () => {
    const pageId = await newPage();
    expect((await ask(pageId, "   ")).status).toBe(422);
    expect((await ask(pageId, "x".repeat(2001))).status).toBe(422);
    // One at a time: each create counts the ones before it.
    /* oxlint-disable no-await-in-loop */
    for (const n of [1, 2, 3, 4, 5]) expect((await ask(pageId, `Request ${n}`)).status).toBe(200);
    /* oxlint-enable no-await-in-loop */
    const sixth = await ask(pageId, "Request 6");
    expect(sixth.status).toBe(422);
    const first = (await listed(pageId)).items.at(-1);
    expect(
      (await t.route("requests/cancel", { user: editor, body: { id: first?.id } })).status,
    ).toBe(200);
    expect((await ask(pageId, "Request 6")).status).toBe(200);
    expect((await ask(pageId, "From a contributor", userWithRole(ROLES.contributor))).status).toBe(
      403,
    );
  });

  test("requests older than a day aren't offered to agents", async () => {
    const rows = new Map<string, unknown>();
    const kv = new Map<string, unknown>();
    let clock = Date.parse("2026-11-08T00:00:00Z");
    const port = requestsPort(
      {
        get: async (id) => rows.get(id),
        put: async (id, d) => void rows.set(id, structuredClone(d)),
        delete: async (id) => rows.delete(id),
        query: async () => ({ items: [...rows].map(([id, d]) => ({ id, data: d })) }),
      },
      {
        get: async <T>(k: string) => (kv.get(k) as T) ?? null,
        set: async (k, v) => void kv.set(k, v),
      },
      () => clock,
    );
    await port.create(target("p"), "Old request", null);
    clock += 25 * 3_600_000;
    expect(await port.open()).toEqual([]);
    expect(await port.list(target("p"))).toHaveLength(1);
  });
});
