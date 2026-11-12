import { describe, expect, test } from "bun:test";
import { endpointFor } from "../../src/server/agent-settings.ts";
import { loadFormFieldsFromSite } from "../../src/server/mcp-routes.ts";
import { trustedOrigin } from "../../src/server/site-origin.ts";

// S-05 (W-995): describe_page read form definitions from `new URL(path, ctx.request.url)`, so a
// caller who chose the Host header chose where the server connected, redirects followed.

function recorder() {
  const calls: { url: string; redirect: RequestRedirect | undefined }[] = [];
  const fetcher = (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), redirect: init?.redirect });
    return new Response(JSON.stringify({ data: { pages: [{ fields: [{ name: "email" }] }] } }));
  }) as typeof fetch;
  return { calls, fetcher };
}

describe("server requests go to the configured site only (W-995, S-05)", () => {
  test("form definitions come from the configured origin and follow no redirect", async () => {
    const { calls, fetcher } = recorder();
    const found = await loadFormFieldsFromSite(
      trustedOrigin("https://site.example/blog/"),
      ["contact"],
      fetcher,
    );
    expect(calls).toEqual([
      {
        url: "https://site.example/_emdash/api/plugins/emdash-forms/definition",
        redirect: "error",
      },
    ]);
    expect(found.get("contact")?.map((f) => f.name)).toEqual(["email"]);
  });

  test("without a configured site URL nothing is fetched", async () => {
    const { calls, fetcher } = recorder();
    for (const siteUrl of [undefined, "", "not a url", "javascript:alert(1)", "file:///etc"]) {
      // oxlint-disable-next-line no-await-in-loop
      await loadFormFieldsFromSite(trustedOrigin(siteUrl), ["contact"], fetcher);
    }
    expect(calls).toEqual([]);
  });

  test("the MCP endpoint shown to admins uses the configured origin, or only its path", () => {
    expect(endpointFor("https://site.example/sub/")).toBe("https://site.example/_emdash/api/mcp");
    expect(endpointFor(undefined)).toBe("/_emdash/api/mcp");
    expect(endpointFor("ftp://site.example")).toBe("/_emdash/api/mcp");
  });
});

test("W-995: the Agents tab shows the configured site's endpoint, whatever the request's host", async () => {
  const { createTestRuntime, ROLES, userWithRole } = await import("./runtime.ts");
  const t = await createTestRuntime();
  try {
    const response = await t.route("agents", { user: userWithRole(ROLES.admin) });
    expect((response.body["data"] as { endpoint: string }).endpoint).toBe(
      "http://site.test/_emdash/api/mcp",
    );
  } finally {
    await t.dispose();
  }
});
