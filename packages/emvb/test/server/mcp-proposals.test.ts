import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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

type Result = {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: Record<string, unknown> };
};
const data = <T = Record<string, unknown>>(result: Result) => {
  if (!result.success) throw new Error(JSON.stringify(result));
  return result.data as T;
};
type Outline = {
  openInEditor: boolean;
  baseRevision: string;
  baseDesignRevision: string | null;
  outline: { id: string; children?: { id: string; label?: string }[] };
  pendingProposals: { proposalId: string; changes: number }[];
};

const newPage = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  return created.data.item.id;
};
const outlineOf = async (pageId: string) =>
  data<Outline>((await t.mcp("list_page_outline", { pageId })) as Result);
const rename = (text: string) => ({ kind: "update", id: "head0001", set: { props: { text } } });
const propose = async (pageId: string, ops: unknown[], base?: Partial<Outline>) => {
  const o = base ?? (await outlineOf(pageId));
  return (await t.mcp("propose_changes", {
    pageId,
    baseRevision: o.baseRevision,
    baseDesignRevision: o.baseDesignRevision,
    ops,
  })) as Result;
};
const layoutOf = async (pageId: string) =>
  data<{ rev: string; layout: { root: { children: { props: { text: string } }[] } } }>(
    (await t.mcp("get_layout", { pageId })) as Result,
  );

describe("proposal MCP tools (W-929, D-064)", () => {
  test("an agent outlines a page, proposes changes and reads them back; the page is not written", async () => {
    const pageId = await newPage();
    const before = await layoutOf(pageId);
    const o = await outlineOf(pageId);
    expect(o.baseRevision).toBe(before.rev);
    expect(o.outline.children?.[0]).toMatchObject({ id: "head0001", label: "Welcome" });
    expect(o.pendingProposals).toEqual([]);

    const created = data<{ proposalId: string; changes: number }>(
      await propose(pageId, [
        rename("Proposed"),
        {
          kind: "insert",
          parentId: "root0001",
          index: 1,
          node: { id: "text0001", type: "text", props: { text: "Added" } },
        },
      ]),
    );
    expect(created.changes).toBe(2);

    const after = await layoutOf(pageId);
    expect(after.rev).toBe(before.rev);
    expect(after.layout).toEqual(before.layout);
    expect((await outlineOf(pageId)).pendingProposals).toEqual([
      expect.objectContaining({ proposalId: created.proposalId, changes: 2 }),
    ]);

    const got = data<{ applies: boolean; ops: unknown[]; pageId: string }>(
      (await t.mcp("get_proposal", { proposalId: created.proposalId })) as Result,
    );
    expect(got).toMatchObject({ applies: true, pageId });
    expect(got.ops).toHaveLength(2);
  });

  test("a proposal on an old revision is refused with CONFLICT and both revisions", async () => {
    const pageId = await newPage();
    const old = await outlineOf(pageId);
    data(
      (await t.mcp("update_element", {
        pageId,
        expectedRev: old.baseRevision,
        nodeId: "head0001",
        set: { props: { text: "Edited meanwhile" } },
      })) as Result,
    );
    const result = await propose(pageId, [rename("Late")], old);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("CONFLICT");
    expect(result.error?.message).toContain("list_page_outline");
  });

  test("a change the page can't take is refused with its index, and nothing is stored", async () => {
    const pageId = await newPage();
    const result = await propose(pageId, [
      rename("Fine"),
      {
        kind: "insert",
        parentId: "head0001",
        index: 0,
        node: { id: "text0002", type: "text", props: { text: "Inside a heading" } },
      },
    ]);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_INPUT");
    expect(result.error?.message).toStartWith("Change 1:");
    expect((await outlineOf(pageId)).pendingProposals).toEqual([]);
  });

  test("get_proposal says when a stored proposal no longer applies", async () => {
    const pageId = await newPage();
    const o = await outlineOf(pageId);
    const { proposalId } = data<{ proposalId: string }>(await propose(pageId, [rename("P")], o));
    data(
      (await t.mcp("update_element", {
        pageId,
        expectedRev: o.baseRevision,
        nodeId: "head0001",
        set: { props: { text: "Moved on" } },
      })) as Result,
    );
    const got = data<{ applies: boolean; problem?: { code: string } }>(
      (await t.mcp("get_proposal", { proposalId })) as Result,
    );
    expect(got.applies).toBe(false);
    expect(got.problem?.code).toBe("STALE_BASE");
  });

  test("withdraw_proposal removes a proposal once; the page is untouched", async () => {
    const pageId = await newPage();
    const before = await layoutOf(pageId);
    const { proposalId } = data<{ proposalId: string }>(await propose(pageId, [rename("W")]));
    expect(data((await t.mcp("withdraw_proposal", { proposalId })) as Result)).toEqual({
      proposalId,
      withdrawn: true,
    });
    const again = (await t.mcp("withdraw_proposal", { proposalId })) as Result;
    expect(again.error?.code).toBe("NOT_FOUND");
    const gone = (await t.mcp("get_proposal", { proposalId })) as Result;
    expect(gone.error?.code).toBe("NOT_FOUND");
    expect((await outlineOf(pageId)).pendingProposals).toEqual([]);
    expect((await layoutOf(pageId)).rev).toBe(before.rev);
  });

  test("an unknown page is NOT_FOUND for both outline and proposals", async () => {
    expect(((await t.mcp("list_page_outline", { pageId: "nope" })) as Result).error?.code).toBe(
      "NOT_FOUND",
    );
    const result = await propose("nope", [rename("X")], {
      baseRevision: "r",
      baseDesignRevision: null,
    });
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  test("proposal tools obey the admin's master switch (D-055)", async () => {
    const pageId = await newPage();
    await t.agentSettings({ mcpEnabled: false });
    const result = (await t.mcp("list_page_outline", { pageId })) as Result;
    expect(result.error?.code).toBe("FORBIDDEN");
  });

  test("while the page is open in the editor, direct writes are refused and proposals still work", async () => {
    const pageId = await newPage();
    const presence = (open: boolean) =>
      t.route("presence", {
        user: userWithRole(ROLES.editor),
        body: { target: { collection: "emvb_pages", id: pageId }, open },
      });
    expect((await presence(true)).status).toBe(200);

    const o = await outlineOf(pageId);
    expect((await outlineOf(pageId)).openInEditor).toBe(true);
    const direct = (await t.mcp("update_element", {
      pageId,
      nodeId: "head0001",
      set: { props: { text: "Direct" } },
    })) as Result;
    expect(direct.error?.code).toBe("PAGE_OPEN");
    expect(direct.error?.message).toContain("propose_changes");
    expect((await layoutOf(pageId)).rev).toBe(o.baseRevision);
    expect((await propose(pageId, [rename("Reviewed")], o)).success).toBe(true);

    expect((await presence(false)).status).toBe(200);
    expect((await outlineOf(pageId)).openInEditor).toBe(false);
    expect(
      (
        (await t.mcp("update_element", {
          pageId,
          nodeId: "head0001",
          set: { props: { text: "Direct" } },
        })) as Result
      ).success,
    ).toBe(true);
  });

  test("the editor's save of accepted changes is labelled in the page's agent versions (W-930)", async () => {
    const pageId = await newPage();
    const editor = userWithRole(ROLES.editor);
    // A page made without saving has no revision to label yet.
    const none = await t.route("proposals/accepted", {
      user: editor,
      body: { target: { collection: "emvb_pages", id: pageId }, accepted: 2 },
    });
    expect(none.status).toBe(404);
    data(
      (await t.mcp("update_element", {
        pageId,
        nodeId: "head0001",
        set: { props: { text: "Saved by a person" } },
      })) as Result,
    );
    const recorded = await t.route("proposals/accepted", {
      user: editor,
      body: { target: { collection: "emvb_pages", id: pageId }, accepted: 2 },
    });
    expect(recorded.status).toBe(200);
    const revisionId = (recorded.body["data"] as { revisionId: string }).revisionId;
    const versions = await t.route("agents/page", { user: editor, body: { pageId } });
    expect((versions.body["data"] as { versions: unknown[] }).versions).toContainEqual(
      expect.objectContaining({ revisionId, tool: "accept_proposal" }),
    );
    const contributor = await t.route("proposals/accepted", {
      user: userWithRole(ROLES.contributor),
      body: { target: { collection: "emvb_pages", id: pageId }, accepted: 1 },
    });
    expect(contributor.status).toBe(403);
  });

  test("W-933 audit: the log says who proposed, which proposal, and who reviewed it", async () => {
    const pageId = await newPage();
    const agent = userWithRole(ROLES.editor);
    const { proposalId } = data<{ proposalId: string }>(
      await propose(pageId, [rename("A"), rename("B")]),
    );
    const reviewer = { ...userWithRole(ROLES.editor), id: "user-reviewer" };
    const closed = await t.route("proposals/withdraw", {
      user: reviewer,
      body: { id: proposalId, decision: { accepted: 1, rejected: 1 } },
    });
    expect(closed.status).toBe(200);
    const log = await t.route("agents", { user: userWithRole(ROLES.admin) });
    const activity = (log.body["data"] as { activity: Record<string, unknown>[] }).activity;
    expect(activity).toContainEqual(
      expect.objectContaining({
        tool: "propose_changes",
        pageId,
        proposalId,
        changes: 2,
        userId: agent.id,
      }),
    );
    expect(activity).toContainEqual(
      expect.objectContaining({
        tool: "review_proposal",
        pageId,
        proposalId,
        changes: 2,
        userId: "user-reviewer",
        summary: "Reviewed a proposal: 1 accepted, 1 rejected",
      }),
    );
  });
});
