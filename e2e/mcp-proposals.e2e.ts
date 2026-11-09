import { expect, test } from "@playwright/test";
import { createPage, getPage, parsed, setUpEmvbOnce } from "./support/api.ts";
import { useAgentClient, type Outline } from "./support/mcp.ts";
import { openEditor, unique } from "./support/helpers.ts";

/**
 * W-929 acceptance: the in-repo MCP client (the emvb-mcp bridge's HTTP remote) drives the proposal
 * tools on EmDash's own MCP endpoint, and a page open in the editor refuses direct writes (D-064).
 */

const layout = {
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Agent target", level: 1 } }],
  },
};

test.describe.configure({ mode: "serial" });
setUpEmvbOnce();
const { call, ok } = useAgentClient();

test("an agent proposes changes over MCP; the page is untouched until a person reviews them", async ({
  request,
}) => {
  const pageId = await createPage(request, "Agent proposal", layout, `agent-${unique()}`);
  const before = await getPage(request, pageId);
  const outline = ok<Outline>(await call("list_page_outline", { pageId }));
  expect(outline.baseRevision).toBe(before.rev);
  expect(outline.openInEditor).toBe(false);

  const proposed = ok<{ proposalId: string; changes: number }>(
    await call("propose_changes", {
      pageId,
      baseRevision: outline.baseRevision,
      baseDesignRevision: outline.baseDesignRevision,
      ops: [{ kind: "update", id: "head0001", set: { props: { text: "Proposed title" } } }],
    }),
  );
  expect(proposed.changes).toBe(1);
  const got = ok<{ applies: boolean }>(
    await call("get_proposal", { proposalId: proposed.proposalId }),
  );
  expect(got.applies).toBe(true);

  const after = await getPage(request, pageId);
  expect(after.rev).toBe(before.rev);
  expect(parsed(after.data["layout"])).toEqual(parsed(before.data["layout"]));

  const stale = await call("propose_changes", {
    pageId,
    baseRevision: "not-the-revision",
    baseDesignRevision: outline.baseDesignRevision,
    ops: [{ kind: "delete", id: "head0001" }],
  });
  expect(stale.isError).toBe(true);
  expect(stale.content[0]?.text).toContain("list_page_outline");

  ok(await call("withdraw_proposal", { proposalId: proposed.proposalId }));
  expect(ok<Outline>(await call("list_page_outline", { pageId })).pendingProposals).toEqual([]);
});

test("while the page is open in the editor, a direct write is refused; after leaving, it lands", async ({
  page,
  request,
}) => {
  const pageId = await createPage(request, "Agent open page", layout, `agent-open-${unique()}`);
  await openEditor(page, pageId, "Agent target");
  await expect
    .poll(async () => ok<Outline>(await call("list_page_outline", { pageId })).openInEditor)
    .toBe(true);

  const refused = await call("update_element", {
    pageId,
    nodeId: "head0001",
    set: { props: { text: "Direct" } },
  });
  expect(refused.isError).toBe(true);
  expect(refused.content[0]?.text).toContain("propose_changes");

  const outline = ok<Outline>(await call("list_page_outline", { pageId }));
  ok(
    await call("propose_changes", {
      pageId,
      baseRevision: outline.baseRevision,
      baseDesignRevision: outline.baseDesignRevision,
      ops: [{ kind: "update", id: "head0001", set: { props: { text: "Reviewed" } } }],
    }),
  );

  await page.goto("/_emdash/admin");
  await expect
    .poll(async () => ok<Outline>(await call("list_page_outline", { pageId })).openInEditor)
    .toBe(false);
  ok(
    await call("update_element", {
      pageId,
      nodeId: "head0001",
      set: { props: { text: "Direct" } },
    }),
  );
});

test("W-932: the AI agents page's setup card checks the site's real MCP setup", async ({
  page,
}) => {
  // useAgentClient turned EmDash's tool approval and EmVB's agent access on for this spec.
  await page.goto("/_emdash/admin/plugins/emvb/agents");
  const card = page.locator('[data-emvb-agent-setup="ready"]');
  await expect(card).toBeVisible({ timeout: 20_000 });
  for (const step of ["endpoint", "tools", "access"])
    await expect(card.locator(`[data-emvb-setup-step="${step}"]`)).toHaveAttribute(
      "data-state",
      "done",
    );
  await expect(card.locator('[data-emvb-setup-step="token"]')).toContainText("mcp:tools:emvb");
  await expect(card).not.toContainText("ec_pat_");
});
