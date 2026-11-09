import { describe, expect, test } from "bun:test";
import type { Remote, ToolResult } from "../src/remote.ts";
import {
  briefFor,
  parseWatchOptions,
  watchOnce,
  WatchOptionsError,
  type Request,
  type RunAgent,
} from "../src/watch.ts";

const site = new URL("https://example.com");
const req = (n: number, prompt = `Request ${n}`): Request => ({
  requestId: `${n}`.padStart(16, "0"),
  pageId: `page-${n}`,
  prompt,
  createdAt: `2026-11-08T0${n}:00:00Z`,
});

/** A site whose open requests are answered when the agent "runs". */
function fakeSite(open: Request[], answer = true) {
  const calls: string[] = [];
  const remote: Remote = {
    call: async (name) => {
      calls.push(name);
      return {
        content: [{ type: "text", text: "" }],
        structuredContent: { requests: [...open] },
      } as ToolResult;
    },
    close: async () => undefined,
  };
  const runs: { input: string; env: Record<string, string> }[] = [];
  const run: RunAgent = async (input, env) => {
    runs.push({ input, env });
    if (answer)
      open.splice(
        open.findIndex((r) => r.requestId === env["EMVB_REQUEST_ID"]),
        1,
      );
    return { code: 0, timedOut: false };
  };
  return { remote, run, runs, calls };
}

describe("emvb-mcp watch (W-934)", () => {
  test("runs the agent once per open request, oldest first, and never twice", async () => {
    const s = fakeSite([req(1), req(2)]);
    const logs: string[] = [];
    const deps = {
      ...s,
      site,
      timeoutMs: 1000,
      log: (m: string) => logs.push(m),
      handled: new Set<string>(),
    };
    expect(await watchOnce(deps)).toBe(2);
    expect(s.runs.map((r) => r.env["EMVB_PAGE_ID"])).toEqual(["page-1", "page-2"]);
    expect(s.runs[0]?.env).toEqual({
      EMVB_SITE: "https://example.com",
      EMVB_PAGE_ID: "page-1",
      EMVB_REQUEST_ID: "0000000000000001",
    });
    expect(logs.filter((l) => l.endsWith(": answered"))).toHaveLength(2);
    expect(await watchOnce(deps)).toBe(0);
  });

  test("the request text goes to stdin inside a quoted brief, with how to answer", () => {
    const brief = briefFor(req(3, "Add a CTA; rm -rf / && echo $(whoami)"), site);
    expect(brief).toContain("<request>\nAdd a CTA; rm -rf / && echo $(whoami)\n</request>");
    expect(brief).toContain('requestId "0000000000000003"');
    expect(brief).toContain("do not write the page directly or publish");
  });

  test("an agent that doesn't answer is logged and not retried", async () => {
    const s = fakeSite([req(4)], false);
    const logs: string[] = [];
    const deps = {
      ...s,
      site,
      timeoutMs: 1000,
      log: (m: string) => logs.push(m),
      handled: new Set<string>(),
    };
    await watchOnce(deps);
    await watchOnce(deps);
    expect(s.runs).toHaveLength(1);
    expect(logs.some((l) => l.includes("still open"))).toBe(true);
  });

  test("options: --agent is required, numbers are bounded, other flags pass to the bridge", () => {
    expect(() => parseWatchOptions(["--site", "https://x.dev"])).toThrow(WatchOptionsError);
    expect(() => parseWatchOptions(["--agent", "a", "--interval", "1"])).toThrow("--interval");
    const parsed = parseWatchOptions([
      "--site",
      "https://x.dev",
      "--agent",
      "claude -p",
      "--interval",
      "30",
      "--once",
    ]);
    expect(parsed.options).toEqual({
      agent: "claude -p",
      intervalMs: 30_000,
      timeoutMs: 600_000,
      once: true,
    });
    expect(parsed.rest).toEqual(["--site", "https://x.dev"]);
  });
});
