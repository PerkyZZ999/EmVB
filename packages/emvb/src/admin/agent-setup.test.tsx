import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { mount, settle, unmount } from "../../test/dom/mount.ts";
import type { Fetcher } from "./api.ts";
import { checkAgentSetup, loadAgents } from "./agents-api.ts";
import { AgentSetupCard } from "./pages/AgentSetup.tsx";

afterEach(unmount);

const site = (opts: {
  mcp: 401 | 404 | 500 | "throw";
  approved?: boolean | "fail";
}): Fetcher & { calls: string[] } => {
  const calls: string[] = [];
  const fetcher = (async (path: string, init?: RequestInit) => {
    calls.push(path);
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i);
    if (path === "/_emdash/api/mcp") {
      if (opts.mcp === "throw") throw new TypeError("network");
      return Response.json({ error: { code: "X" } }, { status: opts.mcp });
    }
    if (path === "/_emdash/api/admin/plugins/emvb") {
      if (opts.approved === "fail") return Response.json({ error: { code: "X" } }, { status: 500 });
      return Response.json({ data: { item: { mcpToolsEnabled: opts.approved ?? false } } });
    }
    return new Response("?", { status: 404 });
  }) as Fetcher & { calls: string[] };
  fetcher.calls = calls;
  return fetcher;
};

describe("agent setup check (W-932)", () => {
  test("MCP off in EmDash's config: the route is missing", async () => {
    expect(await checkAgentSetup(site({ mcp: 404 }), false)).toEqual({
      endpoint: "off",
      tools: "off",
    });
  });
  test("the route answers a signed-in browser 401, so it's on; used tools count as done", async () => {
    expect(await checkAgentSetup(site({ mcp: 401 }), true)).toEqual({
      endpoint: "on",
      tools: "served",
    });
  });
  test("approved but unused since this version, or never approved", async () => {
    expect(await checkAgentSetup(site({ mcp: 401, approved: true }), false)).toEqual({
      endpoint: "on",
      tools: "approved",
    });
    expect(await checkAgentSetup(site({ mcp: 401, approved: false }), false)).toEqual({
      endpoint: "on",
      tools: "off",
    });
  });
  test("a failed check says it couldn't tell, never that all is well", async () => {
    expect(await checkAgentSetup(site({ mcp: "throw", approved: "fail" }), false)).toEqual({
      endpoint: "unknown",
      tools: "unknown",
    });
    expect((await checkAgentSetup(site({ mcp: 500 }), false)).endpoint).toBe("unknown");
  });

  test("the card marks each step and names its state for screen readers; Check again re-checks", async () => {
    const fetcher = site({ mcp: 401, approved: true });
    await mount(<AgentSetupCard fetcher={fetcher} agentsOn={false} />);
    await settle();
    const step = (key: string) =>
      document.querySelector<HTMLElement>(`[data-emvb-setup-step="${key}"]`);
    expect(step("endpoint")?.dataset.state).toBe("done");
    expect(step("tools")?.dataset.state).toBe("unknown");
    expect(step("tools")?.textContent).toContain("approve them again");
    expect(step("access")?.dataset.state).toBe("todo");
    expect(step("token")?.dataset.state).toBe("unknown");
    expect(step("endpoint")?.querySelector("h3")?.textContent).toBe(
      "EmDash's MCP endpoint is on: Done",
    );
    expect(document.body.textContent).not.toMatch(/ec_pat_|Bearer /);
    const before = fetcher.calls.length;
    await act(async () =>
      document.querySelector<HTMLButtonElement>("[data-emvb-setup-recheck]")?.click(),
    );
    await settle();
    expect(fetcher.calls.length).toBeGreaterThan(before);
  });
});

test("W-995: an endpoint path from the server is shown as a full URL on this admin's address", async () => {
  const state = { settings: {}, revision: null, activity: [] };
  const fetcher = (async () =>
    Response.json({ data: { ...state, endpoint: "/_emdash/api/mcp" } })) as Fetcher;
  const loaded = await loadAgents(fetcher);
  expect(loaded.endpoint).toBe(new URL("/_emdash/api/mcp", location.href).toString());
  expect(loaded.endpoint.startsWith("http")).toBe(true);
});
