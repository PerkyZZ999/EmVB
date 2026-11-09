import { expect, test, type APIRequestContext } from "@playwright/test";
import { httpRemote, type Remote, type ToolResult } from "../../packages/emvb-mcp/src/remote.ts";
import { api } from "./api.ts";
import { unique } from "./helpers.ts";

const AGENTS = "/_emdash/api/plugins/emvb/agents";
type Settings = { mcpEnabled: boolean; publishPages: boolean; publishStyles: boolean };

async function saveSettings(request: APIRequestContext, settings: Settings) {
  const current = await api(request, "GET", AGENTS);
  const revision =
    (current.json?.["data"] as { revision?: string | null } | undefined)?.revision ?? null;
  const saved = await api(request, "POST", `${AGENTS}/save`, { settings, revision });
  expect(saved.status).toBe(200);
}

/** A tool result's structured output, after checking the tool didn't fail. */
const ok = <T>(result: ToolResult) => {
  expect(result.isError ?? false, result.content[0]?.text).toBe(false);
  return result.structuredContent as T;
};

export type Outline = {
  baseRevision: string;
  baseDesignRevision: string | null;
  openInEditor: boolean;
  pendingProposals: { proposalId: string }[];
};

/**
 * W-929/W-930: an MCP client for the spec, as an agent would connect. Turns on EmDash's plugin
 * tool approval and EmVB's agent switch (D-055), creates an `mcp:tools:emvb` token, connects the
 * emvb-mcp bridge's HTTP remote, and undoes all of it after the spec.
 */
export function useAgentClient() {
  let remote: Remote | undefined;
  let tokenId: string | undefined;
  let restore: Settings | undefined;
  test.beforeAll(async ({ request, baseURL }) => {
    expect(
      (await api(request, "PUT", "/_emdash/api/admin/plugins/emvb/mcp", { enabled: true })).status,
    ).toBe(200);
    const before = await api(request, "GET", AGENTS);
    restore = (before.json?.["data"] as { settings?: Settings } | undefined)?.settings;
    expect(restore).toBeTruthy();
    await saveSettings(request, { ...(restore as Settings), mcpEnabled: true });
    const created = await api(request, "POST", "/_emdash/api/admin/api-tokens", {
      name: `e2e agent ${unique()}`,
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
  return { call, ok };
}
