import { PLUGIN_ID } from "../constants.ts";
import type { AgentSettings } from "../mcp/settings.ts";
import { requestJson, type Fetcher } from "./api.ts";

export type AgentActivity = {
  id: string;
  at: string;
  tool: string;
  target: "page" | "styles" | "settings";
  pageId?: string;
  revisionId?: string;
  summary: string;
  userId: string | null;
  client?: string;
};

export type AgentsState = {
  settings: AgentSettings;
  revision: string | null;
  endpoint: string;
  activity: AgentActivity[];
  /** W-932: an agent has used this EmVB version's tools through EmDash's endpoint. */
  toolsServed?: boolean;
};

const base = `/_emdash/api/plugins/${PLUGIN_ID}`;

/** S-05 (W-995): the server may send the endpoint's path alone; it is resolved against this page. */
export async function loadAgents(fetcher: Fetcher): Promise<AgentsState> {
  const state = await requestJson<AgentsState>(fetcher, `${base}/agents`);
  return { ...state, endpoint: new URL(state.endpoint, globalThis.location?.href).toString() };
}

/** Saves the agent settings; the returned revision is the one the next save must send. */
export async function saveAgentSettings(
  fetcher: Fetcher,
  settings: AgentSettings,
  revision: string | null,
): Promise<string> {
  const body = await requestJson<{ revision: string }>(fetcher, `${base}/agents/save`, {
    method: "POST",
    body: { settings, revision },
  });
  return body.revision;
}

/** W-932: what stands between this site and a working agent connection. */
export type AgentSetup = {
  /** EmDash's MCP endpoint: off when `emdash({ mcp: true })` isn't set (the route 404s). */
  endpoint: "on" | "off" | "unknown";
  /**
   * EmVB's tools: used through EmDash's endpoint since this version ("served"); approved on the
   * Plugins screen but not used since ("approved": EmDash hides them after an update changes the
   * list, until an admin approves again); not approved ("off"); or unknown.
   */
  tools: "served" | "approved" | "off" | "unknown";
};

/**
 * W-932: checks EmDash's MCP route exists (it answers a signed-in browser 401, a missing route
 * 404) and whether EmVB's tools are approved. Sends no token and never reads or shows one.
 */
export async function checkAgentSetup(fetcher: Fetcher, served: boolean): Promise<AgentSetup> {
  let endpoint: AgentSetup["endpoint"] = "unknown";
  try {
    const response = await fetcher("/_emdash/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    endpoint = response.status === 404 ? "off" : response.status < 500 ? "on" : "unknown";
  } catch {
    /* unknown */
  }
  if (endpoint === "off") return { endpoint, tools: "off" };
  if (served) return { endpoint, tools: "served" };
  const approved = await requestJson<{ item?: { mcpToolsEnabled?: boolean } }>(
    fetcher,
    `/_emdash/api/admin/plugins/${PLUGIN_ID}`,
  ).then(
    (data) => data.item?.mcpToolsEnabled,
    () => undefined,
  );
  return { endpoint, tools: approved === undefined ? "unknown" : approved ? "approved" : "off" };
}
