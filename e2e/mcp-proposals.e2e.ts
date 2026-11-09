import { expect, test, type APIRequestContext } from "@playwright/test";
import { httpRemote, type Remote, type ToolResult } from "../packages/emvb-mcp/src/remote.ts";
import { api, createPage, getPage, parsed, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, unique } from "./support/helpers.ts";

/**
 * W-929 acceptance: the in-repo MCP client (the emvb-mcp bridge's HTTP remote) drives the proposal
 * tools on EmDash's own MCP endpoint, and a page open in the editor refuses direct writes (D-064).
 */

const AGENTS = "/_emdash/api/plugins/emvb/agents";
const layout = {
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Agent target", level: 1 } }],
  },
};

type Settings = { mcpEnabled: boolean; publishPages: boolean; publishStyles: boolean };
let remote: Remote | undefined;
let tokenId: string | undefined;
let restore: Settings | undefined;

test.describe.configure({ mode: "serial" });
setUpEmvbOnce();

async function saveSettings(request: APIRequestContext, settings: Settings) {
  const current = await api(request, "GET", AGENTS);
  const revision =
    (current.json?.["data"] as { revision?: string | null } | undefined)?.revision ?? null;
  const saved = await api(request, "POST", `${AGENTS}/save`, { settings, revision });
  expect(saved.status).toBe(200);
}

test.beforeAll(async ({ request, baseURL }) => {
  // The site's half of agent access: EmDash's tool approval and EmVB's own switch (D-055).
  expect(
    (await api(request, "PUT", "/_emdash/api/admin/plugins/emvb/mcp", { enabled: true })).status,
  ).toBe(200);
  const before = await api(request, "GET", AGENTS);
  restore = (before.json?.["data"] as { settings?: Settings } | undefined)?.settings;
  expect(restore).toBeTruthy();
  await saveSettings(request, { ...(restore as Settings), mcpEnabled: true });
  const created = await api(request, "POST", "/_emdash/api/admin/api-tokens", {
    name: `e2e W-929 ${unique()}`,
    scopes: ["mcp:tools:emvb"],
  });
  expect(created.status).toBe(201);
  const data = created.json?.["data"] as { token: string; info: { id: string } };
  tokenId = data.info.id;
  remote = httpRemote(new URL("/_emdash/api/mcp", baseURL), data.token, "e2e");
});

test.afterAll(async ({ request }) => {
  await remote?.close();
  if (tokenId) await api(request, "DELETE", `/_emdash/api/admin/api-tokens/${tokenId}`);
  if (restore) await saveSettings(request, restore);
});

const call = async (name: string, args: Record<string, unknown>) => {
  if (!remote) throw new Error("no MCP client");
  return remote.call(`emvb__${name}`, args);
};
const ok = <T>(result: ToolResult) => {
  expect(result.isError ?? false, result.content[0]?.text).toBe(false);
  return result.structuredContent as T;
};
type Outline = {
  baseRevision: string;
  baseDesignRevision: string | null;
  openInEditor: boolean;
  pendingProposals: { proposalId: string }[];
};

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
