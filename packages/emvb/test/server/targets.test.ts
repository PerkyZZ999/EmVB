import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { requestsPort } from "../../src/server/requests.ts";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

// S-09 (W-998): requests, presence and agent proposals accepted any collection and id, expired
// requests stayed in storage, and any agent could withdraw anyone's proposal.

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

type Result = { success: boolean; data?: unknown; error?: { code: string; message: string } };
const editor = userWithRole(ROLES.editor);
const newPage = async () =>
  ((await t.savePage({ title: "Home", layout: s1Page() })) as { data: { item: { id: string } } })
    .data.item.id;
const ask = (collection: string, id: string, prompt = "Hello") =>
  t.route("requests/create", { user: editor, body: { target: { collection, id }, prompt } });

describe("targets must be real EmVB entries (W-998, S-09)", () => {
  test("a request names an existing page, not a made-up id or collection", async () => {
    const pageId = await newPage();
    expect((await ask("emvb_pages", pageId)).status).toBe(200);
    expect((await ask("emvb_pages", "01NOSUCHPAGE")).status).toBe(404);
    expect((await ask("posts", pageId)).status).toBe(404);
  });

  test("a presence lease needs an existing page; closing one never does", async () => {
    const pageId = await newPage();
    const presence = (id: string, open: boolean) =>
      t.route("presence", {
        user: editor,
        body: { target: { collection: "emvb_pages", id }, open },
      });
    expect((await presence(pageId, true)).status).toBe(200);
    expect((await presence("01NOSUCHPAGE", true)).status).toBe(404);
    expect((await presence("01NOSUCHPAGE", false)).status).toBe(200);
  });

  test("one person has at most 20 waiting requests across the site", async () => {
    const pages = await Promise.all([1, 2, 3, 4, 5].map(() => newPage()));
    /* oxlint-disable no-await-in-loop -- each create counts the ones before it */
    for (const pageId of pages.slice(0, 4))
      for (const n of [1, 2, 3, 4, 5])
        expect((await ask("emvb_pages", pageId, `R${n}`)).status).toBe(200);
    /* oxlint-enable no-await-in-loop */
    const over = await ask("emvb_pages", pages[4] ?? "");
    expect(over.status).toBe(422);
    expect(JSON.stringify(over.body)).toContain("You already have 20 requests waiting");
  });

  test("expired requests are deleted as new ones come in", async () => {
    const rows = new Map<string, unknown>();
    let clock = Date.parse("2026-11-12T00:00:00Z");
    const port = requestsPort(
      {
        get: async (id) => rows.get(id),
        put: async (id, d) => void rows.set(id, structuredClone(d)),
        delete: async (id) => rows.delete(id),
        query: async () => ({ items: [...rows].map(([id, d]) => ({ id, data: d })) }),
      },
      { get: async () => null, set: async () => undefined },
      () => clock,
    );
    await port.create({ collection: "emvb_pages", id: "a" }, "Old one", "u1");
    await port.create({ collection: "emvb_pages", id: "b" }, "Old two", "u2");
    clock += 25 * 3_600_000;
    await port.create({ collection: "emvb_pages", id: "a" }, "New", "u1");
    expect([...rows.values()].map((r) => (r as { prompt: string }).prompt)).toEqual(["New"]);
  });

  test("an agent withdraws only its own person's proposals; an admin's agent any", async () => {
    const pageId = await newPage();
    const outline = (
      (await t.mcp("list_page_outline", { pageId })) as Result & {
        data: { baseRevision: string; baseDesignRevision: string | null };
      }
    ).data;
    const proposed = (await t.mcp("propose_changes", {
      pageId,
      baseRevision: outline.baseRevision,
      baseDesignRevision: outline.baseDesignRevision,
      ops: [{ kind: "update", id: "head0001", set: { props: { text: "Hi" } } }],
    })) as Result & { data: { proposalId: string } };
    const id = proposed.data.proposalId;
    const other = { ...userWithRole(ROLES.editor), id: "user-other-editor" };
    const byOther = (await t.mcp("withdraw_proposal", { proposalId: id }, other)) as Result;
    expect(byOther.error?.code).toBe("FORBIDDEN");
    const byAdmin = (await t.mcp(
      "withdraw_proposal",
      { proposalId: id },
      userWithRole(ROLES.admin),
    )) as Result;
    expect(byAdmin.success).toBe(true);
  });
});
