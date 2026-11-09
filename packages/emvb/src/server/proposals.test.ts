import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { emptyDesign } from "../core/schema/design.ts";
import { LAYOUT_SCHEMA_VERSION } from "../core/schema/layout.ts";
import type { Proposal, ProposalBase, ProposalRecord } from "../core/proposals.ts";
import { MAX_PENDING_PER_PAGE, MAX_PROPOSALS } from "../core/limits.ts";
import { proposalsPort } from "./proposals.ts";
import { createTestRuntime, ROLES, userWithRole } from "../../test/server/runtime.ts";

const base = (): ProposalBase => ({
  revision: "page-1",
  designRevision: null,
  design: emptyDesign(),
  layout: {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: "root",
      type: "container",
      props: {},
      children: [{ id: "title", type: "heading", props: { text: "Before", level: 1 } }],
    },
  },
});
const proposal = (): Proposal => ({
  version: 1,
  target: { collection: "emvb_pages", id: "page-a" },
  baseRevision: "page-1",
  baseDesignRevision: null,
  ops: [{ kind: "update", id: "title", set: { props: { text: "Proposed" } } }],
});
function memory(
  readBase: (target: Proposal["target"]) => Promise<ProposalBase | null> = async () => base(),
) {
  const rows = new Map<string, unknown>();
  const store = {
    get: async (id: string) => structuredClone(rows.get(id)),
    put: async (id: string, record: ProposalRecord) => {
      rows.set(id, structuredClone(record));
    },
    delete: async (id: string) => rows.delete(id),
    query: async () => ({
      items: [...rows]
        .map(([id, data]) => ({ id, data: structuredClone(data) }))
        .slice(0, MAX_PROPOSALS),
      hasMore: rows.size > MAX_PROPOSALS,
    }),
  };
  return { rows, port: proposalsPort(store, readBase) };
}

describe("proposal storage port (W-928)", () => {
  test("round-trip preserves ordered ops, filters targets, previews selections and withdraws without writing the page", async () => {
    const b = base();
    const before = structuredClone(b);
    const { port, rows } = memory(async () => b);
    const p = proposal();
    p.ops.push({
      kind: "insert",
      parentId: "root",
      index: 1,
      node: { id: "new1", type: "text", props: { text: "Next" } },
    });
    const made = await port.create(p);
    expect(made.ok).toBe(true);
    if (!made.ok) throw new Error(made.reason);
    expect(made.record.proposal).toEqual(p);
    expect(await port.get(made.id)).toEqual(made);
    expect(await port.list(p.target)).toEqual([{ id: made.id, record: made.record }]);
    expect(await port.list({ ...p.target, collection: "emvb_theme_parts" })).toEqual([]);
    const preview = await port.prepare(made.id, [1]);
    expect(preview?.ok && preview.layout.root.children.length).toBe(2);
    expect(b).toEqual(before);
    expect(rows.size).toBe(1);
    expect(await port.withdraw(made.id)).toBe(true);
    expect(await port.get(made.id)).toBeNull();
    expect(await port.withdraw(made.id)).toBe(false);
  });

  test("invalid ops and stale bases store nothing and stale stored proposals cannot prepare", async () => {
    let b = base();
    const { port, rows } = memory(async () => b);
    const invalid = proposal();
    invalid.ops[0] = { kind: "update", id: "title", set: { props: { level: 99 } } };
    expect((await port.create(invalid)).ok).toBe(false);
    expect(rows.size).toBe(0);
    expect(await port.create({ ...proposal(), baseRevision: "old" })).toMatchObject({
      ok: false,
      code: "STALE_BASE",
    });
    expect(rows.size).toBe(0);
    const made = await port.create(proposal());
    if (!made.ok) throw new Error(made.reason);
    b = { ...b, revision: "page-2" };
    expect(await port.prepare(made.id)).toMatchObject({
      ok: false,
      code: "STALE_BASE",
      expectedRevision: "page-1",
      currentRevision: "page-2",
    });
    expect(rows.size).toBe(1);
  });

  test("a base changing during creation is rechecked before persistence", async () => {
    let reads = 0;
    const { port, rows } = memory(async () => ({
      ...base(),
      revision: ++reads === 1 ? "page-1" : "page-2",
    }));
    expect(await port.create(proposal())).toMatchObject({ ok: false, code: "STALE_BASE" });
    expect(rows.size).toBe(0);
  });

  test("storage caps, missing targets and damaged records are refused", async () => {
    const { port, rows } = memory();
    const made = await port.create(proposal());
    if (!made.ok) throw new Error(made.reason);
    rows.set(made.id, {
      proposal: { ...proposal(), version: 9 },
      createdAt: made.record.createdAt,
    });
    expect(await port.get(made.id)).toMatchObject({ ok: false, code: "INVALID_PROPOSAL" });
    expect(await port.list(proposal().target)).toEqual([]);
    expect(await port.get("bad")).toBeNull();
    // Many pages fill the site-wide store (one page alone stops at MAX_PENDING_PER_PAGE).
    for (let i = rows.size; i < MAX_PROPOSALS; i++) {
      const other = structuredClone(made.record);
      other.proposal.target.id = `other-${i}`;
      rows.set(String(i).padStart(16, "0"), other);
    }
    expect(await port.create(proposal())).toMatchObject({ ok: false, code: "PROPOSALS_FULL" });
    expect(rows.size).toBe(MAX_PROPOSALS);
    expect(await memory(async () => null).port.create(proposal())).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("per-page proposal cap (W-933)", () => {
  test("one page holds at most MAX_PENDING_PER_PAGE proposals; other pages still take theirs", async () => {
    const { port } = memory();
    // One at a time: each create counts the ones before it.
    /* oxlint-disable no-await-in-loop */
    for (let i = 0; i < MAX_PENDING_PER_PAGE; i++) {
      const made = await port.create(proposal());
      expect(made.ok).toBe(true);
    }
    /* oxlint-enable no-await-in-loop */
    const full = await port.create(proposal());
    expect(full).toMatchObject({ ok: false, code: "PROPOSALS_FULL" });
    if (!full.ok) expect(full.reason).toContain("This page already has");
    const other = proposal();
    other.target.id = "page-b";
    expect((await port.create(other)).ok).toBe(true);
  });
});

describe("plugin-local proposal routes (W-928)", () => {
  let t: Awaited<ReturnType<typeof createTestRuntime>>;
  beforeEach(async () => {
    t = await createTestRuntime();
    await t.agentSettings();
  });
  afterEach(async () => {
    await t.dispose();
  });
  const editor = () => userWithRole(ROLES.editor);
  async function pageProposal() {
    const made = (await t.savePage({ title: "Proposal base", layout: base().layout })) as {
      data: { item: { id: string } };
    };
    const id = made.data.item.id;
    const page = (await t.mcp("get_layout", { pageId: id }, editor())) as {
      data: { rev: string; layout: unknown };
    };
    return { ...proposal(), target: { collection: "emvb_pages", id }, baseRevision: page.data.rev };
  }

  test("editor transport persists in plugin storage, round-trips and never changes or publishes the page", async () => {
    const p = await pageProposal();
    const saved = await t.route("proposals/create", { user: editor(), body: { proposal: p } });
    expect(saved.status).toBe(200);
    const data = saved.body.data as { id: string; record: ProposalRecord };
    expect(data.record.proposal).toEqual(p);
    const got = await t.route("proposals/get", { user: editor(), body: { id: data.id } });
    expect(got.status).toBe(200);
    expect(got.body.data).toEqual(saved.body.data);
    const list = await t.route("proposals", { user: editor(), body: p.target });
    expect((list.body.data as { items: unknown[] }).items).toEqual([
      { id: data.id, record: data.record },
    ]);
    const after = (await t.mcp("get_layout", { pageId: p.target.id }, editor())) as {
      data: { rev: string; layout: unknown };
    };
    expect(after.data.rev).toBe(p.baseRevision);
    expect(after.data.layout).toEqual(base().layout);
    const removed = await t.route("proposals/withdraw", { user: editor(), body: { id: data.id } });
    expect(removed.status).toBe(200);
    expect((await t.route("proposals/get", { user: editor(), body: { id: data.id } })).status).toBe(
      404,
    );
  });

  test("routes enforce editor rights, CSRF, server validation and stale-base refusal", async () => {
    const p = await pageProposal();
    const rights: Promise<void>[] = [];
    for (const role of [ROLES.subscriber, ROLES.contributor, ROLES.author]) {
      for (const [path, body] of [
        ["proposals", p.target],
        ["proposals/create", { proposal: p }],
        ["proposals/get", { id: "0123456789abcdef" }],
        ["proposals/withdraw", { id: "0123456789abcdef" }],
      ] as const)
        rights.push(
          t.route(path, { user: userWithRole(role), body }).then((result) => {
            expect(result.status).toBe(403);
          }),
        );
    }
    await Promise.all(rights);
    expect((await t.route("proposals/create", { body: { proposal: p } })).status).toBe(401);
    expect(
      (await t.route("proposals/create", { user: editor(), csrf: false, body: { proposal: p } }))
        .status,
    ).toBe(403);
    expect(
      (
        await t.route("proposals/create", {
          user: editor(),
          body: {
            proposal: {
              ...p,
              ops: [{ kind: "update", id: "title", set: { props: { level: 99 } } }],
            },
          },
        })
      ).status,
    ).toBe(422);
    const stale = await t.route("proposals/create", {
      user: editor(),
      body: { proposal: { ...p, baseRevision: "old" } },
    });
    expect(stale.status).toBe(409);
    expect(JSON.stringify(stale.body)).toContain("Rebase:");
    const list = await t.route("proposals", { user: editor(), body: p.target });
    expect((list.body.data as { items: unknown[] }).items).toEqual([]);
  });
});
